import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../../lib/supabase";
import { requireUser, UnauthorizedError } from "../../lib/auth";

function monthRange(month: string): { start: string; end: string } {
  const [year, mon] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function previousMonth(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  const prev = new Date(Date.UTC(year, mon - 2, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Returns one calendar month's transactions plus the previous month's total
// spend, so the client can show a % change without a second full fetch.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: "Missing or invalid month, expected YYYY-MM" });
  }

  try {
    const user = await requireUser(req);
    const { start, end } = monthRange(month);
    const { start: prevStart, end: prevEnd } = monthRange(previousMonth(month));

    const { data: transactions, error: txError } = await supabaseAdmin
      .from("synced_transactions")
      .select("id, merchant_name, amount, iso_currency_code, category, date, datetime, status")
      .eq("user_id", user.id)
      .gte("date", start)
      .lt("date", end)
      .order("date", { ascending: true });

    if (txError) {
      throw txError;
    }

    const { data: prevTransactions, error: prevError } = await supabaseAdmin
      .from("synced_transactions")
      .select("amount")
      .eq("user_id", user.id)
      .gte("date", prevStart)
      .lt("date", prevEnd);

    if (prevError) {
      throw prevError;
    }

    const previousMonthTotal = (prevTransactions ?? [])
      .filter((txn) => txn.amount > 0)
      .reduce((sum, txn) => sum + Number(txn.amount), 0);

    return res.status(200).json({
      month,
      transactions: (transactions ?? []).map((txn) => ({
        id: txn.id,
        merchantName: txn.merchant_name,
        amount: txn.amount,
        isoCurrencyCode: txn.iso_currency_code,
        category: txn.category,
        date: txn.date,
        datetime: txn.datetime,
        status: txn.status,
      })),
      previousMonthTotal,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return res.status(401).json({ error: err.message });
    }
    console.error("monthly failed", err);
    return res.status(500).json({ error: "Failed to load monthly transactions" });
  }
}
