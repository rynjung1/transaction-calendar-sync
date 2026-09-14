import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../../lib/supabase";
import { requireUser, UnauthorizedError } from "../../lib/auth";
import { getSyncFilters, syncPlaidItem } from "../../lib/plaidSync";
import { safeErrorInfo } from "../../lib/logging";

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

    if (items && items.length > 0) {
      // Fetched once per request, not once per item — see getSyncFilters's
      // own comment for why that matters once a user has more than one
      // linked item. Skipped entirely when there's nothing to sync.
      const filters = await getSyncFilters(user.id);
      // Per-item, not a single failure-propagates-to-all loop: a multi-account
      // user (a supported, real scenario) would otherwise get zero
      // transactions from ANY of their banks whenever just one item hit a
      // transient Plaid error (rate limit, momentary network blip) — the
      // healthy items' data was already fetched and stored by the time the
      // failing one threw, but the whole request still 500'd before ever
      // returning it. Each item's own failure is logged and skipped; it
      // simply gets retried on the next sync (its cursor wasn't advanced).
      for (const item of items) {
        try {
          await syncPlaidItem(item, filters);
        } catch (err) {
          console.error(`Sync failed for plaid_items.id=${item.id} (continuing with other items)`, safeErrorInfo(err));
        }
      }
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
    console.error("sync failed", safeErrorInfo(err));
    return res.status(500).json({ error: "Failed to sync transactions" });
  }
}
