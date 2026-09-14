import { plaidClient } from "./plaid";
import { supabaseAdmin } from "./supabase";
import { decrypt } from "./crypto";
import { LEGACY_CATEGORY_ID_TO_PFC_PRIMARY } from "./legacyCategoryMapping";

export interface PlaidItemRow {
  id: string;
  user_id: string;
  item_id: string;
  access_token_encrypted: string;
  cursor: string | null;
}

export interface SyncFilters {
  min_amount: number;
  excluded_categories: string[];
}

type PlaidAddedTransaction = Awaited<
  ReturnType<typeof plaidClient.transactionsSync>
>["data"]["added"][number];

type RemovedTransactionShape = Awaited<
  ReturnType<typeof plaidClient.transactionsSync>
>["data"]["removed"][number];

// Extracted so it's directly unit-testable without mocking Supabase/Plaid.
export function shouldSyncTransaction(txn: PlaidAddedTransaction, filters: SyncFilters): boolean {
  // Outgoing charge below the user's floor — skip. Refunds/income
  // (amount <= 0) are never filtered on amount.
  if (txn.amount > 0 && txn.amount < filters.min_amount) {
    return false;
  }

  // excluded_categories can only ever contain PFC `primary` values (enforced
  // by PATCH /api/settings/sync-filters's validation). Prefer real PFC
  // enrichment; for transactions that predate it, fall back to Plaid's own
  // published legacy-category-id -> PFC mapping, but ONLY the unambiguous
  // slice of it (see legacyCategoryMapping.ts) — a category_id with no entry
  // there (either genuinely unmapped, or ambiguous at the primary level) has
  // no comparable value, same as if this fallback didn't exist.
  const pfcCategory =
    txn.personal_finance_category?.primary ??
    (txn.category_id ? LEGACY_CATEGORY_ID_TO_PFC_PRIMARY[txn.category_id] : undefined) ??
    null;
  if (pfcCategory && (filters.excluded_categories ?? []).includes(pfcCategory)) {
    return false;
  }

  return true;
}

// Kept separate from syncPlaidItem so a caller syncing multiple items for the
// same user (e.g. /api/plaid/sync) fetches this once and passes it down,
// rather than once per item — was previously fetched inside syncPlaidItem
// itself, an N+1 for any user with more than one linked plaid_items row.
export async function getSyncFilters(userId: string): Promise<SyncFilters> {
  const { data: userRow, error } = await supabaseAdmin
    .from("users")
    .select("sync_filters")
    .eq("id", userId)
    .single();

  if (error) {
    throw error;
  }

  return userRow.sync_filters as SyncFilters;
}

function transactionToRow(txn: PlaidAddedTransaction, item: PlaidItemRow) {
  return {
    user_id: item.user_id,
    plaid_item_id: item.id,
    plaid_transaction_id: txn.transaction_id,
    merchant_name: txn.merchant_name ?? txn.name,
    amount: txn.amount,
    iso_currency_code: txn.iso_currency_code,
    category: txn.personal_finance_category?.primary ?? txn.category?.[0] ?? null,
    date: txn.date,
    datetime: txn.datetime ?? null,
  };
}

// Plaid's documented pattern for an ordinary pending->posted transition (the
// normal lifecycle of most card transactions, not an edge case): the pending
// transaction's id appears in `removed`, and the posted version appears in
// `added` under a NEW transaction_id. Previously only `added` was ever read
// — `modified`/`removed` were silently discarded — so a transaction already
// confirmed to a real calendar event while pending got a SECOND, duplicate
// event created for its posted version, and an in-place amount correction
// (e.g. a tip adjusted at settlement) was invisible entirely. Handling these
// closes that for the common case: a transaction still "pending" in our own
// table (never yet synced to a device calendar — mobile only creates the
// event once `/api/plaid/sync` hands it over) can be cleanly deleted
// (removed) or updated in place (modified) with zero user-visible effect,
// since nothing was ever shown to the user for it yet.
//
// What this does NOT fix: a transaction already synced to a real calendar
// event that Plaid later modifies or removes (a posted charge disputed or
// reversed, a modified amount after sync) — the device-side event itself
// can't be touched from the backend alone; that needs mobile-side support
// (updating/deleting via react-native-calendar-events) that doesn't exist
// yet. Logged loudly when this happens so the gap is observable rather than
// silent, not treated as fully solved.
// Exported so it's directly testable against a real database without
// needing to choreograph an actual Plaid sandbox pending->posted transition.
export async function applyRemoved(removed: RemovedTransactionShape[], item: PlaidItemRow) {
  for (const txn of removed) {
    const { data: existing, error } = await supabaseAdmin
      .from("synced_transactions")
      .select("id, status")
      .eq("plaid_item_id", item.id)
      .eq("plaid_transaction_id", txn.transaction_id)
      .maybeSingle();
    if (error) throw error;
    if (!existing) continue;

    if (existing.status === "pending") {
      const { error: deleteError } = await supabaseAdmin
        .from("synced_transactions")
        .delete()
        .eq("id", existing.id);
      if (deleteError) throw deleteError;
    } else {
      console.warn(
        `Plaid removed transaction ${txn.transaction_id} (plaid_items.id=${item.id}) that was already synced to a device calendar event — cannot clean up the device-side event from the backend alone`
      );
    }
  }
}

export async function applyModified(modified: PlaidAddedTransaction[], item: PlaidItemRow) {
  for (const txn of modified) {
    const { data: existing, error } = await supabaseAdmin
      .from("synced_transactions")
      .select("id, status")
      .eq("plaid_item_id", item.id)
      .eq("plaid_transaction_id", txn.transaction_id)
      .maybeSingle();
    if (error) throw error;
    if (!existing) continue; // never stored (e.g. filtered out) — nothing to update

    const { error: updateError } = await supabaseAdmin
      .from("synced_transactions")
      .update(transactionToRow(txn, item))
      .eq("id", existing.id);
    if (updateError) throw updateError;

    if (existing.status !== "pending") {
      console.warn(
        `Plaid modified transaction ${txn.transaction_id} (plaid_items.id=${item.id}) after it was already synced to a device calendar event — our record is now current, but the device-side event itself is stale`
      );
    }
  }
}

// Pulls all new/changed/removed transactions for one Plaid item since its
// last cursor, applies them, and advances the stored cursor — one page at a
// time, checkpointing after each page rather than only once at the very end.
// A large initial sync (Plaid can backfill up to 24 months of history on
// first link) can span many pages; checkpointing per page means an
// interruption partway through (a thrown error, or the function simply
// running out of its execution time limit) keeps every already-processed
// page's progress instead of discarding all of it and restarting from
// scratch on the next attempt.
// Called both from the sync webhook and from a user-initiated refresh —
// never on a timer, per Plaid's recommended sync pattern.
export async function syncPlaidItem(item: PlaidItemRow, filters: SyncFilters): Promise<number> {
  const accessToken = decrypt(item.access_token_encrypted);
  let cursor = item.cursor ?? undefined;
  let hasMore = true;
  let totalAdded = 0;

  while (hasMore) {
    const response = await plaidClient.transactionsSync({
      access_token: accessToken,
      cursor,
    });
    const { added, modified, removed, next_cursor, has_more } = response.data;

    await applyRemoved(removed, item);
    await applyModified(modified, item);

    // Drop transactions the user has opted out of before they ever reach
    // synced_transactions — filtered-out transactions are not stored.
    const filtered = added.filter((txn) => shouldSyncTransaction(txn, filters));
    if (filtered.length > 0) {
      const rows = filtered.map((txn) => ({ ...transactionToRow(txn, item), status: "pending" as const }));
      const { error: upsertError } = await supabaseAdmin
        .from("synced_transactions")
        .upsert(rows, { onConflict: "plaid_item_id,plaid_transaction_id", ignoreDuplicates: true });
      if (upsertError) throw upsertError;
      totalAdded += filtered.length;
    }

    // Checkpoint now that this page's added/modified/removed are all
    // durably persisted — not after the whole multi-page pull completes.
    const { error: cursorError } = await supabaseAdmin
      .from("plaid_items")
      .update({ cursor: next_cursor })
      .eq("id", item.id);
    if (cursorError) throw cursorError;

    cursor = next_cursor;
    hasMore = has_more;
  }

  return totalAdded;
}
