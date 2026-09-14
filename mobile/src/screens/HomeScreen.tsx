import { useRef, useState } from "react";
import { View, Text, Pressable, FlatList, StyleSheet, Alert, ActivityIndicator, RefreshControl, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { RefreshCw, LogOut, CircleCheck, CircleX, Inbox } from "lucide-react-native";
import { syncTransactions, confirmCalendarEvent } from "../lib/api";
import { createTransactionEvent, removeTransactionEvent } from "../lib/calendar";
import { getErrorMessage } from "../lib/errors";
import { supabase } from "../lib/supabase";
import type { SelectedCalendar, SyncedTransaction } from "../types";
import { theme } from "../lib/theme";
import { typography } from "../lib/typography";
import { spacing } from "../lib/spacing";

// transactionId -> {eventId, calendarId} for a device-side event that was
// created but never successfully confirmed with the backend (e.g. the
// calendar write succeeded, then a network drop or backend hiccup failed the
// confirm call). Without this, the transaction stays "pending" server-side
// forever, and the *next* sync fetches it again and creates a SECOND real
// calendar event for the same real-world transaction — a genuine duplicate,
// not just a retry. Persisting the mapping before attempting to confirm
// means a retry (later in this same loop's next run, or a whole new sync)
// reuses the existing event and just retries the confirm call, instead of
// creating another one.
//
// calendarId is part of the cached entry, not just eventId, because of a
// real seam with the separate "Change calendar" feature: if the user
// switches calendars in the window between a create succeeding and its
// confirm failing, blindly reusing the cached eventId would silently
// re-confirm an event that still lives on the *old* calendar — the
// transaction the user now expects on their newly-chosen calendar would
// stay on the one they explicitly moved away from. Checking the cached
// calendarId against the current selection catches that: on a mismatch, the
// stale event is best-effort cleaned up from the old calendar and a fresh
// one is created on the calendar the user actually picked.
const PENDING_EVENTS_KEY = "pendingCalendarEvents";

interface PendingEvent {
  eventId: string;
  calendarId: string;
}

async function getPendingEventMap(): Promise<Record<string, PendingEvent>> {
  const raw = await AsyncStorage.getItem(PENDING_EVENTS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    // Corrupted local data — same posture as elsewhere in this app: treat as
    // empty rather than let a bad AsyncStorage value break sync entirely.
    return {};
  }
}

async function setPendingEvent(
  map: Record<string, PendingEvent>,
  transactionId: string,
  entry: PendingEvent
) {
  map[transactionId] = entry;
  await AsyncStorage.setItem(PENDING_EVENTS_KEY, JSON.stringify(map));
}

async function clearPendingEvent(map: Record<string, PendingEvent>, transactionId: string) {
  delete map[transactionId];
  await AsyncStorage.setItem(PENDING_EVENTS_KEY, JSON.stringify(map));
}

interface Props {
  calendar: SelectedCalendar;
}

export default function HomeScreen({ calendar }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [hasSynced, setHasSynced] = useState(false);
  const [lastSynced, setLastSynced] = useState<SyncedTransaction[]>([]);
  // Writing each transaction to the calendar is a real per-item round trip,
  // not instant — for more than a couple of transactions "Sync now" turning
  // into a spinner with no feedback for several seconds reads as hung, not
  // busy. Tracked separately from `syncing` since it only applies once
  // there's an actual count to report.
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // The button (disabled={syncing}) and RefreshControl (refreshing={syncing})
  // both gate on the same React state, which updates asynchronously — a
  // pull-to-refresh gesture and a tap on the button in the same instant could
  // both read `syncing` as still false and start concurrently before either
  // re-render lands. A ref is synchronous and checked before either state
  // update, closing that narrow window outright rather than relying on
  // React's render timing.
  const syncInFlight = useRef(false);

  async function handleSync() {
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSyncing(true);
    setProgress(null);
    try {
      const synced: SyncedTransaction[] = [];
      const pendingEvents = await getPendingEventMap();

      // The backend caps how many pending transactions one response returns
      // (a user who hasn't opened the app in a while — an ordinary pattern
      // for a passive spending diary, not misuse — can build up a large
      // backlog just from webhook-driven syncing running the whole time).
      // Loop until it reports no more, rather than assume one response is
      // everything; `total` (the real count across all pages, not just this
      // batch) drives the progress indicator so it reads correctly across
      // the whole operation instead of resetting per page.
      let hasMore = true;
      let total = 0;
      while (hasMore) {
        const response = await syncTransactions();
        total = Math.max(total, response.total);
        let pageSucceeded = 0;

        for (const txn of response.transactions) {
          try {
            // Reuse an already-created-but-unconfirmed event for this exact
            // transaction if one exists — but only if it's still on the
            // calendar currently selected. A cached entry from a since-
            // abandoned calendar (see the type's own comment above) is
            // cleaned up best-effort and treated as if nothing were cached.
            const cached = pendingEvents[txn.id];
            let eventId = cached?.calendarId === calendar.id ? cached.eventId : undefined;
            if (!eventId) {
              if (cached) {
                await removeTransactionEvent(cached.eventId);
              }
              eventId = await createTransactionEvent(calendar.id, txn);
              await setPendingEvent(pendingEvents, txn.id, { eventId, calendarId: calendar.id });
            }
            await confirmCalendarEvent(txn.id, eventId);
            await clearPendingEvent(pendingEvents, txn.id);
            synced.push({ ...txn, calendarEventId: eventId, status: "synced" });
            pageSucceeded++;
          } catch (err) {
            synced.push({ ...txn, status: "failed" });
          }
          setProgress({ done: synced.length, total });
        }

        // A transaction only leaves "pending" on a successful confirm — so a
        // page where every single one failed (e.g. calendar access revoked
        // mid-sync) would come back completely unchanged on the next fetch,
        // looping on the exact same stuck page forever. Bail once nothing
        // in a full page could be confirmed; retrying within the same
        // session can't help if the underlying cause hasn't changed, and
        // whatever's still pending is picked up by the next sync attempt.
        hasMore = response.hasMore && (pageSucceeded > 0 || response.transactions.length === 0);
      }

      setLastSynced(synced);
      setHasSynced(true);

      // Honest feedback about partial failure, not a blanket "Success" no
      // matter what happened — a user with 2 of 10 events missing from their
      // calendar should be told plainly, not just left to notice on their own.
      const failedCount = synced.filter((s) => s.status === "failed").length;
      if (synced.length === 0) {
        // Nothing to do — no haptic, the empty state already says so.
      } else if (failedCount === 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (failedCount === synced.length) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        // Every single one failing mid-use (as opposed to at initial setup,
        // where CalendarPickerScreen handles this) is consistent with
        // calendar access having been revoked in Settings after the fact —
        // same recovery action as that screen already offers, not just a
        // generic "check your permissions" with no way to act on it here.
        Alert.alert(
          "Couldn't add to calendar",
          "None of your transactions could be added. This can happen if calendar access was turned off in Settings.",
          [
            { text: "Not now", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ]
        );
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert(
          "Some transactions didn't sync",
          `${failedCount} of ${synced.length} couldn't be added to your calendar. You can try syncing again.`
        );
      }
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Sync failed", getErrorMessage(err));
    } finally {
      syncInFlight.current = false;
      setSyncing(false);
      setProgress(null);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <Text style={styles.title}>Syncing to: {calendar.title}</Text>

      <Pressable
        style={[styles.syncButton, syncing && styles.syncButtonDisabled]}
        onPress={handleSync}
        disabled={syncing}
        accessibilityRole="button"
        accessibilityLabel="Sync now"
      >
        {syncing ? (
          <>
            <ActivityIndicator color={theme.pagePlane} />
            {progress && progress.total > 1 && (
              <Text style={styles.syncButtonText}>
                Syncing {progress.done} of {progress.total}…
              </Text>
            )}
          </>
        ) : (
          <>
            <RefreshCw size={16} color={theme.pagePlane} />
            <Text style={styles.syncButtonText}>Sync now</Text>
          </>
        )}
      </Pressable>

      <FlatList
        style={styles.list}
        data={lastSynced}
        keyExtractor={(txn) => txn.id}
        refreshControl={
          <RefreshControl refreshing={syncing} onRefresh={handleSync} tintColor={theme.textPrimary} />
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            {item.status === "synced" ? (
              <CircleCheck size={18} color={theme.statusGood} />
            ) : (
              <CircleX size={18} color={theme.textMuted} />
            )}
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{item.merchantName}</Text>
              <Text style={styles.rowSubtitle}>
                {item.status === "synced" ? "Added to calendar" : "Failed to add"}
              </Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Inbox size={28} color={theme.textMuted} />
            <Text style={styles.emptyTitle}>
              {hasSynced ? "No new transactions" : "No transactions yet"}
            </Text>
            <Text style={styles.emptySubtitle}>
              {hasSynced
                ? "You're all caught up — nothing new since last sync."
                : "Tap Sync now to pull in your latest transactions."}
            </Text>
          </View>
        }
      />

      <Pressable
        style={styles.signOutButton}
        onPress={() => supabase.auth.signOut()}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <LogOut size={16} color={theme.textMuted} />
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, gap: spacing.md, backgroundColor: theme.pagePlane },
  title: { ...typography.lg, color: theme.textPrimary },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: theme.textPrimary,
    paddingVertical: spacing.md,
    borderRadius: 12,
  },
  syncButtonDisabled: { opacity: 0.7 },
  syncButtonText: { ...typography.sm, color: theme.pagePlane },
  list: { flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  rowText: { flex: 1 },
  rowTitle: { ...typography.md, color: theme.textPrimary },
  rowSubtitle: { ...typography.xs, color: theme.textMuted, marginTop: 2 },
  emptyState: { alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.xl },
  emptyTitle: { ...typography.md, color: theme.textSecondary },
  emptySubtitle: {
    ...typography.sm,
    fontWeight: "400",
    color: theme.textMuted,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  signOutButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs },
  signOutText: { ...typography.sm, color: theme.textMuted },
});
