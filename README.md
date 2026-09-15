# Transaction Calendar Sync

Connects to a bank account via Plaid and writes each new transaction as an event on the user's chosen device calendar (Google, iCloud, or local) — a passive spending diary in the calendar app they already check.

See [CLAUDE.md](./CLAUDE.md) for full architecture, constraints, and open decisions.

## How it works

1. **Link** — the mobile app opens Plaid Link (`react-native-plaid-link-sdk`); the resulting `public_token` is exchanged server-side for an `access_token`, which is encrypted and stored in Supabase.
2. **Sync** — the backend calls Plaid's Transactions Sync endpoint (cursor-based, not a timer poll) whenever a `SYNC_UPDATES_AVAILABLE` webhook fires, or when the user pulls to refresh. New transactions land in `synced_transactions`.
3. **Calendar write** — the app fetches synced transactions and creates one event per transaction (merchant + amount as the title, merchant as location, category as notes) on whichever writable on-device calendar the user picked (`findCalendars()` from `react-native-calendar-events`, changeable later from Settings). The backend is told the resulting `calendar_event_id` so the same transaction isn't recreated on a later sync.
4. **Insights** — a monthly summary screen shows total spend, month-over-month change, a trend chart, and a category breakdown, built from the same synced transactions.

## Layout

```
mobile/    Expo (React Native) app — the only client
backend/   Vercel serverless functions — Plaid + Supabase glue
```

### `mobile/`

Expo + TypeScript, using a custom dev client (**not** compatible with Expo Go, since Plaid's SDK requires native modules).

- `src/screens/`
  - `AuthScreen.tsx` — Supabase Auth (email sign-in), Privacy Policy / Terms of Service links, an optional Cloudflare Turnstile challenge on sign-in/sign-up (inert until a site key is configured — see CLAUDE.md's "Mobile security")
  - `LinkAccountScreen.tsx` — Plaid Link flow; also reused for "add another bank account" from Settings
  - `CalendarPickerScreen.tsx` — choose which device calendar to write to; handles a denied permission with a real recovery path (Open Settings / Try again), not a dead end
  - `HomeScreen.tsx` — synced transaction list, sync/refresh (paginated — see below)
  - `InsightsScreen.tsx` — monthly spend summary, trend chart, category breakdown
  - `SettingsScreen.tsx` — min-amount/excluded-category sync filters, add another bank account, change calendar, delete account
- `src/lib/`
  - `api.ts` — authenticated fetch wrapper around the backend endpoints below, retries once on a 401 via a forced session refresh
  - `calendar.ts` — permissions, calendar listing, event creation/removal via `react-native-calendar-events`
  - `supabase.ts` — Supabase client (publishable key), session storage backed by `expo-secure-store` (iOS Keychain)
  - `sentry.ts` — crash/error reporting init (no-ops until a DSN is configured) and `captureError()`, called from every screen's real catch sites, not just uncaught crashes
  - `dates.ts`, `currency.ts`, `percentages.ts`, `storageKeys.ts`, `syncAccumulator.ts` — pure, RN-import-free logic extracted out of the screens/libs that used to embed it inline, specifically so it's unit-testable (see `npm test` below)
  - `theme.ts`, `typography.ts`, `spacing.ts` — shared UI tokens
- `src/components/`
  - `TurnstileChallenge.tsx` — Cloudflare Turnstile widget (WebView-hosted; no native RN SDK exists)

A Vitest suite (`npm test`, 34 tests across 7 files) covers the RN-import-free logic in `src/lib/` above — see CLAUDE.md's "Mobile testing" section for exactly what's covered (several real, previously-shipped bugs — a timezone anchor bug, a currency-default bug, a multi-page sync dedup bug) and what's deliberately not (real component/screen behavior, verified instead against actual Simulator runs and direct EventKit database queries).

### `backend/`

Vercel serverless functions (TypeScript, `@vercel/node`). Every route requires a Supabase-authenticated user (`lib/auth.ts`) except the Plaid webhook, which instead verifies Plaid's own signed `Plaid-Verification` JWT (`lib/plaidWebhookVerify.ts`) — it can't use a user session since Plaid has no user context, but it's not unauthenticated.

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/plaid/create-link-token` | POST | Creates a Plaid `link_token` server-side |
| `/api/plaid/exchange-token` | POST | Exchanges `public_token` for an `access_token`, encrypts and stores it, best-effort runs an initial sync (a transient failure here doesn't undo the link) |
| `/api/plaid/status` | GET | `{linked, needsReauth}` — `linked` means "has completed onboarding at least once" (any `plaid_items` row, any status), distinct from `needsReauth` (`true` when any item isn't `active`, e.g. needs re-authentication) |
| `/api/plaid/sync` | POST | User-initiated refresh — syncs every active `plaid_items` row for the user (skipping any item synced within the last 30s, a cooldown against repeated calls, e.g. from the pagination loop below), then returns a **page** of pending transactions (`{transactions, hasMore, total}`) so a large backlog doesn't come back as one unbounded response |
| `/api/plaid/webhook` | POST | Plaid webhook receiver — signature-verified (see above). Handles `SYNC_UPDATES_AVAILABLE`, `ITEM_ERROR`, `LOGIN_REPAIRED`, `USER_PERMISSION_REVOKED`, `USER_ACCOUNT_REVOKED`; logs (without acting on) `PENDING_DISCONNECT` |
| `/api/transactions/monthly` | GET | One month's transactions plus the previous month's total, for the Insights screen |
| `/api/transactions/confirm` | POST | Records the `calendar_event_id` once the client has written an event, so it isn't recreated |
| `/api/settings/sync-filters` | GET / PATCH | Reads/writes a user's `min_amount` + `excluded_categories` sync filters |
| `/api/account` | DELETE | Permanently deletes the account — revokes every linked Plaid item, then deletes the Supabase Auth user (cascades to all app data) |

Shared logic lives in `lib/`: `plaid.ts` (client setup, validates `PLAID_ENV` against the SDK's actual supported values), `plaidSync.ts` (the sync-cursor helper called by both `sync.ts` and the webhook — applies sync filters, handles Plaid's `modified`/`removed` transaction arrays for still-pending transactions, checkpoints the cursor per page with a real compare-and-swap), `plaidCategories.ts` (the single valid-PFC-category-list source of truth), `legacyCategoryMapping.ts` (Plaid's own legacy-category → PFC mapping, for filtering transactions that predate PFC enrichment), `plaidWebhookVerify.ts` (webhook signature verification, including verification-key expiry), `logging.ts` (`safeErrorInfo()` — strips secrets/tokens out of Plaid SDK errors before they're ever logged), `crypto.ts` (access-token encryption), `supabase.ts` (service-role client), `auth.ts` (verifies the caller's Supabase session).

A real test suite (Vitest, `npm test`) covers the DB-independent logic above — see CLAUDE.md's "Backend resilience" section for what's covered and what's deliberately not (the DB-dependent behavior verified against the real Supabase test database this session).

### Database

Postgres via Supabase (also provides auth). Schema in `backend/supabase/migrations/`:

- `0001_init.sql` — `users`, `plaid_items` (encrypted access token, item id, institution, sync cursor), `synced_transactions` (dedupe key, calendar event id, status); RLS enabled on all three, with SELECT policies for direct client reads.
- `0002_grants.sql` — table/sequence grants for `service_role`, needed because these tables were created via raw SQL rather than the dashboard Table Editor. Only `service_role` is ever granted table privileges here — `authenticated`/`anon` never are, which (verified live) means `0001_init.sql`'s SELECT policies are actually unreachable today: Postgres denies the query at the grant layer before RLS is ever evaluated.
- `0003_sync_filters.sql` — adds `users.sync_filters` (jsonb: `min_amount`, `excluded_categories`), defaulted so no backfill was needed.
- `0004_drop_unused_select_policies.sql` — drops those now-dead-code SELECT policies outright, so a future unrelated `GRANT SELECT ... TO authenticated` can't silently reactivate them. **Not yet applied to the live database** — needs to be run manually via the Supabase SQL Editor.
- `0005_add_last_synced_at.sql` — adds `plaid_items.last_synced_at`, backing `/api/plaid/sync`'s rate-limiting cooldown (see below). **Not yet applied** — same manual step as `0004`, though `sync.ts` runs correctly either way and the cooldown simply activates once it's run.

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run the migrations in `backend/supabase/migrations/` against it, in order (SQL Editor, or the Supabase CLI).
3. Grab the Project URL, anon key, and service-role key from Project Settings → API.

### 2. Plaid

1. Get sandbox credentials from the [Plaid dashboard](https://dashboard.plaid.com).
2. Confirm your target Canadian institution is supported in sandbox before assuming production parity.
3. Production access (beyond sandbox) will need a separate application to Plaid before App Store launch.

### 3. Backend (`backend/`)

```bash
cd backend
npm install
cp .env.example .env   # fill in Supabase + Plaid values below
npm run typecheck
```

Required environment variables (see `.env.example`):

| Variable | Notes |
| --- | --- |
| `SUPABASE_URL` | Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API — server-only, never ship to the client |
| `PLAID_CLIENT_ID`, `PLAID_SECRET` | Plaid Dashboard → Team Settings → Keys |
| `PLAID_ENV` | `sandbox` for development |
| `PLAID_WEBHOOK_URL` | Publicly reachable URL for the deployed `/api/plaid/webhook` |
| `TOKEN_ENCRYPTION_KEY` | 32 random bytes, base64-encoded — generate with the command below |

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Deploy with `vercel --prod` (or `vercel dev` locally), then set `PLAID_WEBHOOK_URL` to the deployed URL and add the same env vars in the Vercel project's Production environment. Currently deployed at `https://backend-theta-fawn-72.vercel.app` — see CLAUDE.md's Deployment section for the full env var list and the "redeploy after any env var change" caveat.

### 4. Mobile (`mobile/`)

```bash
cd mobile
npm install
```

Edit `app.config.ts`'s `extra` object with your backend URL and Supabase project URL/anon key (safe to ship in the client — the anon key is public by design; the service-role key never leaves `backend/`):

```ts
extra: {
  apiBaseUrl: "https://your-backend.vercel.app",
  supabaseUrl: "https://<project-ref>.supabase.co",
  supabaseAnonKey: "<anon key>",
  sentryDsn: "",        // optional — crash reporting no-ops until set
  turnstileSiteKey: "", // optional — brute-force challenge no-ops until set
},
```

Because this app uses `react-native-plaid-link-sdk` (a native module), it cannot run in Expo Go:

```bash
npx expo prebuild
npx expo run:ios
```

**iOS only** — originally targeted iOS + Android; changed because there's no Android device to test on. Android config in `app.config.ts`/`eas.json` is left in place as harmless dead weight rather than stripped out, in case Android gets picked back up later, but isn't an active build/test target.

## Node version

Needs Node 20+ (Expo SDK 57 / React Native 0.86, Supabase JS all require it) — confirmed working on Node 20.20.2.

## Status

The core flow (sign up → link a bank via Plaid → sync → write real calendar events) has been run end-to-end on a real device build and independently verified below the app layer (queried the Simulator's own EventKit database directly, not just trusted the UI). Multi-account support and calendar color-coding are both decided (yes, and no, respectively — see CLAUDE.md).

Still open, in roughly the order they'd block an App Store submission:

1. **A business-structure decision** (sole proprietor vs. incorporating) — affects both Apple Developer Program enrollment and the Plaid production application; see `docs/app-store-5.1.1ix-research.md`.
2. **Plaid production access** — currently sandbox only; a draft application is ready at `docs/plaid-production-access-draft.md`.
3. **Plaid OAuth support** — code-side scaffolding is built and live-verified (iOS Associated Domains config, the required `apple-app-site-association` file, the redirect landing page, conditional `redirect_uri` wiring); what's left is account actions, not code: a real Apple Developer Team ID (blocked on the business-structure decision above), registering the redirect URI in the Plaid Dashboard, and a real device test through an actual OAuth-requiring bank. Several major Canadian banks (visible in this app's own institution search) commonly require it, and the sandbox testing above doesn't exercise it.
4. A few housekeeping items: rotating `PLAID_SECRET` (precautionary, see CLAUDE.md), running the pending `0004`/`0005` migrations, sharing the Privacy Policy / Terms of Service artifacts publicly (both currently private-by-default), and a real app icon pass (current one is a deliberate but non-final Pillow placeholder).

The `expo-dev-client` launcher screen that used to ship in every build profile (including `production`) is excluded from production builds, verified by diffing real `expo prebuild` output. See CLAUDE.md's "Mobile security" and "Backend resilience" sections for the full, continually-updated list of what's been found, fixed, and verified — including backend rate limiting on `/api/plaid/sync` (a DB-based cooldown, no new external service — see CLAUDE.md for why it's safe to deploy before its migration is applied) and a few things found and deliberately *not* fixed yet (an abandoned core dependency, a couple of Plaid data-lifecycle edge cases), documented rather than silently carried.

**PIPEDA / privacy**: [`PRIVACY.md`](./PRIVACY.md) is the source-of-truth policy text, published live and linked from the app's sign-in screen. [`TERMS.md`](./TERMS.md) is the Terms of Service, same situation. Both artifacts are private by default and need to be shared publicly (via each page's own share menu) before they're usable as real, linkable URLs (e.g. for an App Store Connect field, or Plaid's own application). Account deletion (PIPEDA retention + App Store Guideline 5.1.1(v)) is built and verified end-to-end, including confirming the Plaid access token is genuinely revoked at Plaid, not just deleted locally.
