// Loads backend/.env before any test file runs, so lib modules that read
// env vars at import time (crypto.ts's TOKEN_ENCRYPTION_KEY, plaid.ts's
// PLAID_CLIENT_ID/SECRET/ENV, supabase.ts's SUPABASE_URL/SERVICE_ROLE_KEY —
// all of which throw at module load if missing) work the same way under
// the test runner as they do in the actual deployed function. Uses Node's
// built-in loader (20.6+, confirmed available — this project runs 20.20.2)
// rather than adding a dotenv dependency just for this.
import { fileURLToPath } from "node:url";
import path from "node:path";

try {
  const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), ".env");
  process.loadEnvFile(envPath);
} catch {
  // Missing .env locally (e.g. a fresh clone before it's been created) —
  // tests that need real secrets will fail with a clear "Missing X env var"
  // error from the module itself rather than a confusing loader failure.
}
