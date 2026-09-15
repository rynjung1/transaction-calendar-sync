import RNCalendarEvents, { CalendarEventWritable } from "react-native-calendar-events";
import type { SelectedCalendar, SyncedTransaction } from "../types";
import { localNoonIso } from "./dates";
import { formatCurrency } from "./currency";

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

export async function createTransactionEvent(
  calendarId: string,
  transaction: SyncedTransaction
): Promise<string> {
  const startDate = transaction.datetime ?? localNoonIso(transaction.date);
  const amountLabel = formatCurrency(transaction.amount, transaction.isoCurrencyCode);
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
