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
- `src/lib/`
  - `api.ts` — authenticated fetch wrapper around the backend endpoints below
  - `calendar.ts` — permissions, calendar listing, and event creation via `react-native-calendar-events`
  - `supabase.ts` — Supabase client (anon key)
  - `theme.ts`, `typography.ts`, `spacing.ts` — shared UI tokens

### `backend/`

Vercel serverless functions (TypeScript, `@vercel/node`). Every route requires a Supabase-authenticated user (`lib/auth.ts`) except the Plaid webhook.

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/plaid/create-link-token` | POST | Creates a Plaid `link_token` server-side |
| `/api/plaid/exchange-token` | POST | Exchanges `public_token` for an `access_token`, encrypts and stores it, runs an initial sync |
| `/api/plaid/status` | GET | Whether the user has an active linked item |
| `/api/plaid/sync` | POST | User-initiated refresh — syncs every active `plaid_items` row for the user |
| `/api/plaid/webhook` | POST | Plaid webhook receiver (`SYNC_UPDATES_AVAILABLE`, `ITEM_LOGIN_REQUIRED`, `ITEM_ERROR`) |
| `/api/transactions/monthly` | GET | One month's transactions plus the previous month's total, for the Insights screen |
| `/api/transactions/confirm` | POST | Records the `calendar_event_id` once the client has written an event, so it isn't recreated |

Shared logic lives in `lib/`: `plaid.ts` (client setup), `plaidSync.ts` (the sync-cursor helper called by both `sync.ts` and the webhook), `crypto.ts` (access-token encryption), `supabase.ts` (service-role client), `auth.ts` (verifies the caller's Supabase session).

### Database

Postgres via Supabase (also provides auth). Schema in `backend/supabase/migrations/`:

- `0001_init.sql` — `users`, `plaid_items` (encrypted access token, item id, institution, sync cursor), `synced_transactions` (dedupe key, calendar event id, status); RLS enabled on all three (read-only policies — writes go through the backend's service-role key).
- `0002_grants.sql` — table/sequence grants for `service_role`, needed because these tables were created via raw SQL rather than the dashboard Table Editor.

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

Deploy with `vercel deploy` (or `vercel dev` locally), then set `PLAID_WEBHOOK_URL` to the deployed URL and add the same env vars in the Vercel project settings.

### 4. Mobile (`mobile/`)

```bash
cd mobile
npm install
```

Edit `app.json` → `expo.extra` with your backend URL and Supabase project URL/anon key (safe to ship in the client — the anon key is public by design; the service-role key never leaves `backend/`):

```json
"extra": {
  "apiBaseUrl": "https://your-backend.vercel.app",
  "supabaseUrl": "https://<project-ref>.supabase.co",
  "supabaseAnonKey": "<anon key>"
}
```

Because this app uses `react-native-plaid-link-sdk` (a native module), it cannot run in Expo Go:

```bash
npx expo prebuild
npx expo run:ios      # or: npx expo run:android
```

## Node version

Local tooling was scaffolded on Node 18, which several dependencies (Expo SDK 57 / React Native 0.86, Supabase JS) now warn is unsupported — upgrade to Node 20+ before relying on `expo run:ios` / `expo run:android` or the Vercel CLI locally.

## Status

Sandbox/dev only — production Plaid access, a decision on multi-account support, and calendar color-coding by category are all still open. See [CLAUDE.md](./CLAUDE.md#open-questions--not-yet-decided) for the full list.
