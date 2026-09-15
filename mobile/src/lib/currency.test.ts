import { describe, expect, it } from "vitest";
import { formatCurrency } from "./currency";

// The real bug this fixed, confirmed with real Intl output before touching
// the code: Intl.NumberFormat("en-US", {currency:"USD"}).format(42.5) ->
// "$42.50", vs {currency:"CAD"} -> "CA$42.50". No number was ever wrong
// (Intl.NumberFormat doesn't convert currency, only how it displays), but
// every figure in this app showed a plain "$" as if it were USD, on an app
// whose one documented market is a Canadian bank.
describe("formatCurrency", () => {
  it("defaults to CAD when no currency is given", () => {
    expect(formatCurrency(42.5)).toBe("CA$42.50");
  });

  it("defaults to CAD when currency is explicitly null", () => {
    expect(formatCurrency(42.5, null)).toBe("CA$42.50");
  });

  it("uses the given currency when one is provided", () => {
    expect(formatCurrency(42.5, "USD")).toBe("$42.50");
    expect(formatCurrency(10, "EUR")).toBe("€10.00");
  });

  it("handles negative amounts (refunds/income)", () => {
    expect(formatCurrency(-15.25)).toBe("-CA$15.25");
  });

  it("falls back to a plain number when Intl.NumberFormat rejects a malformed currency code", () => {
    // A real, if rare, possibility given this value ultimately comes from
    // Plaid/the bank, not something this app validates before formatting.
    expect(formatCurrency(42.5, "NOT_A_REAL_CODE")).toBe("42.50 NOT_A_REAL_CODE");
  });
});
