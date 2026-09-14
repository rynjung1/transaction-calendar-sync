import type { VercelRequest, VercelResponse } from "@vercel/node";
import { CountryCode, Products } from "plaid";
import { plaidClient } from "../../lib/plaid";
import { requireUser, UnauthorizedError } from "../../lib/auth";
import { safeErrorInfo } from "../../lib/logging";

// Every other required secret (PLAID_CLIENT_ID/SECRET in lib/plaid.ts,
// SUPABASE_URL/SERVICE_ROLE_KEY in lib/supabase.ts, TOKEN_ENCRYPTION_KEY in
// lib/crypto.ts) throws loudly at module load if missing — this one didn't,
// so an unset PLAID_WEBHOOK_URL silently created Items with no webhook at
// all, permanently relying on manual pull-to-refresh with no log or error
// anywhere pointing at the cause (e.g. a Preview deploy, which per this
// project's own deployment notes only has secrets set for Production).
const webhookUrl = process.env.PLAID_WEBHOOK_URL;
if (!webhookUrl) {
  throw new Error("Missing PLAID_WEBHOOK_URL env var");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await requireUser(req);

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: user.id },
      client_name: "Transaction Calendar Sync",
      products: [Products.Transactions],
      country_codes: [CountryCode.Ca, CountryCode.Us],
      language: "en",
      webhook: webhookUrl,
    });

    return res.status(200).json({ linkToken: response.data.link_token });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return res.status(401).json({ error: err.message });
    }
    console.error("create-link-token failed", safeErrorInfo(err));
    return res.status(500).json({ error: "Failed to create link token" });
  }
}
