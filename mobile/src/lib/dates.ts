// Pure date/timezone logic, extracted out of calendar.ts and
// InsightsScreen.tsx specifically so it's testable without importing either
// file's React Native dependencies. This file has caught two real,
// previously-shipped timezone bugs this session — see localNoonIso and
// daysElapsedInMonth below — both in the exact same "UTC vs. local
// date-of-month" shape, just in different screens. Zero RN imports here,
// deliberately, so a plain `node`/Vitest environment can exercise it exactly
// as a real device would for any given timezone (via the TZ env var).

// A date-only transaction (no `datetime` from Plaid — common; exact time of
// day usually isn't reported) used to be anchored to `${date}T12:00:00.000Z`
// — literally noon UTC, an absolute instant. EventKit displays a
// non-recurring event's time by converting its absolute instant to the
// *viewing* device's current timezone, so a user materially west of UTC saw
// "noon UTC" rendered as their own early morning (e.g. ~4-5 AM in Vancouver,
// UTC-7/8). Building the Date from local components instead means
// `.toISOString()`'s local->UTC conversion round-trips correctly: EventKit's
// reverse conversion (UTC->the device's own local zone) lands back on noon
// local, whatever that device's timezone actually is.
export function localNoonIso(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0).toISOString();
}

export function monthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return new Date(Date.UTC(year, mon - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function daysInMonth(month: string): number {
  const [year, mon] = month.split("-").map(Number);
  return new Date(Date.UTC(year, mon, 0)).getUTCDate();
}

// `now` is injectable (defaults to the real clock) specifically so this is
// testable without faking global timers — matches this codebase's existing
// pattern (backend's isWithinCooldown/isCacheEntryStale both take an
// injectable `now` for the same reason).
export function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Real bug, found on a fresh read-through and fixed: InsightsScreen's
// "average per day" figure used to divide the current month's total spend
// by `new Date().getUTCDate()` (days elapsed so far) — but `currentMonth()`
// above determines "is this the current month" from *local* date
// components. The two disagree for a real chunk of every evening in any
// timezone behind UTC, which is this app's entire real market (every
// Canadian timezone is west of UTC). Verified for real: simulating 11:30 PM
// in Vancouver on the 14th, `getUTCDate()` already reports 15 (UTC has
// rolled to the next day) while `getDate()` correctly still reports 14 —
// the inflated day count understated avgPerDay for that whole window. Fixed
// to use local date components throughout, matching currentMonth()'s own
// basis rather than mixing UTC into just this one calculation.
export function daysElapsedInMonth(month: string, now: Date = new Date()): number {
  if (month !== currentMonth(now)) {
    return daysInMonth(month);
  }
  return now.getDate();
}
