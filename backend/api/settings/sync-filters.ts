import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../../lib/supabase";
import { requireUser, UnauthorizedError } from "../../lib/auth";
import { PFC_PRIMARY_CATEGORIES, isPfcPrimaryCategory } from "../../lib/plaidCategories";
import type { SyncFilters } from "../../lib/plaidSync";

const DEFAULT_FILTERS: SyncFilters = { min_amount: 0, excluded_categories: [] };
const MAX_MIN_AMOUNT = 1_000_000;

type ValidationResult = { ok: true; filters: SyncFilters } | { ok: false; error: string };

// Rejects on type/finite/range before ever comparing, since a naive
// `value >= 0` on a parsed-JSON string/null/boolean does the wrong thing in
// JS rather than failing loudly.
function validateSyncFilters(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }

  const { min_amount, excluded_categories } = body as Record<string, unknown>;

  if (typeof min_amount !== "number" || !Number.isFinite(min_amount)) {
    return { ok: false, error: "min_amount must be a finite number" };
  }
  if (min_amount < 0 || min_amount > MAX_MIN_AMOUNT) {
    return { ok: false, error: `min_amount must be between 0 and ${MAX_MIN_AMOUNT}` };
  }

  if (!Array.isArray(excluded_categories)) {
    return { ok: false, error: "excluded_categories must be an array" };
  }
  for (const category of excluded_categories) {
    if (!isPfcPrimaryCategory(category)) {
      return { ok: false, error: `excluded_categories contains an invalid category: ${JSON.stringify(category)}` };
    }
  }

  return { ok: true, filters: { min_amount, excluded_categories } };
}

// Reads and writes the calling user's sync_filters (min_amount +
// excluded_categories, applied in syncPlaidItem). GET also returns the
// valid excluded_categories values — the PFC `primary` constant — so the
// mobile settings picker never holds its own copy of that list.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "PATCH") {
    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await requireUser(req);

    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("users")
        .select("sync_filters")
        .eq("id", user.id)
        .single();

      if (error) {
        throw error;
      }

      // Field-level defaulting, not just whole-object — matches plaidSync.ts's
      // own posture of not trusting stored data even though nothing should
      // currently produce a partially-null row.
      const stored = data?.sync_filters as Partial<SyncFilters> | null;
      const sync_filters: SyncFilters = {
        min_amount: stored?.min_amount ?? DEFAULT_FILTERS.min_amount,
        excluded_categories: stored?.excluded_categories ?? DEFAULT_FILTERS.excluded_categories,
      };

      return res.status(200).json({
        sync_filters,
        valid_categories: PFC_PRIMARY_CATEGORIES,
      });
    }

    // PATCH — full replace, not a partial merge.
    const validation = validateSyncFilters(req.body);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    const { error } = await supabaseAdmin
      .from("users")
      .update({ sync_filters: validation.filters })
      .eq("id", user.id);

    if (error) {
      throw error;
    }

    return res.status(200).json({ ok: true, sync_filters: validation.filters });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return res.status(401).json({ error: err.message });
    }
    // TODO: malformed JSON in the request body (Vercel's body parser throwing
    // before validateSyncFilters ever runs) lands here as an undifferentiated
    // 500 rather than a 400. Low priority — the mobile client always sends
    // well-formed JSON — but worth a dedicated JSON.parse try/catch if this
    // endpoint ever gets a less-trusted caller.
    console.error("sync-filters failed", err);
    return res.status(500).json({ error: "Failed to process sync_filters request" });
  }
}
