import type { VercelRequest, VercelResponse } from "@vercel/node";
import { CountryCode, Products } from "plaid";
import { plaidClient } from "../../lib/plaid";
import { requireUser, UnauthorizedError } from "../../lib/auth";

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
      webhook: process.env.PLAID_WEBHOOK_URL,
    });

    return res.status(200).json({ linkToken: response.data.link_token });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return res.status(401).json({ error: err.message });
    }
    console.error("create-link-token failed", err);
    return res.status(500).json({ error: "Failed to create link token" });
  }
}
