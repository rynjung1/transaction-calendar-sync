import type { VercelRequest, VercelResponse } from "@vercel/node";
import { CountryCode } from "plaid";
import { plaidClient } from "../../lib/plaid";
import { supabaseAdmin } from "../../lib/supabase";
import { encrypt } from "../../lib/crypto";
import { requireUser, UnauthorizedError } from "../../lib/auth";
import { getSyncFilters, syncPlaidItem } from "../../lib/plaidSync";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { publicToken } = req.body ?? {};
  if (!publicToken) {
    return res.status(400).json({ error: "Missing publicToken" });
  }

  try {
    const user = await requireUser(req);

    const exchange = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });
    const { access_token: accessToken, item_id: itemId } = exchange.data;

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

    const { data: inserted, error } = await supabaseAdmin
      .from("plaid_items")
      .insert({
        user_id: user.id,
        item_id: itemId,
        access_token_encrypted: encrypt(accessToken),
        institution_id: institutionId,
        institution_name: institutionName,
        status: "active",
      })
      .select("id, user_id, item_id, access_token_encrypted, cursor")
      .single();

    if (error || !inserted) {
      throw error;
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
      console.error("Initial sync after linking failed (non-fatal)", err);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return res.status(401).json({ error: err.message });
    }
    console.error("exchange-token failed", err);
    return res.status(500).json({ error: "Failed to link account" });
  }
}
