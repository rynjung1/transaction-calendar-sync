import { plaidClient } from "./plaid";
import { supabaseAdmin } from "./supabase";
import { decrypt } from "./crypto";
import { LEGACY_CATEGORY_ID_TO_PFC_PRIMARY } from "./legacyCategoryMapping";

interface PlaidItemRow {
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

// Pulls all new transactions for one Plaid item since its last cursor,
// upserts them as pending rows, and advances the stored cursor.
// Called both from the sync webhook and from a user-initiated refresh —
// never on a timer, per Plaid's recommended sync pattern.
export async function syncPlaidItem(item: PlaidItemRow, filters: SyncFilters) {
  const accessToken = decrypt(item.access_token_encrypted);
  let cursor = item.cursor ?? undefined;
  let hasMore = true;
  const added: Awaited<ReturnType<typeof plaidClient.transactionsSync>>["data"]["added"] = [];

  while (hasMore) {
    const response = await plaidClient.transactionsSync({
      access_token: accessToken,
      cursor,
    });
    added.push(...response.data.added);
    cursor = response.data.next_cursor;
    hasMore = response.data.has_more;
  }

  // Drop transactions the user has opted out of before they ever reach
  // synced_transactions — filtered-out transactions are not stored.
  const filtered = added.filter((txn) => shouldSyncTransaction(txn, filters));

  if (filtered.length > 0) {
    const rows = filtered.map((txn) => ({
      user_id: item.user_id,
      plaid_item_id: item.id,
      plaid_transaction_id: txn.transaction_id,
      merchant_name: txn.merchant_name ?? txn.name,
      amount: txn.amount,
      iso_currency_code: txn.iso_currency_code,
      category: txn.personal_finance_category?.primary ?? txn.category?.[0] ?? null,
      date: txn.date,
      datetime: txn.datetime ?? null,
      status: "pending" as const,
    }));

    const { error: upsertError } = await supabaseAdmin
      .from("synced_transactions")
      .upsert(rows, { onConflict: "plaid_item_id,plaid_transaction_id", ignoreDuplicates: true });

    if (upsertError) {
      throw upsertError;
    }
  }

  const { error: cursorError } = await supabaseAdmin
    .from("plaid_items")
    .update({ cursor })
    .eq("id", item.id);

  if (cursorError) {
    throw cursorError;
  }

  return filtered.length;
}
