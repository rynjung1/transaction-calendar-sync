export interface SyncedTransaction {
  id: string;
  plaidTransactionId: string;
  merchantName: string;
  amount: number;
  isoCurrencyCode: string | null;
  category: string | null;
  date: string;
  datetime: string | null;
  calendarEventId: string | null;
  status: "pending" | "synced" | "failed";
}

export interface SelectedCalendar {
  id: string;
  title: string;
  source: string;
}

export interface MonthlyTransaction {
  id: string;
  merchantName: string;
  amount: number;
  isoCurrencyCode: string | null;
  category: string | null;
  date: string;
  datetime: string | null;
  status: "pending" | "synced" | "failed";
}

export interface MonthlySummaryResponse {
  month: string;
  transactions: MonthlyTransaction[];
  previousMonthTotal: number;
}
