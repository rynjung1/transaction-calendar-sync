import { describe, expect, it } from "vitest";
import { isPfcPrimaryCategory, PFC_PRIMARY_CATEGORIES } from "../../lib/plaidCategories";

describe("isPfcPrimaryCategory", () => {
  it("accepts every value in the real list", () => {
    for (const category of PFC_PRIMARY_CATEGORIES) {
      expect(isPfcPrimaryCategory(category)).toBe(true);
    }
  });

  it("rejects a category that isn't in the list", () => {
    expect(isPfcPrimaryCategory("NOT_A_REAL_CATEGORY")).toBe(false);
  });

  it("rejects non-string values rather than throwing", () => {
    expect(isPfcPrimaryCategory(null)).toBe(false);
    expect(isPfcPrimaryCategory(undefined)).toBe(false);
    expect(isPfcPrimaryCategory(123)).toBe(false);
    expect(isPfcPrimaryCategory({ primary: "FOOD_AND_DRINK" })).toBe(false);
  });

  it("is case-sensitive — Plaid's own values are all upper-case", () => {
    expect(isPfcPrimaryCategory("food_and_drink")).toBe(false);
  });
});
