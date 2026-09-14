import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../../lib/supabase";
import { requireUser, UnauthorizedError } from "../../lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await requireUser(req);

    const { data: items, error } = await supabaseAdmin
      .from("plaid_items")
      .select("status")
      .eq("user_id", user.id);

    if (error) {
      throw error;
    }

    // `linked` means "has completed onboarding at least once", not "has a
    // currently-healthy connection" — those are different questions. This
    // used to only count status="active" items, so a bank that later needed
    // re-authentication (login_required, a normal and expected occurrence —
    // password changes, periodic Plaid re-verification, not a bug) made an
    // already-linked user's *only* account silently flip `linked` back to
    // false. The app took that as "never linked", routing them back through
    // the first-link onboarding screen as if their account had vanished —
    // and linking again there creates a brand new Plaid item for the same
    // bank rather than fixing the broken one, risking duplicate synced
    // transactions once both items are pulling the same underlying account.
    // `needsReauth` surfaces the real problem instead so the app can show
    // that, without misrepresenting the user's actual linked state.
    const linked = (items ?? []).length > 0;
    const needsReauth = (items ?? []).length > 0 && items!.some((item) => item.status !== "active");

    return res.status(200).json({ linked, needsReauth });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return res.status(401).json({ error: err.message });
    }
    console.error("status failed", err);
    return res.status(500).json({ error: "Failed to check status" });
  }
}
