import { describe, expect, it } from "vitest";
import { getErrorMessage } from "./errors";

describe("getErrorMessage", () => {
  it("returns a real Error's message", () => {
    expect(getErrorMessage(new Error("something broke"))).toBe("something broke");
  });

  it("falls back to a generic message for an Error with an empty message", () => {
    expect(getErrorMessage(new Error(""))).toBe("Something went wrong. Please try again.");
  });

  it("falls back to a generic message for a non-Error value, not String(err)", () => {
    // The actual bug this fixed: String(err) on a thrown string/object
    // produces confusing raw output (or the literal "Error: ..." prefix
    // for an Error) shown directly in a native Alert.
    expect(getErrorMessage("just a string")).toBe("Something went wrong. Please try again.");
    expect(getErrorMessage({ some: "object" })).toBe("Something went wrong. Please try again.");
    expect(getErrorMessage(null)).toBe("Something went wrong. Please try again.");
    expect(getErrorMessage(undefined)).toBe("Something went wrong. Please try again.");
  });
});
