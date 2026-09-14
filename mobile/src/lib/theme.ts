// Dark palette for the Insights screen, taken from the project's validated
// data-viz palette (8-hue categorical set, dark-mode steps) — see
// scripts/validate_palette.js in the dataviz skill for the CVD/contrast run
// this passed. Colors are assigned by fixed identity (category -> hue),
// never re-ranked by that month's spend, so a category's color never changes.

export const theme = {
  pagePlane: "#0d0d0d",
  surface: "#1a1a19",
  textPrimary: "#ffffff",
  textSecondary: "#c3c2b7",
  textMuted: "#898781",
  gridline: "#2c2c2a",
  baseline: "#383835",
  border: "rgba(255,255,255,0.10)",
  statusGood: "#0ca30c",
  statusDanger: "#e5484d",
  seriesBlue: "#3987e5",
};

export interface CategorySpec {
  label: string;
  color: string;
}

// Fixed mapping: 7 real categories on the validated 8-hue set (minus the
// blue slot, reserved for the single-series daily bar chart) plus a neutral
// "Other" bucket for every category outside this set. Keeping this fixed
// (rather than assigning colors by each month's top-N) is what keeps a
// category's color stable across months.
//
// FOOD_AND_DRINK was previously assigned slot 1 (blue, #3987e5) — the exact
// same hex as theme.seriesBlue, i.e. the reserved bar-chart color — leaving
// slot 8 (red) validated but unused. A user with Food & Drink spending saw
// its legend swatch and every daily bar in the identical color on the same
// screen. Fixed by using the correct slot.
//
// Known, accepted limitation: the dataviz skill's reference palette only
// validates all-pairs CVD-safety for its first 3 slots — past that it
// documents folding extra categories into "Other" rather than trying to make
// more slots mutually distinguishable. This screen sorts categories by spend
// amount (data-dependent order), so any two of these 7 can end up adjacent —
// meaning full all-pairs safety would apply, and this set doesn't clear it
// (confirmed with the real validator: e.g. magenta vs aqua, a pre-existing
// issue independent of the fix above). Shipping anyway — every legend row
// already pairs its swatch with a text label, so color is never the only
// signal — rather than reduce to ~3 categories + "Other" today. Revisit if
// this becomes an issue in practice.
const CATEGORY_MAP: Record<string, CategorySpec> = {
  FOOD_AND_DRINK: { label: "Food & Drink", color: "#e66767" },
  TRANSPORTATION: { label: "Transportation", color: "#d95926" },
  GENERAL_MERCHANDISE: { label: "Shopping", color: "#199e70" },
  RENT_AND_UTILITIES: { label: "Rent & Utilities", color: "#c98500" },
  ENTERTAINMENT: { label: "Entertainment", color: "#d55181" },
  MEDICAL: { label: "Medical", color: "#008300" },
  GENERAL_SERVICES: { label: "Services", color: "#9085e9" },
};

const OTHER: CategorySpec = { label: "Other", color: theme.textMuted };

export function categorySpec(category: string | null): CategorySpec {
  if (!category) return OTHER;
  return CATEGORY_MAP[category] ?? OTHER;
}
