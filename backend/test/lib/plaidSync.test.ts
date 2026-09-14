import { describe, expect, it } from "vitest";
import { shouldSyncTransaction, type SyncFilters } from "../../lib/plaidSync";

// Minimal shape matching what shouldSyncTransaction actually reads off a
// Plaid transaction — cast through `any` at the call site rather than
// pulling in the full Plaid SDK transaction type for a handful of fields.
function txn(overrides: Record<string, unknown>) {
  return {
    transaction_id: "t1",
    amount: 0,
    personal_finance_category: null,
    category_id: null,
    category: null,
    ...overrides,
  } as Parameters<typeof shouldSyncTransaction>[0];
}

const noFilters: SyncFilters = { min_amount: 0, excluded_categories: [] };

describe("shouldSyncTransaction", () => {
  it("excludes an outgoing charge below the minimum amount", () => {
    const filters: SyncFilters = { min_amount: 10, excluded_categories: [] };
    expect(shouldSyncTransaction(txn({ amount: 5 }), filters)).toBe(false);
  });

  it("never filters a refund/income (amount <= 0) on amount, regardless of the minimum", () => {
    const filters: SyncFilters = { min_amount: 1000, excluded_categories: [] };
    expect(shouldSyncTransaction(txn({ amount: -50 }), filters)).toBe(true);
    expect(shouldSyncTransaction(txn({ amount: 0 }), filters)).toBe(true);
  });

  it("includes a charge at or above the minimum amount", () => {
    const filters: SyncFilters = { min_amount: 10, excluded_categories: [] };
    expect(shouldSyncTransaction(txn({ amount: 10 }), filters)).toBe(true);
    expect(shouldSyncTransaction(txn({ amount: 25 }), filters)).toBe(true);
  });

  it("excludes a transaction whose real PFC category is in excluded_categories", () => {
    const filters: SyncFilters = { min_amount: 0, excluded_categories: ["FOOD_AND_DRINK"] };
    const t = txn({ amount: 20, personal_finance_category: { primary: "FOOD_AND_DRINK" } });
    expect(shouldSyncTransaction(t, filters)).toBe(false);
  });

  it("includes a transaction whose PFC category is not excluded", () => {
    const filters: SyncFilters = { min_amount: 0, excluded_categories: ["FOOD_AND_DRINK"] };
    const t = txn({ amount: 20, personal_finance_category: { primary: "TRANSPORTATION" } });
    expect(shouldSyncTransaction(t, filters)).toBe(true);
  });

  // The second, real fix this session (the first attempt was proven to
  // change nothing) — a transaction with no PFC enrichment falls back to
  // the legacy category_id -> PFC mapping for the unambiguous cases.
  it("falls back to the legacy category_id mapping when there's no PFC enrichment", () => {
    const filters: SyncFilters = { min_amount: 0, excluded_categories: ["FOOD_AND_DRINK"] };
    // 13005000 is Plaid's legacy "Restaurants" id, unambiguously FOOD_AND_DRINK.
    const t = txn({ amount: 20, personal_finance_category: null, category_id: "13005000" });
    expect(shouldSyncTransaction(t, filters)).toBe(false);
  });

  it("can't exclude by category when category_id has no unambiguous PFC mapping and there's no PFC enrichment", () => {
    const filters: SyncFilters = { min_amount: 0, excluded_categories: ["FOOD_AND_DRINK"] };
    const t = txn({ amount: 20, personal_finance_category: null, category_id: "not-a-real-id" });
    expect(shouldSyncTransaction(t, filters)).toBe(true);
  });

  it("applies both filters together — amount passes but category excludes", () => {
    const filters: SyncFilters = { min_amount: 5, excluded_categories: ["FOOD_AND_DRINK"] };
    const t = txn({ amount: 20, personal_finance_category: { primary: "FOOD_AND_DRINK" } });
    expect(shouldSyncTransaction(t, filters)).toBe(false);
  });

  it("with no filters configured, includes everything except sub-zero-minimum edge cases", () => {
    expect(shouldSyncTransaction(txn({ amount: 1000000 }), noFilters)).toBe(true);
  });
});
