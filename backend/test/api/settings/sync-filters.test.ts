import { describe, expect, it } from "vitest";
import { validateSyncFilters } from "../../../api/settings/sync-filters";

describe("validateSyncFilters", () => {
  it("accepts a well-formed body", () => {
    const result = validateSyncFilters({ min_amount: 25, excluded_categories: ["FOOD_AND_DRINK"] });
    expect(result).toEqual({
      ok: true,
      filters: { min_amount: 25, excluded_categories: ["FOOD_AND_DRINK"] },
    });
  });

  it("accepts a zero minimum and an empty exclusion list", () => {
    const result = validateSyncFilters({ min_amount: 0, excluded_categories: [] });
    expect(result.ok).toBe(true);
  });

  it("rejects a non-object body", () => {
    expect(validateSyncFilters(null).ok).toBe(false);
    expect(validateSyncFilters("a string").ok).toBe(false);
    expect(validateSyncFilters([1, 2, 3]).ok).toBe(false);
  });

  it("rejects a non-numeric or non-finite min_amount rather than doing the wrong thing with a naive comparison", () => {
    // The whole point of validating type before comparing — a naive
    // `value >= 0` on a string/null/boolean does the wrong thing in JS.
    expect(validateSyncFilters({ min_amount: "50", excluded_categories: [] }).ok).toBe(false);
    expect(validateSyncFilters({ min_amount: null, excluded_categories: [] }).ok).toBe(false);
    expect(validateSyncFilters({ min_amount: NaN, excluded_categories: [] }).ok).toBe(false);
    expect(validateSyncFilters({ min_amount: Infinity, excluded_categories: [] }).ok).toBe(false);
  });

  it("rejects a negative min_amount or one above the max", () => {
    expect(validateSyncFilters({ min_amount: -1, excluded_categories: [] }).ok).toBe(false);
    expect(validateSyncFilters({ min_amount: 1_000_001, excluded_categories: [] }).ok).toBe(false);
  });

  it("rejects excluded_categories that isn't an array", () => {
    expect(validateSyncFilters({ min_amount: 0, excluded_categories: "FOOD_AND_DRINK" }).ok).toBe(
      false
    );
  });

  it("rejects any category not in the real PFC primary list — this is what stops the taxonomy gap from ever recurring", () => {
    const result = validateSyncFilters({ min_amount: 0, excluded_categories: ["NOT_A_REAL_CATEGORY"] });
    expect(result.ok).toBe(false);
  });
});
