import RNCalendarEvents, { CalendarEventWritable } from "react-native-calendar-events";
import type { SelectedCalendar, SyncedTransaction } from "../types";

export async function requestCalendarPermission(): Promise<boolean> {
  const status = await RNCalendarEvents.requestPermissions();
  return status === "authorized";
}

export async function listWritableCalendars(): Promise<SelectedCalendar[]> {
  const calendars = await RNCalendarEvents.findCalendars();
  return calendars
    .filter((cal) => cal.allowsModifications)
    .map((cal) => ({ id: cal.id, title: cal.title, source: cal.source }));
}

// A date-only transaction (no `datetime` from Plaid — common; exact time of
// day usually isn't reported) used to be anchored to `${date}T12:00:00.000Z`
// — literally noon UTC, an absolute instant. EventKit displays a
// non-recurring event's time by converting its absolute instant to the
// *viewing* device's current timezone (setting CalendarEventWritable's own
// `timeZone` field doesn't change this for a single event — that field
// mainly affects recurrence math). So a user materially west of UTC saw
// "noon UTC" rendered as their own early morning — e.g. ~4-5 AM in
// Vancouver (UTC-7/8) — for what's meant to be a midday anchor. Building the
// Date from local components instead (JS's local-timezone Date constructor)
// and letting `.toISOString()` do the local->UTC conversion means EventKit's
// reverse conversion (UTC->the device's own local zone) lands back on noon
// local, whatever that device's timezone actually is.
function localNoonIso(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0).toISOString();
}

export async function createTransactionEvent(
  calendarId: string,
  transaction: SyncedTransaction
): Promise<string> {
  const startDate = transaction.datetime ?? localNoonIso(transaction.date);
  const amountLabel = formatAmount(transaction.amount, transaction.isoCurrencyCode);
  const title = `${transaction.merchantName} — ${amountLabel}`;

  const details: CalendarEventWritable = {
    calendarId,
    location: transaction.merchantName,
    notes: transaction.category ?? undefined,
    startDate,
    endDate: startDate,
    allDay: false,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };

  return RNCalendarEvents.saveEvent(title, details);
}

// Best-effort cleanup for an event left behind on a calendar the user has
// since switched away from (see HomeScreen's pending-events map — an event
// created but never confirmed, then orphaned by a calendar change before the
// next sync retried it). Never throws: the old calendar could itself have
// been deleted, or the event already gone, neither of which should block
// creating the real event on the calendar the user actually wants now.
export async function removeTransactionEvent(eventId: string): Promise<void> {
  try {
    await RNCalendarEvents.removeEvent(eventId);
  } catch {
    // Nothing more to do — see above.
  }
}

// Falls back to CAD, not USD, when a transaction has no iso_currency_code —
// this app's one documented market is a Canadian bank (see CLAUDE.md), so an
// unknown currency is far more likely to be CAD than USD. Plaid can return
// this null with only an unofficial_currency_code populated instead (not
// currently captured — see plaidSync.ts's transactionToRow), which happens
// for things like crypto/reward-point transactions, not ordinary chequing/
// credit card spending; genuinely rare for this app's real usage, but
// defaulting to the wrong country's currency for a Canadian banking app was
// the wrong direction to guess in regardless of how rarely it's hit.
function formatAmount(amount: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency ?? "CAD",
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency ?? "CAD"}`.trim();
  }
}
