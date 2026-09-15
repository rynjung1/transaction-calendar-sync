import { describe, expect, it } from "vitest";
import { categorySpec, theme } from "./theme";

describe("categorySpec", () => {
  it("returns a real spec for a mapped category", () => {
    expect(categorySpec("FOOD_AND_DRINK")).toEqual({ label: "Food & Drink", color: "#e66767" });
  });

  it("falls back to 'Other' for null", () => {
    expect(categorySpec(null).label).toBe("Other");
  });

  it("falls back to 'Other' for a category outside the 7 mapped ones (e.g. INCOME)", () => {
    // Deliberate design decision, not a gap: only 7 of the 16 real PFC
    // primary categories get a distinct color; the rest fold into "Other".
    expect(categorySpec("INCOME").label).toBe("Other");
  });

  it("falls back to 'Other' for a genuinely unknown/malformed category string", () => {
    expect(categorySpec("NOT_A_REAL_CATEGORY").label).toBe("Other");
  });

  it("never assigns FOOD_AND_DRINK the same color as the reserved bar-chart blue", () => {
    // The exact bug fixed this session — FOOD_AND_DRINK used to collide
    // with theme.seriesBlue.
    expect(categorySpec("FOOD_AND_DRINK").color).not.toBe(theme.seriesBlue);
  });
});
