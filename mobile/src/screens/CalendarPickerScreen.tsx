import { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, Alert, ActivityIndicator, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Calendar, CalendarOff, LockKeyhole } from "lucide-react-native";
import { listWritableCalendars, requestCalendarPermission } from "../lib/calendar";
import type { SelectedCalendar } from "../types";
import { theme } from "../lib/theme";
import { typography } from "../lib/typography";
import { spacing } from "../lib/spacing";

interface Props {
  onSelected: (calendar: SelectedCalendar) => void;
}

export default function CalendarPickerScreen({ onSelected }: Props) {
  const [calendars, setCalendars] = useState<SelectedCalendar[]>([]);
  const [loading, setLoading] = useState(true);
  // Distinct from "loaded zero calendars" — this screen is a required gate
  // in front of the entire app for every single user (App.tsx only shows
  // Home/Insights/Settings once a calendar is chosen), and denying the
  // permission prompt is a completely ordinary thing for a real user to do,
  // not a rare misuse. Previously this rendered the exact same "No writable
  // calendars found on this device" empty state either way — misleading
  // (the real problem is permission, not missing calendars) and a genuine
  // dead end: no retry, no path to Settings, nothing recoverable short of
  // quitting the app, finding Settings unprompted, and relaunching.
  const [permissionDenied, setPermissionDenied] = useState(false);

  // No reliable "is this shared" signal on a calendar from the underlying
  // library (react-native-calendar-events exposes title/source/isPrimary,
  // nothing about sharing) — rather than guess, name the actual calendar and
  // let the user make an informed call every time, since this only ever
  // happens once per calendar choice, not per transaction.
  function confirmAndSelect(calendar: SelectedCalendar) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      `Use "${calendar.title}"?`,
      `Every synced transaction — merchant name and exact amount — becomes an event on this calendar, visible in lock-screen previews and to anyone else with access to it${calendar.source ? ` (${calendar.source})` : ""}.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Use this calendar", onPress: () => onSelected(calendar) },
      ]
    );
  }

  async function checkPermissionAndLoad() {
    setLoading(true);
    const granted = await requestCalendarPermission();
    if (!granted) {
      setPermissionDenied(true);
      setLoading(false);
      return;
    }
    setPermissionDenied(false);
    const found = await listWritableCalendars();
    setCalendars(found);
    setLoading(false);
  }

  useEffect(() => {
    checkPermissionAndLoad();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
      <Text style={styles.title}>Choose a calendar</Text>
      <Text style={styles.subtitle}>Transactions will be added as events on this calendar.</Text>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={theme.textPrimary} />
          <Text style={styles.mutedText}>Loading calendars…</Text>
        </View>
      ) : permissionDenied ? (
        <View style={styles.centerFill}>
          <LockKeyhole size={28} color={theme.textMuted} />
          <Text style={styles.mutedText}>
            Calendar access is off for this app. Turn it on in Settings, then come back here.
          </Text>
          <Pressable
            style={styles.settingsButton}
            onPress={() => Linking.openSettings()}
            accessibilityRole="button"
            accessibilityLabel="Open Settings"
          >
            <Text style={styles.settingsButtonText}>Open Settings</Text>
          </Pressable>
          <Pressable
            onPress={checkPermissionAndLoad}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={calendars}
          keyExtractor={(cal) => cal.id}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => confirmAndSelect(item)} accessibilityRole="button">
              <View style={styles.rowIcon}>
                <Calendar size={18} color={theme.textPrimary} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowSubtitle}>{item.source}</Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.centerFill}>
              <CalendarOff size={28} color={theme.textMuted} />
              <Text style={styles.mutedText}>No writable calendars found on this device.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, backgroundColor: theme.pagePlane },
  title: { ...typography.lg, color: theme.textPrimary },
  subtitle: {
    ...typography.sm,
    fontWeight: "400",
    color: theme.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  centerFill: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  mutedText: { ...typography.sm, fontWeight: "400", color: theme.textMuted, textAlign: "center" },
  settingsButton: {
    backgroundColor: theme.textPrimary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 12,
    marginTop: spacing.sm,
  },
  settingsButtonText: { ...typography.sm, color: theme.pagePlane },
  retryText: { ...typography.sm, color: theme.textMuted, marginTop: spacing.xs },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1 },
  rowTitle: { ...typography.md, color: theme.textPrimary },
  rowSubtitle: { ...typography.xs, color: theme.textMuted, marginTop: 2 },
});
