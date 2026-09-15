import { afterEach, describe, expect, it } from "vitest";
import { currentMonth, daysElapsedInMonth, daysInMonth, localNoonIso, monthLabel, shiftMonth } from "./dates";

describe("localNoonIso", () => {
  // The exact bug this fixed, verified with real TZ simulation rather than
  // just reading the code: the old behavior anchored to noon UTC as an
  // absolute instant, which EventKit then converts to the *viewing*
  // device's own timezone — showing as early morning for anyone materially
  // west of UTC (confirmed at the time: 5:00 AM in Vancouver, 9:00 PM in
  // Tokyo, for what was meant to be a midday anchor). Confirmed
  // process.env.TZ reassignment actually affects Date's local-time methods
  // in this Node runtime before relying on it here (verified directly, not
  // assumed) — not every JS engine honors a runtime TZ change the same way.
  const originalTZ = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTZ;
  });

  it("round-trips back to local noon in Vancouver (UTC-7 in September)", () => {
    process.env.TZ = "America/Vancouver";
    const iso = localNoonIso("2026-09-14");
    expect(new Date(iso).getHours()).toBe(12);
  });

  it("round-trips back to local noon in Tokyo (UTC+9) — a different absolute instant, same local result", () => {
    process.env.TZ = "Asia/Tokyo";
    const iso = localNoonIso("2026-09-14");
    expect(new Date(iso).getHours()).toBe(12);
  });

  it("produces a different absolute UTC instant per timezone, not the same fixed one", () => {
    process.env.TZ = "America/Vancouver";
    const vancouverIso = localNoonIso("2026-09-14");
    process.env.TZ = "Asia/Tokyo";
    const tokyoIso = localNoonIso("2026-09-14");
    expect(vancouverIso).not.toBe(tokyoIso);
  });
});

describe("monthLabel", () => {
  it("formats a month string as a full month name and year", () => {
    expect(monthLabel("2026-09")).toBe("September 2026");
    expect(monthLabel("2026-01")).toBe("January 2026");
  });
});

describe("shiftMonth", () => {
  it("moves forward and backward within a year", () => {
    expect(shiftMonth("2026-06", 1)).toBe("2026-07");
    expect(shiftMonth("2026-06", -1)).toBe("2026-05");
  });

  it("rolls over a year boundary in both directions", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("daysInMonth", () => {
  it("returns the correct day count for months of different lengths", () => {
    expect(daysInMonth("2026-02")).toBe(28); // 2026 is not a leap year
    expect(daysInMonth("2024-02")).toBe(29); // 2024 is
    expect(daysInMonth("2026-09")).toBe(30);
    expect(daysInMonth("2026-01")).toBe(31);
  });
});

// `.getDate()`/`.getMonth()`/`.getFullYear()` always report in the
// *running process's* configured local timezone, not whatever offset was
// embedded in the string used to construct the Date — so these tests pin
// process.env.TZ explicitly rather than relying on a `-07:00` suffix, which
// would otherwise make the suite's result depend on which machine runs it
// (confirmed the hard way: an earlier version of this file embedded
// `-07:00` in the ISO string alone and failed on a CI/dev box actually
// configured for America/Toronto, since Toronto's own offset shifted the
// instant onto a different calendar day than intended).
describe("currentMonth and daysElapsedInMonth (timezone-pinned)", () => {
  const originalTZ = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTZ;
  });

  it("currentMonth uses local date components, not UTC", () => {
    process.env.TZ = "America/Vancouver";
    // 11PM Sept 30 Pacific is already Oct 1 in UTC.
    const now = new Date("2026-10-01T06:00:00Z");
    expect(currentMonth(now)).toBe("2026-09");
  });

  // The actual bug this fixed, verified with real evidence before touching
  // the code: simulating 11:30 PM in Vancouver on the 14th, getUTCDate()
  // already reports 15 (UTC has rolled to the next day) while getDate()
  // correctly still reports 14. This test locks in the correct (local)
  // answer, not the old (UTC) one.
  it("daysElapsedInMonth uses the local date-of-month for the current month, not the UTC one", () => {
    process.env.TZ = "America/Vancouver";
    const now = new Date("2026-09-15T06:30:00Z"); // 11:30 PM Sept 14 in Vancouver (UTC-7)
    expect(now.getUTCDate()).toBe(15); // confirms the bug scenario is real
    expect(now.getDate()).toBe(14);
    expect(daysElapsedInMonth(currentMonth(now), now)).toBe(14);
  });

  it("returns the full month length for a month that isn't the current one", () => {
    process.env.TZ = "America/Vancouver";
    const now = new Date("2026-09-14T19:00:00Z"); // noon Sept 14 in Vancouver
    expect(daysElapsedInMonth("2026-06", now)).toBe(30);
    expect(daysElapsedInMonth("2026-02", now)).toBe(28);
  });

  it("matches daysInMonth exactly on the last day of the current month", () => {
    process.env.TZ = "America/Vancouver";
    const now = new Date("2026-09-30T22:00:00Z"); // 3PM Sept 30 in Vancouver
    expect(daysElapsedInMonth(currentMonth(now), now)).toBe(30);
  });
});
