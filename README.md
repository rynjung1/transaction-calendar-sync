# Transaction Calendar Sync

Connects to a bank account via Plaid and writes each new transaction as an event on the user's chosen device calendar (Google, iCloud, or local) — a passive spending diary in the calendar app they already check.

See [CLAUDE.md](./CLAUDE.md) for full architecture, constraints, and open decisions.

## How it works

1. **Link** — the mobile app opens Plaid Link (`react-native-plaid-link-sdk`); the resulting `public_token` is exchanged server-side for an `access_token`, which is encrypted and stored in Supabase.
2. **Sync** — the backend calls Plaid's Transactions Sync endpoint (cursor-based, not a timer poll) whenever a `SYNC_UPDATES_AVAILABLE` webhook fires, or when the user pulls to refresh. New transactions land in `synced_transactions`.
3. **Calendar write** — the app fetches synced transactions, picks a writable on-device calendar (`findCalendars()` from `react-native-calendar-events`), and creates one event per transaction (merchant + amount as the title, merchant as location, category as notes). The backend is told the resulting `calendar_event_id` so the same transaction isn't recreated on a later sync.
4. **Insights** — a monthly summary screen shows total spend, month-over-month change, a trend chart, and a category breakdown, built from the same synced transactions.

## Layout

```
mobile/    Expo (React Native) app — the only client
backend/   Vercel serverless functions — Plaid + Supabase glue
```

### `mobile/`

Expo + TypeScript, using a custom dev client (**not** compatible with Expo Go, since Plaid's SDK requires native modules).

- `src/screens/`
  - `AuthScreen.tsx` — Supabase Auth (email sign-in)
  - `LinkAccountScreen.tsx` — Plaid Link flow
  - `CalendarPickerScreen.tsx` — choose which device calendar to write to
  - `HomeScreen.tsx` — synced transaction list, sync/refresh
  - `InsightsScreen.tsx` — monthly spend summary, trend chart, category breakdown
  - `SettingsScreen.tsx` — min-amount and excluded-category sync filters
- `src/lib/`
  - `api.ts` — authenticated fetch wrapper around the backend endpoints below
  - `calendar.ts` — permissions, calendar listing, and event creation via `react-native-calendar-events`
  - `supabase.ts` — Supabase client (anon key)
  - `theme.ts`, `typography.ts`, `spacing.ts` — shared UI tokens

### `backend/`

Vercel serverless functions (TypeScript, `@vercel/node`). Every route requires a Supabase-authenticated user (`lib/auth.ts`) except the Plaid webhook, which instead verifies Plaid's own signed `Plaid-Verification` JWT (`lib/plaidWebhookVerify.ts`) — it can't use a user session since Plaid has no user context, but it's not unauthenticated.

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/plaid/create-link-token` | POST | Creates a Plaid `link_token` server-side |
| `/api/plaid/exchange-token` | POST | Exchanges `public_token` for an `access_token`, encrypts and stores it, runs an initial sync |
| `/api/plaid/status` | GET | Whether the user has an active linked item |
| `/api/plaid/sync` | POST | User-initiated refresh — syncs every active `plaid_items` row for the user |
| `/api/plaid/webhook` | POST | Plaid webhook receiver (`SYNC_UPDATES_AVAILABLE`, `ITEM_LOGIN_REQUIRED`, `ITEM_ERROR`) — signature-verified, see above |
| `/api/transactions/monthly` | GET | One month's transactions plus the previous month's total, for the Insights screen |
| `/api/transactions/confirm` | POST | Records the `calendar_event_id` once the client has written an event, so it isn't recreated |
| `/api/settings/sync-filters` | GET / PATCH | Reads/writes a user's `min_amount` + `excluded_categories` sync filters |

Shared logic lives in `lib/`: `plaid.ts` (client setup), `plaidSync.ts` (the sync-cursor helper called by both `sync.ts` and the webhook, applies the sync filters), `plaidCategories.ts` (the single valid-PFC-category-list source of truth), `plaidWebhookVerify.ts` (webhook signature verification), `crypto.ts` (access-token encryption), `supabase.ts` (service-role client), `auth.ts` (verifies the caller's Supabase session).

### Database

Postgres via Supabase (also provides auth). Schema in `backend/supabase/migrations/`:

- `0001_init.sql` — `users`, `plaid_items` (encrypted access token, item id, institution, sync cursor), `synced_transactions` (dedupe key, calendar event id, status); RLS enabled on all three (read-only policies — writes go through the backend's service-role key).
- `0002_grants.sql` — table/sequence grants for `service_role`, needed because these tables were created via raw SQL rather than the dashboard Table Editor.
- `0003_sync_filters.sql` — adds `users.sync_filters` (jsonb: `min_amount`, `excluded_categories`), defaulted so no backfill was needed.

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

Sandbox/dev only — production Plaid access, a decision on multi-account support, and calendar color-coding by category are all still open. See [CLAUDE.md](./CLAUDE.md#open-questions--not-yet-decided) for the full list.

The `expo-dev-client` launcher screen that used to ship in every build profile (including `production`) is now excluded from production builds — see CLAUDE.md's "Mobile security" section for how, and for other findings from a dedicated review (calendar privacy is still an open one).
