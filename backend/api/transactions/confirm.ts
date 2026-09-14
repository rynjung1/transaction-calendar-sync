import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../../lib/supabase";
import { requireUser, UnauthorizedError } from "../../lib/auth";
import { safeErrorInfo } from "../../lib/logging";

// Marks a transaction as written to the user's calendar, recording the
// device calendar event id so we don't recreate it on a later sync.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { transactionId, calendarEventId } = req.body ?? {};
  if (!transactionId || !calendarEventId) {
    return res.status(400).json({ error: "Missing transactionId or calendarEventId" });
  }

  try {
    const user = await requireUser(req);

    const { error } = await supabaseAdmin
      .from("synced_transactions")
      .update({ status: "synced", calendar_event_id: calendarEventId })
      .eq("id", transactionId)
      .eq("user_id", user.id);

    if (error) {
      throw error;
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return res.status(401).json({ error: err.message });
    }
    console.error("confirm failed", safeErrorInfo(err));
    return res.status(500).json({ error: "Failed to confirm transaction" });
  }
}
