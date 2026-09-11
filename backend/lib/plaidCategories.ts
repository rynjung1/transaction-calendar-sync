// Plaid's Personal Finance Category (PFC) `primary` taxonomy. Hardcoded
// because Plaid doesn't expose this as a fetchable list independent of live
// transaction data — this is the single source of truth for valid
// excluded_categories values; both the sync-filters GET/PATCH endpoint and
// its validation import from here, and mobile fetches the list from that
// GET rather than holding its own copy.
//
// This is pinned to Plaid's *current* PFC taxonomy as of when this file was
// written. If Plaid adds a category, users can't exclude it until this list
// is updated and redeployed — see the CLAUDE.md note on this limitation.
export const PFC_PRIMARY_CATEGORIES = [
  "INCOME",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "LOAN_PAYMENTS",
  "BANK_FEES",
  "ENTERTAINMENT",
  "FOOD_AND_DRINK",
  "GENERAL_MERCHANDISE",
  "HOME_IMPROVEMENT",
  "MEDICAL",
  "PERSONAL_CARE",
  "GENERAL_SERVICES",
  "GOVERNMENT_AND_NON_PROFIT",
  "TRANSPORTATION",
  "TRAVEL",
  "RENT_AND_UTILITIES",
] as const;

export type PfcPrimaryCategory = (typeof PFC_PRIMARY_CATEGORIES)[number];

export function isPfcPrimaryCategory(value: unknown): value is PfcPrimaryCategory {
  return typeof value === "string" && PFC_PRIMARY_CATEGORIES.some((c) => c === value);
}
