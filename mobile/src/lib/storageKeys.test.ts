import { describe, expect, it } from "vitest";
import { calendarStorageKey } from "./storageKeys";

// The real bug this fixed: a single global "selectedCalendar" key meant a
// fresh signup on the same device silently inherited a deleted account's
// calendar choice (skipping the picker and its privacy confirmation
// entirely), and two accounts on a shared device could clobber each
// other's choice. Scoping by user id closes both.
describe("calendarStorageKey", () => {
  it("scopes the key to the given user id", () => {
    expect(calendarStorageKey("user-1")).toBe("selectedCalendar:user-1");
  });

  it("produces different keys for different users", () => {
    expect(calendarStorageKey("user-1")).not.toBe(calendarStorageKey("user-2"));
  });
});
