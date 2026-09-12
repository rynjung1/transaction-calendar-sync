import { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Calendar, CalendarOff } from "lucide-react-native";
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

  // No reliable "is this shared" signal on a calendar from the underlying
  // library (react-native-calendar-events exposes title/source/isPrimary,
  // nothing about sharing) — rather than guess, name the actual calendar and
  // let the user make an informed call every time, since this only ever
  // happens once per calendar choice, not per transaction.
  function confirmAndSelect(calendar: SelectedCalendar) {
    Alert.alert(
      `Use "${calendar.title}"?`,
      `Every synced transaction — merchant name and exact amount — becomes an event on this calendar, visible in lock-screen previews and to anyone else with access to it${calendar.source ? ` (${calendar.source})` : ""}.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Use this calendar", onPress: () => onSelected(calendar) },
      ]
    );
  }

  useEffect(() => {
    (async () => {
      const granted = await requestCalendarPermission();
      if (!granted) {
        Alert.alert(
          "Calendar access needed",
          "Grant calendar access in Settings to choose where transactions get synced."
        );
        setLoading(false);
        return;
      }
      const found = await listWritableCalendars();
      setCalendars(found);
      setLoading(false);
    })();
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
      ) : (
        <FlatList
          data={calendars}
          keyExtractor={(cal) => cal.id}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => confirmAndSelect(item)}>
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
  centerFill: { alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.xl },
  mutedText: { ...typography.sm, fontWeight: "400", color: theme.textMuted, textAlign: "center" },
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
