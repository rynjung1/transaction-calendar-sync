import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../../lib/supabase";
import { getSyncFilters, syncPlaidItem } from "../../lib/plaidSync";
import { verifyPlaidWebhook, WebhookVerificationError } from "../../lib/plaidWebhookVerify";

// @vercel/node fully buffers the request body before the handler runs and
// replays it on `req` as a real readable stream (independent of the already-
// parsed `req.body`) — consuming it here gets us the exact raw bytes Plaid
// signed, which req.body (re-serialized JSON) would not reliably byte-match.
async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// Plaid webhooks: https://plaid.com/docs/api/webhooks/
//
// This endpoint can't use requireUser() — Plaid has no user session — so
// verifyPlaidWebhook() (signature + freshness + body-hash check against
// Plaid's own published key) is the only thing standing between the open
// internet and a handler that triggers real Plaid API calls and mutates
// plaid_items status. A request that fails verification is not from Plaid,
// so it's rejected outright rather than acked with 200.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const rawBody = await readRawBody(req);
    await verifyPlaidWebhook(req, rawBody);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      console.warn("Rejected webhook: failed verification —", err.message);
      return res.status(401).json({ error: "Failed verification" });
    }
    console.error("webhook verification error", err);
    return res.status(400).json({ error: "Failed to verify webhook" });
  }

  const {
    webhook_type: webhookType,
    webhook_code: webhookCode,
    item_id: itemId,
    error: webhookError,
  } = req.body ?? {};

  if (!itemId) {
    return res.status(400).json({ error: "Missing item_id" });
  }

  try {
    const { data: item, error } = await supabaseAdmin
      .from("plaid_items")
      .select("id, user_id, item_id, access_token_encrypted, cursor")
      .eq("item_id", itemId)
      .single();

    if (error || !item) {
      console.warn("Webhook for unknown item_id", itemId);
      return res.status(200).json({ ok: true });
    }

    if (webhookType === "TRANSACTIONS" && webhookCode === "SYNC_UPDATES_AVAILABLE") {
      const filters = await getSyncFilters(item.user_id);
      await syncPlaidItem(item, filters);
    } else if (webhookType === "ITEM" && webhookCode === "ERROR") {
      const status = webhookError?.error_code === "ITEM_LOGIN_REQUIRED" ? "login_required" : "error";
      await supabaseAdmin.from("plaid_items").update({ status }).eq("id", item.id);
    } else if (webhookType === "ITEM" && webhookCode === "LOGIN_REPAIRED") {
      await supabaseAdmin.from("plaid_items").update({ status: "active" }).eq("id", item.id);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("webhook handling failed", err);
    // Plaid retries on non-2xx, so still ack receipt to avoid retry storms
    // for errors that won't resolve on retry (e.g. decryption failures).
    return res.status(200).json({ ok: false });
  }
}
