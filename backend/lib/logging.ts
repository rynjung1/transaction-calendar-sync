// Plaid's Node SDK is axios-based. An axios error's `.config` (and, on some
// versions, `.request`) embeds the *entire outgoing request* — for every
// Plaid call in this app, that's the `PLAID-SECRET` header (our one master
// credential for the whole Plaid integration, not scoped to one user or
// item), and for item-scoped calls (itemRemove, itemGet, transactionsSync)
// the decrypted access_token in the request body too. `console.error(label,
// err)` on a raw axios error therefore writes both straight into Vercel's
// log retention in plaintext — verified directly: a forced real Plaid error
// logged via a raw error object leaked both a live secret and a canary
// access token into the console output; logging this sanitized shape
// instead did not (checked programmatically, not by eye).
//
// Plaid's own error response body (`err.response.data`: error_code,
// error_type, error_message, request_id, ...) is safe to log — it describes
// what went wrong and never echoes back anything from the request we sent.
//
// Use this everywhere an error that might have come from a Plaid API call
// gets logged, instead of passing the raw `err` to console.error/warn.
// Real gap found on a fresh read-through, after this function had already
// been in use "everywhere, for defense-in-depth" (per its own original
// comment) for a while: a genuine Supabase/PostgREST error — by far the
// single most common error shape in this codebase, since every DB call
// produces one on failure — is a plain object (`{code, details, hint,
// message}`), not an `instanceof Error`. Confirmed directly against a real
// query, not assumed: `error.constructor.name` is `"Object"`. That means
// every one of this codebase's many `safeErrorInfo(dbError)` call sites was
// silently falling through to the final `return err` — logging the object
// completely unprocessed, providing none of the normalization the function
// claims to provide for it. Not an active secret leak in *this* codebase
// specifically (no raw token/secret value is ever bound into a query whose
// failure could echo it back in `details`/`hint` — only `access_token_encrypted`
// touches the DB, and it's ciphertext with no uniqueness constraint on it),
// but the function provided zero actual protection for its most common
// input shape, which is exactly the kind of gap that becomes a real leak
// later as the schema or query patterns evolve, not now. Fixed by extracting
// the same explicit, safe subset PostgREST/Postgres errors expose
// (`code`/`message`/`details`/`hint` — describes what went wrong, same
// posture as the Plaid branch below) instead of relying on an untyped
// fallback for it.
function isPostgrestErrorShape(err: unknown): err is { code?: string; message?: string; details?: string | null; hint?: string | null } {
  return (
    typeof err === "object" &&
    err !== null &&
    !(err instanceof Error) &&
    "message" in err &&
    "code" in err
  );
}

export function safeErrorInfo(err: unknown): unknown {
  if (err && typeof err === "object" && "isAxiosError" in err && (err as { isAxiosError?: unknown }).isAxiosError) {
    const axiosErr = err as { message?: string; response?: { status?: number; data?: unknown } };
    return {
      message: axiosErr.message,
      httpStatus: axiosErr.response?.status,
      plaidError: axiosErr.response?.data,
    };
  }
  if (isPostgrestErrorShape(err)) {
    return { message: err.message, code: err.code, details: err.details, hint: err.hint };
  }
  if (err instanceof Error) {
    return { message: err.message, name: err.name };
  }
  return err;
}
