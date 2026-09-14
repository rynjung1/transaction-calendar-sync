import type { VercelRequest, VercelResponse } from "@vercel/node";
import { plaidClient } from "../lib/plaid";
import { supabaseAdmin } from "../lib/supabase";
import { decrypt } from "../lib/crypto";
import { requireUser, UnauthorizedError } from "../lib/auth";
import { safeErrorInfo } from "../lib/logging";

// Account deletion — required both by PIPEDA's retention principle and by
// App Store Guideline 5.1.1(v) (an app that supports account creation must
// support in-app account deletion).
//
// Deleting the Supabase Auth user cascades to public.users, plaid_items, and
// synced_transactions automatically (all three have `on delete cascade` FKs
// back to the auth user, per 0001_init.sql) — that's the authoritative "the
// user's data is gone" step. Before that, each linked Plaid Item is formally
// removed via Plaid's own API so the access token is actually revoked at
// Plaid, not just deleted from our database — leaving a live, working access
// token behind (even encrypted, even after we can no longer decrypt it
// ourselves) is a real difference from actually revoking it.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await requireUser(req);

    const { data: items, error: itemsError } = await supabaseAdmin
      .from("plaid_items")
      .select("access_token_encrypted")
      .eq("user_id", user.id);

    if (itemsError) {
      throw itemsError;
    }

    // Best-effort per item — one failed Plaid removal shouldn't block the
    // rest, or block deleting the account itself. The DB cascade below is
    // what actually determines whether the user's data is gone from our
    // side; a failed itemRemove just means Plaid's own copy of a (now
    // undecryptable, since the user row is about to disappear) token lingers
    // on Plaid's side, logged here for manual follow-up rather than silently
    // dropped.
    for (const item of items ?? []) {
      try {
        const accessToken = decrypt(item.access_token_encrypted);
        await plaidClient.itemRemove({ access_token: accessToken });
      } catch (err) {
        console.error("Failed to remove Plaid item during account deletion", safeErrorInfo(err));
      }
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      throw deleteError;
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return res.status(401).json({ error: err.message });
    }
    console.error("account deletion failed", safeErrorInfo(err));
    return res.status(500).json({ error: "Failed to delete account" });
  }
}
