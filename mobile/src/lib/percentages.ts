// Extracted from InsightsScreen.tsx so it's testable without importing
// React Native — verified correct via a real script before this was ever
// wired into a test file (see the .test.ts alongside this), not assumed
// from the algorithm description alone.

// Rounds a set of amounts to whole-number percentages that sum to exactly
// 100 (largest-remainder method) — rounding each share independently, as
// Math.round(share) does, can land the set on 99 or 101 even though the
// underlying exact shares always sum to 100.
export function roundPercentagesToSum100(amounts: number[]): number[] {
  const total = amounts.reduce((sum, a) => sum + a, 0);
  if (total <= 0) return amounts.map(() => 0);

  const exact = amounts.map((a) => (a / total) * 100);
  const floors = exact.map(Math.floor);
  let remainder = 100 - floors.reduce((sum, f) => sum + f, 0);

  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floors];
  for (let i = 0; i < remainder; i++) {
    result[order[i].index] += 1;
  }
  return result;
}
