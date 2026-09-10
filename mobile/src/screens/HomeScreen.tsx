import { useState } from "react";
import { View, Text, Pressable, FlatList, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { RefreshCw, LogOut, CircleCheck, CircleX, Inbox } from "lucide-react-native";
import { syncTransactions, confirmCalendarEvent } from "../lib/api";
import { createTransactionEvent } from "../lib/calendar";
import { supabase } from "../lib/supabase";
import type { SelectedCalendar, SyncedTransaction } from "../types";
import { theme } from "../lib/theme";
import { typography } from "../lib/typography";
import { spacing } from "../lib/spacing";

interface Props {
  calendar: SelectedCalendar;
}

export default function HomeScreen({ calendar }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [hasSynced, setHasSynced] = useState(false);
  const [lastSynced, setLastSynced] = useState<SyncedTransaction[]>([]);

  async function handleSync() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSyncing(true);
    try {
      const { transactions } = await syncTransactions();
      const synced: SyncedTransaction[] = [];

      for (const txn of transactions) {
        try {
          const eventId = await createTransactionEvent(calendar.id, txn);
          await confirmCalendarEvent(txn.id, eventId);
          synced.push({ ...txn, calendarEventId: eventId, status: "synced" });
        } catch (err) {
          synced.push({ ...txn, status: "failed" });
        }
      }

      setLastSynced(synced);
      setHasSynced(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Sync failed", String(err));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <Text style={styles.title}>Syncing to: {calendar.title}</Text>

      <Pressable
        style={[styles.syncButton, syncing && styles.syncButtonDisabled]}
        onPress={handleSync}
        disabled={syncing}
      >
        {syncing ? (
          <ActivityIndicator color={theme.pagePlane} />
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

      <Pressable style={styles.signOutButton} onPress={() => supabase.auth.signOut()}>
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
