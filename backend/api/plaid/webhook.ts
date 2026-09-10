import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../../lib/supabase";
import { syncPlaidItem } from "../../lib/plaidSync";

// Plaid webhooks: https://plaid.com/docs/api/webhooks/
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
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
      await syncPlaidItem(item);
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
