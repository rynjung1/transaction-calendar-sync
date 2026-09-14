import { describe, expect, it } from "vitest";
import { LEGACY_CATEGORY_ID_TO_PFC_PRIMARY } from "../../lib/legacyCategoryMapping";
import { isPfcPrimaryCategory } from "../../lib/plaidCategories";

describe("LEGACY_CATEGORY_ID_TO_PFC_PRIMARY", () => {
  it("maps every entry to a real, current PFC primary value — a stale/typo'd value here would silently never match any real exclusion", () => {
    for (const [legacyId, pfcPrimary] of Object.entries(LEGACY_CATEGORY_ID_TO_PFC_PRIMARY)) {
      expect(isPfcPrimaryCategory(pfcPrimary), `legacy id ${legacyId} -> "${pfcPrimary}"`).toBe(true);
    }
  });

  it("contains a real, spot-checked entry (Restaurants -> FOOD_AND_DRINK)", () => {
    expect(LEGACY_CATEGORY_ID_TO_PFC_PRIMARY["13005000"]).toBe("FOOD_AND_DRINK");
  });

  it("is the deliberately-incomplete unambiguous subset, not the full 242-entry Plaid mapping — this is by design, not a bug", () => {
    const entryCount = Object.keys(LEGACY_CATEGORY_ID_TO_PFC_PRIMARY).length;
    // 176 of Plaid's 242 published entries are unambiguous at the PFC
    // primary level (verified against Plaid's own published mapping when
    // this file was built) — asserting the exact count catches an
    // accidental bulk edit changing the size without anyone noticing.
    expect(entryCount).toBe(176);
  });
});
