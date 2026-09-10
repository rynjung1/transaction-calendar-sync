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

export async function createTransactionEvent(
  calendarId: string,
  transaction: SyncedTransaction
): Promise<string> {
  const startDate = transaction.datetime ?? `${transaction.date}T12:00:00.000Z`;
  const amountLabel = formatAmount(transaction.amount, transaction.isoCurrencyCode);
  const title = `${transaction.merchantName} — ${amountLabel}`;

  const details: CalendarEventWritable = {
    calendarId,
    location: transaction.merchantName,
    notes: transaction.category ?? undefined,
    startDate,
    endDate: startDate,
    allDay: false,
  };

  return RNCalendarEvents.saveEvent(title, details);
}

function formatAmount(amount: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency ?? "USD",
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency ?? ""}`.trim();
  }
}
