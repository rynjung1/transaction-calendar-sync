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
const CATEGORY_MAP: Record<string, CategorySpec> = {
  FOOD_AND_DRINK: { label: "Food & Drink", color: "#3987e5" },
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
