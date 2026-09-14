import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Inbox } from "lucide-react-native";
import { BarChart } from "react-native-gifted-charts";
import { getMonthlyTransactions } from "../lib/api";
import { categorySpec, theme } from "../lib/theme";
import { typography } from "../lib/typography";
import { spacing } from "../lib/spacing";
import type { MonthlyTransaction } from "../types";
import { getErrorMessage } from "../lib/errors";

function monthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return new Date(Date.UTC(year, mon - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(month: string): number {
  const [year, mon] = month.split("-").map(Number);
  return new Date(Date.UTC(year, mon, 0)).getUTCDate();
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function formatDayHeading(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

// Rounds a set of amounts to whole-number percentages that sum to exactly
// 100 (largest-remainder method) — rounding each share independently, as
// Math.round(share) does, can land the set on 99 or 101 even though the
// underlying exact shares always sum to 100.
function roundPercentagesToSum100(amounts: number[]): number[] {
  const total = amounts.reduce((sum, a) => sum + a, 0);
  if (total <= 0) return amounts.map(() => 0);

  const exact = amounts.map((a) => (a / total) * 100);
  const floors = exact.map(Math.floor);
  let remainder = 100 - floors.reduce((sum, f) => sum + f, 0);

  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floors];
  for (let i = 0; i < remainder; i++) {
    result[order[i].index] += 1;
  }
  return result;
}

export default function InsightsScreen() {
  const [month, setMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<MonthlyTransaction[]>([]);
  const [previousMonthTotal, setPreviousMonthTotal] = useState(0);

  // A request-token guard, not just the effect's own `cancelled` flag — that
  // flag only ever protected `loading`/`error`, never the actual
  // `setTransactions`/`setPreviousMonthTotal` calls below, since those ran
  // unconditionally inside `fetchMonth` itself. Two fetches can race for real:
  // changing months quickly re-fires the effect while an older request for a
  // previous month is still in flight, and pull-to-refresh calls `fetchMonth`
  // independently of the effect entirely. Whichever response happened to
  // resolve *last* would win and overwrite the screen with stale data,
  // regardless of which month is actually selected by then. Tagging every
  // call with an incrementing id and only applying a response if no newer
  // call has started since fixes both call sites at once.
  const latestRequestId = useRef(0);

  // The caller increments and captures the request id *synchronously*,
  // before the request starts, and passes it in — a single point of
  // increment, so there's never a gap where a caller doesn't yet know which
  // id its own call is using (which a "fetchMonth returns its id" design
  // would have: if the request rejects, a .then(id => ...) handler never
  // runs, so the id would be unknown in .catch exactly when staleness
  // matters most).
  async function fetchMonth(m: string, requestId: number) {
    const res = await getMonthlyTransactions(m);
    if (requestId === latestRequestId.current) {
      setTransactions(res.transactions);
      setPreviousMonthTotal(res.previousMonthTotal);
    }
  }

  useEffect(() => {
    setLoading(true);
    setError(null);
    const requestId = ++latestRequestId.current;
    fetchMonth(month, requestId)
      .catch((err) => {
        if (requestId === latestRequestId.current) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (requestId === latestRequestId.current) setLoading(false);
      });
  }, [month]);

  async function handleRefresh() {
    setRefreshing(true);
    const requestId = ++latestRequestId.current;
    try {
      await fetchMonth(month, requestId);
      if (requestId === latestRequestId.current) setError(null);
    } catch (err) {
      if (requestId === latestRequestId.current) setError(getErrorMessage(err));
    } finally {
      if (requestId === latestRequestId.current) setRefreshing(false);
    }
  }

  const summary = useMemo(() => {
    const expenses = transactions.filter((t) => t.amount > 0);
    const income = transactions.filter((t) => t.amount < 0);

    const totalSpend = expenses.reduce((sum, t) => sum + t.amount, 0);
    const totalIncome = income.reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const isCurrentMonth = month === currentMonth();
    const totalDays = daysInMonth(month);
    const daysForAverage = isCurrentMonth ? new Date().getUTCDate() : totalDays;
    const avgPerDay = totalSpend / Math.max(daysForAverage, 1);

    const pctChange =
      previousMonthTotal > 0 ? ((totalSpend - previousMonthTotal) / previousMonthTotal) * 100 : null;

    const byDay = new Map<number, number>();
    for (const t of expenses) {
      const day = Number(t.date.split("-")[2]);
      byDay.set(day, (byDay.get(day) ?? 0) + t.amount);
    }

    const screenWidth = Dimensions.get("window").width;
    const usableWidth = screenWidth - 48;
    const barWidth = Math.max(4, Math.floor(usableWidth / totalDays) - 4);
    const barSpacing = Math.max(2, Math.floor(usableWidth / totalDays) - barWidth);

    const barData = Array.from({ length: totalDays }, (_, i) => {
      const day = i + 1;
      return {
        value: byDay.get(day) ?? 0,
        label: day === 1 || day % 5 === 0 ? String(day) : "",
        frontColor: theme.seriesBlue,
        barWidth,
        spacing: barSpacing,
      };
    });

    const categoryTotals = new Map<string, { label: string; color: string; amount: number }>();
    for (const t of expenses) {
      const spec = categorySpec(t.category);
      const existing = categoryTotals.get(spec.label);
      categoryTotals.set(spec.label, {
        label: spec.label,
        color: spec.color,
        amount: (existing?.amount ?? 0) + t.amount,
      });
    }
    const sortedCategories = Array.from(categoryTotals.values()).sort((a, b) => b.amount - a.amount);
    const roundedPcts = roundPercentagesToSum100(sortedCategories.map((c) => c.amount));
    const categoryBreakdown = sortedCategories.map((cat, i) => ({ ...cat, pct: roundedPcts[i] }));

    const byDate = new Map<string, MonthlyTransaction[]>();
    for (const t of transactions) {
      const list = byDate.get(t.date) ?? [];
      list.push(t);
      byDate.set(t.date, list);
    }
    const dayGroups = Array.from(byDate.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));

    return {
      totalSpend,
      totalIncome,
      avgPerDay,
      pctChange,
      barData,
      categoryBreakdown,
      dayGroups,
    };
  }, [transactions, month, previousMonthTotal]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.monthRow}>
        <Pressable
          onPress={() => setMonth((m) => shiftMonth(m, -1))}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <Text style={styles.monthArrow}>‹</Text>
        </Pressable>
        <Text style={styles.monthLabel}>{monthLabel(month)}</Text>
        <Pressable
          onPress={() => setMonth((m) => shiftMonth(m, 1))}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <Text style={styles.monthArrow}>›</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.textPrimary} style={{ marginTop: spacing.xl }} />
      ) : error ? (
        <ScrollView
          contentContainerStyle={styles.scrollContentCentered}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.textPrimary} />
          }
        >
          <Text style={styles.errorText}>{error}</Text>
        </ScrollView>
      ) : transactions.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.scrollContentCentered}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.textPrimary} />
          }
        >
          <View style={styles.emptyState}>
            <Inbox size={28} color={theme.textMuted} />
            <Text style={styles.emptyTitle}>No transactions in {monthLabel(month)}</Text>
            <Text style={styles.emptySubtitle}>Nothing synced for this month yet.</Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.textPrimary} />
          }
        >
          <View style={styles.statTile}>
            <Text style={styles.statLabel}>Total spend</Text>
            <Text style={styles.statValue}>{formatCurrency(summary.totalSpend)}</Text>
            {summary.pctChange !== null && (
              <Text
                style={[
                  styles.statDelta,
                  { color: summary.pctChange <= 0 ? theme.statusGood : theme.textSecondary },
                ]}
              >
                {summary.pctChange > 0 ? "+" : ""}
                {summary.pctChange.toFixed(1)}% vs last month
              </Text>
            )}
          </View>

          <View style={styles.statTile}>
            <Text style={styles.statLabel}>Spent per day</Text>
            <Text style={styles.statValue}>{formatCurrency(summary.avgPerDay)}</Text>
          </View>

          <View style={styles.cardRow}>
            <View style={[styles.card, { marginRight: spacing.sm }]}>
              <Text style={styles.statLabel}>Income</Text>
              <Text style={[styles.cardValue, { color: theme.statusGood }]}>
                {formatCurrency(summary.totalIncome)}
              </Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.statLabel}>Expenses</Text>
              <Text style={styles.cardValue}>{formatCurrency(summary.totalSpend)}</Text>
            </View>
          </View>

          <View style={styles.chartCard}>
            <BarChart
              data={summary.barData}
              height={180}
              noOfSections={4}
              yAxisTextStyle={{ color: theme.textMuted, fontSize: typography.xs.fontSize }}
              xAxisLabelTextStyle={{ color: theme.textMuted, fontSize: typography.xs.fontSize }}
              labelWidth={24}
              xAxisTextNumberOfLines={1}
              rulesColor={theme.gridline}
              yAxisColor={theme.baseline}
              xAxisColor={theme.baseline}
              showReferenceLine1
              referenceLine1Position={summary.avgPerDay}
              referenceLine1Config={{
                color: theme.textMuted,
                dashWidth: 4,
                dashGap: 4,
                thickness: 1,
                labelText: "Avg",
                labelTextStyle: { color: theme.textMuted, fontSize: typography.xs.fontSize },
              }}
              roundedTop
              barBorderRadius={4}
              hideRules={false}
              backgroundColor={theme.surface}
            />
          </View>

          <View style={styles.chartCard}>
            <Text style={styles.sectionTitle}>Categories</Text>
            {summary.categoryBreakdown.length === 0 ? (
              <Text style={styles.mutedText}>No spending this month.</Text>
            ) : (
              summary.categoryBreakdown.map((cat) => (
                <View key={cat.label} style={styles.legendRow}>
                  <View style={[styles.legendSwatch, { backgroundColor: cat.color }]} />
                  <Text style={styles.legendLabel}>{cat.label}</Text>
                  <Text style={styles.legendPct}>{cat.pct}%</Text>
                  <Text style={styles.legendAmount}>{formatCurrency(cat.amount)}</Text>
                </View>
              ))
            )}
          </View>

          {summary.dayGroups.map(([date, txns]) => (
            <View key={date} style={styles.dayGroup}>
              <Text style={styles.dayHeading}>{formatDayHeading(date)}</Text>
              {txns.map((txn) => (
                <View key={txn.id} style={styles.txnRow}>
                  <View
                    style={[styles.legendSwatch, { backgroundColor: categorySpec(txn.category).color }]}
                  />
                  <Text style={styles.txnMerchant}>{txn.merchantName}</Text>
                  <Text
                    style={[
                      styles.txnAmount,
                      { color: txn.amount < 0 ? theme.statusGood : theme.textPrimary },
                    ]}
                  >
                    {txn.amount < 0 ? "+" : "-"}
                    {formatCurrency(Math.abs(txn.amount))}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.pagePlane },
  scrollContent: { padding: spacing.md, paddingBottom: spacing.xl },
  scrollContentCentered: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: theme.pagePlane,
  },
  monthArrow: { color: theme.textPrimary, fontSize: 24, paddingHorizontal: spacing.sm },
  monthLabel: { ...typography.md, fontWeight: "600", color: theme.textPrimary, minWidth: 160, textAlign: "center" },
  errorText: { ...typography.sm, fontWeight: "400", color: theme.textSecondary, textAlign: "center" },
  emptyState: { alignItems: "center", justifyContent: "center", gap: spacing.sm },
  emptyTitle: { ...typography.md, color: theme.textSecondary, textAlign: "center" },
  emptySubtitle: { ...typography.sm, fontWeight: "400", color: theme.textMuted, textAlign: "center" },
  statTile: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  statLabel: { ...typography.xs, color: theme.textSecondary, marginBottom: spacing.xs },
  statValue: { ...typography.xl, color: theme.textPrimary },
  statDelta: { ...typography.xs, marginTop: spacing.xs },
  cardRow: { flexDirection: "row", marginBottom: spacing.md },
  card: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  cardValue: { ...typography.lg, color: theme.textPrimary },
  chartCard: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  sectionTitle: { ...typography.md, fontWeight: "600", color: theme.textPrimary, marginBottom: spacing.md },
  mutedText: { ...typography.xs, color: theme.textMuted },
  legendRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.xs },
  legendSwatch: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  legendLabel: { ...typography.sm, fontWeight: "400", color: theme.textPrimary, flex: 1 },
  legendPct: { ...typography.xs, color: theme.textSecondary, width: 40, textAlign: "right" },
  legendAmount: { ...typography.xs, color: theme.textSecondary, width: 72, textAlign: "right" },
  dayGroup: { marginBottom: spacing.md },
  dayHeading: { ...typography.xs, color: theme.textSecondary, marginBottom: spacing.sm },
  txnRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  txnMerchant: { ...typography.md, color: theme.textPrimary, flex: 1 },
  txnAmount: { ...typography.sm, color: theme.textPrimary },
});
