import { plaidClient } from "./plaid";
import { supabaseAdmin } from "./supabase";
import { decrypt } from "./crypto";

interface PlaidItemRow {
  id: string;
  user_id: string;
  item_id: string;
  access_token_encrypted: string;
  cursor: string | null;
}

interface SyncFilters {
  min_amount: number;
  excluded_categories: string[];
}

// Pulls all new transactions for one Plaid item since its last cursor,
// upserts them as pending rows, and advances the stored cursor.
// Called both from the sync webhook and from a user-initiated refresh —
// never on a timer, per Plaid's recommended sync pattern.
export async function syncPlaidItem(item: PlaidItemRow) {
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

  const { data: userRow, error: userError } = await supabaseAdmin
    .from("users")
    .select("sync_filters")
    .eq("id", item.user_id)
    .single();

  if (userError) {
    throw userError;
  }

  const filters = userRow.sync_filters as SyncFilters;

  // Drop transactions the user has opted out of before they ever reach
  // synced_transactions — filtered-out transactions are not stored.
  const filtered = added.filter((txn) => {
    // Outgoing charge below the user's floor — skip. Refunds/income
    // (amount <= 0) are never filtered on amount.
    if (txn.amount > 0 && txn.amount < filters.min_amount) {
      return false;
    }

    // TODO(must-fix before category-exclusion UI ships): this falls back to the
    // legacy `category` taxonomy when a transaction has no PFC enrichment, but
    // excluded_categories will only ever hold PFC `primary` values — such a
    // transaction can never match an exclusion. Silent no-op today because
    // excluded_categories is empty for everyone until the settings UI exists.
    const category = txn.personal_finance_category?.primary ?? txn.category?.[0] ?? null;
    if (category && (filters.excluded_categories ?? []).includes(category)) {
      return false;
    }

    return true;
  });

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
