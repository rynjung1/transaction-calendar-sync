import type { VercelRequest, VercelResponse } from "@vercel/node";
import { CountryCode } from "plaid";
import { plaidClient } from "../../lib/plaid";
import { supabaseAdmin } from "../../lib/supabase";
import { encrypt } from "../../lib/crypto";
import { requireUser, UnauthorizedError } from "../../lib/auth";
import { getSyncFilters, syncPlaidItem } from "../../lib/plaidSync";
import { safeErrorInfo } from "../../lib/logging";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { publicToken } = req.body ?? {};
  if (typeof publicToken !== "string" || !publicToken) {
    return res.status(400).json({ error: "Missing publicToken" });
  }

  try {
    const user = await requireUser(req);

    const exchange = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });
    const { access_token: accessToken, item_id: itemId } = exchange.data;

    // Persist the item the moment we have an access_token — before any
    // institution enrichment — rather than after. itemPublicTokenExchange
    // consumes the public_token; it's single-use and Plaid won't reissue
    // one for it. The previous order called itemGet/institutionsGetById
    // (pure enrichment, not required to have a usable linked item) BEFORE
    // ever storing the token, so a transient failure in either of those —
    // the exact class of Plaid hiccup already handled as non-fatal for the
    // eager sync below — meant the freshly-exchanged access_token was never
    // encrypted, never stored, and therefore could never be revoked either:
    // a real, live credential to the user's actual bank account, silently
    // orphaned, with the user simply told "couldn't link account" and free
    // to retry (creating an entirely separate second Item at Plaid, leaving
    // the first one's token live and untracked indefinitely). Institution
    // name/id are cosmetic (shown in Settings) and are now best-effort,
    // applied via an update after the item already exists.
    const { data: inserted, error } = await supabaseAdmin
      .from("plaid_items")
      .insert({
        user_id: user.id,
        item_id: itemId,
        access_token_encrypted: encrypt(accessToken),
        institution_id: null,
        institution_name: null,
        status: "active",
      })
      .select("id, user_id, item_id, access_token_encrypted, cursor")
      .single();

    if (error || !inserted) {
      throw error;
    }

    try {
      const itemResponse = await plaidClient.itemGet({ access_token: accessToken });
      const institutionId = itemResponse.data.item.institution_id ?? null;

      let institutionName: string | null = null;
      if (institutionId) {
        const institution = await plaidClient.institutionsGetById({
          institution_id: institutionId,
          country_codes: [CountryCode.Ca, CountryCode.Us],
        });
        institutionName = institution.data.institution.name;
      }

      if (institutionId) {
        const { error: enrichError } = await supabaseAdmin
          .from("plaid_items")
          .update({ institution_id: institutionId, institution_name: institutionName })
          .eq("id", inserted.id);
        if (enrichError) {
          console.error(`Failed to store institution info for plaid_items.id=${inserted.id}`, safeErrorInfo(enrichError));
        }
      }
    } catch (err) {
      // Non-fatal, same reasoning as the eager sync below: the item is
      // already genuinely linked and usable (syncing doesn't depend on
      // institution_name at all). Checked where institution_name is
      // actually read — nowhere yet, the mobile app doesn't surface it in
      // any screen today — so a failure here has zero current user-visible
      // effect, only leaving the column null in a case where it could have
      // been populated. No retry path for this specifically; not worth one
      // while nothing reads the value.
      console.error("Institution enrichment after linking failed (non-fatal)", safeErrorInfo(err));
    }

    // Pull the initial batch of transactions right away rather than waiting
    // on Plaid's first SYNC_UPDATES_AVAILABLE webhook. Best-effort only: the
    // plaid_items row above is what actually constitutes "linked" — a
    // transient failure here (a Plaid hiccup, a momentary DB blip) must not
    // fail the whole request, since the item is already genuinely linked at
    // this point. Failing loudly here previously reported "couldn't link
    // account" to the user even though linking had already succeeded, and
    // left them free to retry Link from scratch — creating a second Plaid
    // item for the same bank and risking duplicate synced transactions later
    // (dedup is per-item). The regular webhook/pull-to-refresh sync path
    // will pick this item up regardless.
    try {
      const filters = await getSyncFilters(user.id);
      await syncPlaidItem(inserted, filters);
    } catch (err) {
      console.error("Initial sync after linking failed (non-fatal)", safeErrorInfo(err));
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return res.status(401).json({ error: err.message });
    }
    console.error("exchange-token failed", safeErrorInfo(err));
    return res.status(500).json({ error: "Failed to link account" });
  }
}
