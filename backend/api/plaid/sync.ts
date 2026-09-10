import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../../lib/supabase";
import { requireUser, UnauthorizedError } from "../../lib/auth";
import { syncPlaidItem } from "../../lib/plaidSync";

// User-initiated refresh (e.g. pull-to-refresh). Not a timer poll — Plaid
// still notifies us of background updates via the SYNC_UPDATES_AVAILABLE
// webhook, which this same syncPlaidItem() helper handles.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await requireUser(req);

    const { data: items, error: itemsError } = await supabaseAdmin
      .from("plaid_items")
      .select("id, user_id, item_id, access_token_encrypted, cursor")
      .eq("user_id", user.id)
      .eq("status", "active");

    if (itemsError) {
      throw itemsError;
    }

    for (const item of items ?? []) {
      await syncPlaidItem(item);
    }

    const { data: pending, error: pendingError } = await supabaseAdmin
      .from("synced_transactions")
      .select(
        "id, plaid_transaction_id, merchant_name, amount, iso_currency_code, category, date, datetime, calendar_event_id, status"
      )
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("date", { ascending: false });

    if (pendingError) {
      throw pendingError;
    }

    const transactions = (pending ?? []).map((txn) => ({
      id: txn.id,
      plaidTransactionId: txn.plaid_transaction_id,
      merchantName: txn.merchant_name,
      amount: txn.amount,
      isoCurrencyCode: txn.iso_currency_code,
      category: txn.category,
      date: txn.date,
      datetime: txn.datetime,
      calendarEventId: txn.calendar_event_id,
      status: txn.status,
    }));

    return res.status(200).json({ transactions });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return res.status(401).json({ error: err.message });
    }
    console.error("sync failed", err);
    return res.status(500).json({ error: "Failed to sync transactions" });
  }
}
