import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../../lib/supabase";
import { getSyncFilters, syncPlaidItem } from "../../lib/plaidSync";
import { verifyPlaidWebhook, WebhookVerificationError } from "../../lib/plaidWebhookVerify";
import { safeErrorInfo } from "../../lib/logging";

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
    console.error("webhook verification error", safeErrorInfo(err));
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
    } else if (
      webhookType === "ITEM" &&
      (webhookCode === "USER_PERMISSION_REVOKED" || webhookCode === "USER_ACCOUNT_REVOKED")
    ) {
      // The user revoked access from their bank/institution's own side (not
      // through this app) — Plaid has already fully blocked the Item from
      // ever being used again; this is not a temporary/recoverable state
      // like login_required. Previously unhandled entirely, so `status`
      // stayed "active" forever: /api/plaid/status kept reporting the
      // connection as healthy (needsReauth never fires for a status other
      // than non-"active", so it was already correct there — the real gap
      // was status itself never changing), and /api/plaid/sync kept trying
      // to sync a dead Item on every call indefinitely (harmless since it's
      // caught and skipped per-item, but silently wasted forever). Mapped to
      // the existing "error" status — reuses needsReauth's existing "not
      // active" check rather than needing a schema change, and a real user
      // can't do anything about a bank-side revocation except relink fresh
      // anyway, the same recovery path "error" already points them to.
      await supabaseAdmin.from("plaid_items").update({ status: "error" }).eq("id", item.id);
    } else if (webhookType === "ITEM" && webhookCode === "PENDING_DISCONNECT") {
      // US/CA-specific (this project's actual market) 7-day advance warning
      // that an Item will stop working soon. Not yet acted on — flipping
      // `status` away from "active" now would stop /api/plaid/sync from
      // syncing an Item that still works fine for up to 7 more days (sync.ts
      // only syncs status="active" items), trading a real, avoidable data
      // gap for an early warning that has nowhere to surface anyway (no UI
      // distinguishes "about to need reconnecting" from "already broken").
      // Logged so it's at least visible, not fully silent; a real fix needs
      // a genuine schema addition (a distinct status, or a separate
      // needs-attention-by timestamp) to warn without also halting sync.
      console.warn(`Item ${item.id} (plaid_items) received PENDING_DISCONNECT — will stop working within 7 days, not yet surfaced to the user`);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("webhook handling failed", safeErrorInfo(err));
    // Plaid retries on non-2xx, so still ack receipt to avoid retry storms
    // for errors that won't resolve on retry (e.g. decryption failures).
    return res.status(200).json({ ok: false });
  }
}
