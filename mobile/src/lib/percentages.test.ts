import { describe, expect, it } from "vitest";
import { roundPercentagesToSum100 } from "./percentages";

// Verified with a real script before this was ever wired into a proper test
// — every case here reproduces that same verification.
describe("roundPercentagesToSum100", () => {
  it("always sums to exactly 100, across a range of real shapes", () => {
    const cases = [
      [10, 10, 10],
      [1, 1, 1, 1, 1, 1, 1],
      [100],
      [0.01, 99.99],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      [33.33, 33.33, 33.34],
    ];
    for (const amounts of cases) {
      const result = roundPercentagesToSum100(amounts);
      expect(result.reduce((sum, n) => sum + n, 0)).toBe(100);
    }
  });

  it("gives the larger remainder priority (largest-remainder method), not naive rounding", () => {
    // Naive Math.round on exact shares of [10,10,10] -> [33,33,33] = 99, not 100.
    expect(roundPercentagesToSum100([10, 10, 10])).toEqual([34, 33, 33]);
  });

  it("returns all zeros for a non-positive total rather than dividing by zero", () => {
    expect(roundPercentagesToSum100([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("gives a single category the full 100%", () => {
    expect(roundPercentagesToSum100([100])).toEqual([100]);
  });
});
