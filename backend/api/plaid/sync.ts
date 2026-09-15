import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../../lib/supabase";
import { requireUser, UnauthorizedError } from "../../lib/auth";
import { getSyncFilters, isWithinCooldown, syncPlaidItem } from "../../lib/plaidSync";
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

    // Selecting last_synced_at here means this query — and this whole
    // endpoint — starts failing outright the moment this code deploys,
    // unless migration 0005 (adds plaid_items.last_synced_at) has already
    // been applied first. Rather than require that deploy ordering, detect
    // the specific "column doesn't exist yet" failure (confirmed for real
    // against production: Postgres's own 42703 undefined_column SQLSTATE
    // comes through supabase-js's error.code verbatim, not guessed) and
    // fall back to the pre-cooldown query — the rate limit below simply
    // stays inactive until the migration is run, instead of this code
    // requiring it to already be in place.
    const UNDEFINED_COLUMN = "42703";
    let items: { id: string; user_id: string; item_id: string; access_token_encrypted: string; cursor: string | null; last_synced_at?: string | null }[] | null;
    let cooldownAvailable = true;
    {
      const result = await supabaseAdmin
        .from("plaid_items")
        .select("id, user_id, item_id, access_token_encrypted, cursor, last_synced_at")
        .eq("user_id", user.id)
        .eq("status", "active");

      if (result.error && result.error.code === UNDEFINED_COLUMN) {
        cooldownAvailable = false;
        const fallback = await supabaseAdmin
          .from("plaid_items")
          .select("id, user_id, item_id, access_token_encrypted, cursor")
          .eq("user_id", user.id)
          .eq("status", "active");
        if (fallback.error) throw fallback.error;
        items = fallback.data;
      } else if (result.error) {
        throw result.error;
      } else {
        items = result.data;
      }
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
        // Cost/rate-limit guard: this endpoint has no throttling of its own,
        // and every call here means a real, billed Plaid transactionsSync
        // call per item — including the mobile pagination loop's own
        // repeated calls to page through one large pending backlog, which
        // previously re-hit Plaid on every single page even though nothing
        // new could plausibly have arrived between them. Skipping the actual
        // Plaid call inside a cooldown window still lets pending
        // transactions already on file be returned below — pagination and a
        // burst of accidental double-taps both stay fully functional, only
        // the redundant upstream Plaid call is avoided.
        if (cooldownAvailable && isWithinCooldown(item.last_synced_at)) {
          continue;
        }
        try {
          await syncPlaidItem(item, filters);
          if (cooldownAvailable) {
            const { error: stampError } = await supabaseAdmin
              .from("plaid_items")
              .update({ last_synced_at: new Date().toISOString() })
              .eq("id", item.id);
            if (stampError) {
              // Non-fatal: worst case a future call re-syncs a bit sooner
              // than the cooldown intends, which is the safe direction to
              // fail in (never blocks a legitimate sync).
              console.error(`Failed to stamp last_synced_at for plaid_items.id=${item.id}`, safeErrorInfo(stampError));
            }
          }
        } catch (err) {
          // Deliberately not stamped on failure — a transient Plaid error
          // shouldn't cost the user their next retry window.
          console.error(`Sync failed for plaid_items.id=${item.id} (continuing with other items)`, safeErrorInfo(err));
        }
      }
    }

    // Capped, not "return every pending row" — a user who doesn't open the
    // app for weeks (an entirely normal pattern for a passive spending
    // diary, not misuse) can accumulate a large pending backlog just from
    // Plaid's own webhook-driven syncing running in the background the
    // whole time. Returning all of it in one response means the mobile
    // app's HomeScreen then sequentially writes every single one to the
    // calendar in one very long-running loop (each is a real per-item round
    // trip) before the user sees anything finish. Paging it lets the client
    // process a manageable batch, show real progress, and call again for
    // the rest via `hasMore` rather than one unbounded operation.
    const PENDING_PAGE_SIZE = 100;
    const { data: pending, error: pendingError, count } = await supabaseAdmin
      .from("synced_transactions")
      .select(
        "id, plaid_transaction_id, merchant_name, amount, iso_currency_code, category, date, datetime, calendar_event_id, status",
        { count: "exact" }
      )
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("date", { ascending: false })
      .limit(PENDING_PAGE_SIZE);

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

    return res.status(200).json({ transactions, hasMore: (count ?? 0) > transactions.length, total: count ?? transactions.length });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return res.status(401).json({ error: err.message });
    }
    console.error("sync failed", safeErrorInfo(err));
    return res.status(500).json({ error: "Failed to sync transactions" });
  }
}
