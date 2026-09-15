// Shared currency formatting — previously duplicated (with a real bug) in
// both calendar.ts (formatAmount) and InsightsScreen.tsx (formatCurrency).
// Real, visible accuracy bug found and fixed this session: both defaulted
// to (or hardcoded) "USD" for an app whose one documented market is a
// Canadian bank. Intl.NumberFormat doesn't convert currency, only how it's
// displayed, so no number was ever actually wrong — but every calendar
// event title and every Insights figure showed a plain "$" as if it were US
// dollars. Confirmed the real, visible difference, not assumed cosmetic:
// Intl.NumberFormat("en-US", {currency:"USD"}).format(42.5) -> "$42.50",
// {currency:"CAD"} -> "CA$42.50". Unified here (previously two near-
// identical copies) so there's exactly one place this logic — and this
// default — lives.
export function formatCurrency(amount: number, currency?: string | null): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency ?? "CAD",
    }).format(amount);
  } catch {
    // An unrecognized/malformed ISO currency code makes Intl.NumberFormat
    // throw outright rather than silently ignoring it — a real, if rare,
    // possibility given this value ultimately comes from Plaid/the bank,
    // not something this app controls or validates.
    return `${amount.toFixed(2)} ${currency ?? "CAD"}`.trim();
  }
}
