import type { TextStyle } from "react-native";

// One type scale, shared across every screen. Sizes/weights are fixed roles,
// not picked per-screen — pair with a text color token from theme.ts.
export const typography: Record<string, TextStyle> = {
  xl: { fontSize: 28, fontWeight: "700" }, // hero numbers (stat tiles)
  lg: { fontSize: 20, fontWeight: "600" }, // screen/section titles
  md: { fontSize: 16, fontWeight: "400" }, // body text, inputs
  sm: { fontSize: 14, fontWeight: "500" }, // secondary text, buttons
  xs: { fontSize: 12, fontWeight: "400" }, // captions, meta, legend
};
