import { describe, expect, it } from "vitest";
import { isValidMonth, monthRange, previousMonth } from "../../../api/transactions/monthly";

describe("isValidMonth", () => {
  it("accepts a well-formed month", () => {
    expect(isValidMonth("2026-09")).toBe(true);
    expect(isValidMonth("2026-01")).toBe(true);
    expect(isValidMonth("2026-12")).toBe(true);
  });

  it("rejects an out-of-range month that the regex alone would accept", () => {
    // The exact bug this function fixed — JS's Date silently normalizes
    // month 13/00 rather than rejecting, which the regex alone can't catch.
    expect(isValidMonth("2026-13")).toBe(false);
    expect(isValidMonth("2026-00")).toBe(false);
  });

  it("rejects missing, malformed, or wrong-shaped input", () => {
    expect(isValidMonth(undefined)).toBe(false);
    expect(isValidMonth("")).toBe(false);
    expect(isValidMonth("2026-9")).toBe(false); // not zero-padded
    expect(isValidMonth("2026/09")).toBe(false);
    expect(isValidMonth("not-a-month")).toBe(false);
  });
});

describe("monthRange", () => {
  it("returns the correct start/end for a mid-year month", () => {
    expect(monthRange("2026-06")).toEqual({ start: "2026-06-01", end: "2026-07-01" });
  });

  it("rolls over correctly at a year boundary", () => {
    expect(monthRange("2026-12")).toEqual({ start: "2026-12-01", end: "2027-01-01" });
  });
});

describe("previousMonth", () => {
  it("returns the prior month within the same year", () => {
    expect(previousMonth("2026-06")).toBe("2026-05");
  });

  it("rolls back across a year boundary", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
  });
});
