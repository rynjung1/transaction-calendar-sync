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
export function safeErrorInfo(err: unknown): unknown {
  if (err && typeof err === "object" && "isAxiosError" in err && (err as { isAxiosError?: unknown }).isAxiosError) {
    const axiosErr = err as { message?: string; response?: { status?: number; data?: unknown } };
    return {
      message: axiosErr.message,
      httpStatus: axiosErr.response?.status,
      plaidError: axiosErr.response?.data,
    };
  }
  if (err instanceof Error) {
    return { message: err.message, name: err.name };
  }
  return err;
}
