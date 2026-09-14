import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const env = process.env.PLAID_ENV ?? "sandbox";
const clientId = process.env.PLAID_CLIENT_ID;
const secret = process.env.PLAID_SECRET;

if (!clientId || !secret) {
  throw new Error("Missing PLAID_CLIENT_ID / PLAID_SECRET env vars");
}

// This SDK version's PlaidEnvironments only defines `production` and
// `sandbox` — Plaid retired the old `development` environment (verified by
// reading the installed SDK source, not assumed). That name is still common
// in older Plaid guides/muscle memory, and every other env var here throws
// loudly if misconfigured — this one silently indexed to `undefined`
// (`basePath: undefined`) with no startup error, surfacing only as a
// confusing low-level HTTP/URL error on the first real API call.
if (!(env in PlaidEnvironments)) {
  throw new Error(
    `Invalid PLAID_ENV "${env}" — must be one of: ${Object.keys(PlaidEnvironments).join(", ")}`
  );
}

const configuration = new Configuration({
  basePath: PlaidEnvironments[env as keyof typeof PlaidEnvironments],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": clientId,
      "PLAID-SECRET": secret,
    },
  },
});

export const plaidClient = new PlaidApi(configuration);
