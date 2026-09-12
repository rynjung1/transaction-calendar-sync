# Transaction Calendar Sync

*Syncs bank transactions to the user's calendar as timestamped, location-tagged spending events.*

**Repo**: https://github.com/rynjung1/transaction-calendar-sync

## What this app does
Connects to the user's bank account via Plaid, pulls transaction data (merchant, amount, timestamp, category), and writes each transaction as an event on the user's device calendar (whichever calendar they choose — Google, iCloud, or local — via the native calendar API). The goal: a passive spending diary that shows up automatically on the calendar you already check.

## Target platforms
- iOS only. Was originally iOS + Android; changed in hindsight — user doesn't have an Android device to test on. Android config in `mobile/app.config.ts`/`eas.json` is left in place (permissions, adaptive icon assets, build profile) as harmless dead weight rather than stripped out, in case Android gets picked back up later — don't build or test against it as an active target, and don't invest further effort keeping its config current.
- Built with Expo (React Native) + a custom dev client, using EAS Build for App Store submission. Not compatible with Expo Go — Plaid's SDK requires native modules.

## Confirmed architecture (do not deviate without discussing first)

### Frontend — `mobile/`
- Expo (React Native), TypeScript
- `react-native-plaid-link-sdk` v13+ (session-based API: `createPlaidLinkSession`, not the legacy `PlaidLink` component)
- `react-native-calendar-events` for writing to the device calendar (wraps EventKit on iOS, CalendarProvider on Android) — this is the ONLY calendar integration needed, do not build separate Google Calendar API / EventKit integrations, this library covers both
- App lets the user pick which on-device calendar to write to (calendar selection is handled by `findCalendars()` from this library)
- Android `minSdkVersion` is pinned to 26 via `expo-build-properties` (`mobile/app.config.ts`) — Plaid's Android SDK (`com.plaid.link:sdk-core`) requires it and fails the manifest merger at Expo's default of 24. Don't lower this without checking Plaid's SDK requirement first. iOS deployment target hasn't been checked against Plaid's iOS SDK's own minimum (its podspec declares `ios 15.1`) — verify before the first iOS device/simulator build with this Plaid SDK version.
- **Untested risk, not yet exercised at runtime**: `expo-doctor` flags `react-native-calendar-events` and `react-native-plaid-link-sdk` — the two libraries this app's core functionality depends on — as untested against React Native's New Architecture. At this project's actual versions (`react-native 0.86.3`, Expo SDK `~57`), that's not a "probably on by default" situation: the old architecture has been removed entirely, so New Architecture is the only one available, not a toggle. A Simulator/device build compiling successfully only proves it compiles, not that Plaid Link's native flow or the actual calendar write behaves correctly at runtime. Must be exercised for real — a real Plaid Link session through to a real calendar event written — before trusting either library, not assumed from a clean build.

### Backend — `backend/`
- Vercel serverless functions (TypeScript, `@vercel/node`)
- Responsibilities ONLY:
  1. Create Plaid `link_token` (must happen server-side, never in the client)
  2. Exchange `public_token` for `access_token` after Link success, store `access_token` encrypted
  3. Receive Plaid webhooks (`SYNC_UPDATES_AVAILABLE`, `ITEM_LOGIN_REQUIRED`, `ITEM_ERROR`)
  4. Call Plaid's Transactions Sync endpoint when webhook fires (or on a user-initiated refresh), return new transactions to client
- Do NOT poll Plaid on a timer — use the webhook + sync pattern (`backend/lib/plaidSync.ts`)
- `backend/api/plaid/webhook.ts` is the one endpoint that can't use `requireUser()` (Plaid has no user session) — it verifies Plaid's `Plaid-Verification` JWT instead (`backend/lib/plaidWebhookVerify.ts`: signature against Plaid's published key, `iat` freshness, and a body-hash check against the actual raw bytes received). A request that fails this check is rejected outright (401/400), not acked with 200 — unlike genuine processing errors after a request passes verification, which still return 200 to avoid Plaid's retry storms. This requires real `PLAID_CLIENT_ID`/`PLAID_SECRET` at runtime, since key lookup is a real Plaid API call.

### Database
- Postgres via Supabase (also provides auth, so we get user accounts for free)
- Schema defined in `backend/supabase/migrations/0001_init.sql`: `users`, `plaid_items` (encrypted access_token, item_id, institution, sync cursor), `synced_transactions` (dedupe key, calendar_event_id, status)
- Backend writes with the service-role key; RLS policies exist for any direct client reads

### Auth
- Supabase Auth — so a user's Plaid connection persists across app reinstalls / device changes
- Session storage moved from plain `AsyncStorage` to `expo-secure-store` (`mobile/src/lib/supabase.ts`, iOS Keychain / Android Keystore-backed) — fixed, but not yet runtime-verified since it's a native module change and the installed Simulator build predates it.

### Mobile security (findings from a dedicated review)
- **App Store blocker — fixed and verified end-to-end, not assumed**: `expo-dev-client`'s launcher screen used to ship in *every* EAS build profile, including `production` (the `eas.json` `developmentClient` flag has no effect on this). Traced through `expo-dev-launcher`'s `EXDevLauncherController.m` and confirmed empirically: excluding `"expo-dev-client"` from `app.config.ts`'s `plugins` array alone is **not sufficient** — it left the generated `AppDelegate.swift` byte-identical, because CocoaPods autolinking (`use_expo_modules!` in the generated Podfile) links every Expo native module found in `node_modules` regardless of the `plugins` array, and that's what actually wires `expo-dev-launcher`'s AppDelegate-subscriber hook into the autolinking-generated `ExpoModulesProvider.swift`. The real fix is `mobile/plugins/withExcludeDevClientFromProductionAutolinking.js`, applied only when `EAS_BUILD_PROFILE === "production"` (`mobile/app.config.ts`, which replaced the old static `app.json`): it passes `exclude: ['expo-dev-client', 'expo-dev-launcher', 'expo-dev-menu']` to `use_expo_modules!`. Verified by running real `expo prebuild` both ways: production profile → zero `DevLauncher`/`DevMenu` references in `ExpoModulesProvider.swift` and `Podfile.lock`; no profile set (normal local dev) → both present as before. `expo-updates` deliberately stays in all profiles including production (legitimate for real OTA updates) — only the interactive dev-launcher UI is excluded.
- **Calendar privacy — mitigated, not eliminated**: `createTransactionEvent()` (`mobile/src/lib/calendar.ts`) still puts the merchant name and exact dollar amount directly into the calendar **event title** — that's the app's core feature, not something to remove. What's fixed: `CalendarPickerScreen.tsx` now confirms with the user before writing to a calendar, naming the actual calendar and its source and spelling out exactly what becomes visible. Checked `react-native-calendar-events`'s `Calendar` type first — no field indicates whether a calendar is actually shared (title/source/isPrimary/allowsModifications only), so this can't be auto-detected and gated only for the risky case; the confirmation runs every time instead, which is fine since this screen only appears once per calendar choice.
- Passed cleanly, checked directly rather than assumed: no `NSAppTransportSecurity`/`NSAllowsArbitraryLoads` exceptions weakening TLS in `app.config.ts`; no custom `Linking`/deep-link handling in the app's own code that could act on attacker-controlled URL parameters (Supabase client has `detectSessionInUrl: false`).
- The 11/5 `npm audit` warnings in `mobile/`/`backend/` (uuid buffer-bounds bug via `xcode`→`@expo/config-plugins`; `ajv`/`path-to-regexp`/`undici` via `@vercel/node`) are real CVEs but confirmed build-tooling-only — every `@vercel/node` import in `backend/` is `import type` (erased at compile time, never executed), and the vulnerable mobile chain only runs during `expo prebuild`, never shipped in the app bundle. `npm audit fix --force` in both cases suggests a major-version *downgrade* (Expo 46, `@vercel/node` 4.0.0) — do not apply it, it would break the app for no real security gain. Not re-litigating this without new evidence.

### Deployment
- Backend is deployed to Vercel (project `ryan-95ce/backend`). Stable production URL: `https://backend-theta-fawn-72.vercel.app` — `mobile/app.config.ts`'s `extra.apiBaseUrl` points here, and `PLAID_WEBHOOK_URL` (set as a Vercel production env var, not in this repo) points to `<that URL>/api/plaid/webhook`.
- All six required env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `TOKEN_ENCRYPTION_KEY`, `PLAID_WEBHOOK_URL`) are set on Vercel for the Production environment only — not Preview or Development. Add them there too if preview deploys or `vercel dev` need to hit real Plaid/Supabase.
- Redeploy (`vercel --prod`) after any env var change — existing warm function instances don't pick up new values without one.

## Key constraints
- User is targeting production App Store deployment, not just personal/dev use — so Plaid production access application (not just sandbox) will eventually be required. Sandbox/dev mode is fine for initial build.
- Bank is in Canada — confirm Plaid supports the user's specific institution before assuming full feature parity with US banks.
- Never store Plaid `access_token` unencrypted. Never generate `link_token` client-side.
- One calendar event per transaction (not daily digest) unless this changes — confirm before altering event granularity.
- Location on events: bank transaction data typically only gives merchant name, not GPS coordinates. Don't assume precise location is available — plan to use merchant name in the event title/location field rather than requiring geocoding, unless we explicitly decide to add a Places lookup step.

## Working style for this project
- Confirm before writing/changing code — do not just implement without checking in first, especially for architecture-level decisions (data models, auth flow, token handling).
- When claims are made about test results, working code, or fixes, they need real pasted evidence (actual output, not a summary) before being treated as verified.
- A single test case or single transaction/event tested successfully is not sufficient to declare a feature working project-wide — needs testing across multiple transaction types/edge cases before being called done.

## Open questions / not yet decided
- Exact Supabase schema may evolve beyond `0001_init.sql` as features are added
- Whether to support multiple linked bank accounts per user at launch or just one (schema already supports it — one `plaid_items` row per item, all synced by `/api/plaid/sync`)
- Whether categories from Plaid get surfaced in the calendar event (e.g. color-coding by category) — currently stored (`synced_transactions.category`) but only used in the event notes field, not for color-coding
- ~~Development environment currently runs on Node 18~~ — resolved, confirmed Node 20.20.2 in the active dev environment now.
- **Must-fix now that the category-exclusion settings UI is built**: `syncPlaidItem()`'s category filter (`backend/lib/plaidSync.ts`) derives category as `personal_finance_category?.primary ?? category?.[0] ?? null`, but `sync_filters.excluded_categories` only ever holds PFC `primary` values. A transaction with no PFC enrichment falls back to the legacy `category` taxonomy and can never match an exclusion — silent no-op. This was "not urgent" while `excluded_categories` was empty for everyone; it stops being theoretical the moment someone actually uses the settings screen (`mobile/src/screens/SettingsScreen.tsx`, built but not yet runtime-verified — see Deployment/testing notes) to exclude a category. Write-side validation (`PATCH /api/settings/sync-filters` → `backend/lib/plaidCategories.ts`'s 16-value PFC constant) guarantees `excluded_categories` only ever contains valid PFC values, but does nothing about transactions that never get a PFC value assigned in the first place. Still needs reconciling (normalize both taxonomies, or document as a known gap) before this is exercised for real.
- **N+1 `sync_filters` fetch**: `syncPlaidItem()` (`backend/lib/plaidSync.ts`) does its own `users.sync_filters` lookup per call, keyed off `item.user_id`. If a user has multiple linked `plaid_items` rows, a sync pass that iterates all of a user's items (e.g. `/api/plaid/sync`) re-fetches the same `sync_filters` once per item instead of once per user. Not urgent since "multiple linked accounts per user" is still an open question above, but worth batching (fetch once per sync-all-items call, pass `filters` into `syncPlaidItem` instead of re-querying inside it) once that's decided either way.
- **Not yet actually verified at runtime**: a real Plaid Link session through to a real calendar event written — the specific test the New Architecture risk (above) calls for — hasn't happened yet. The dev-client build compiles and installs fine on Simulator, but this dev machine's Metro dev server repeatedly gets OOM-killed by the sandbox's low-memory guard whenever multiple Claude Code sessions are running (each ~250-400MB; 5+ concurrent sessions reliably starves Metro of the ~500MB+ headroom it needs to survive bundling). A parallel attempt to sidestep this via `expo-updates` (publish JS via `eas update`, load from the dev-launcher's "Updates" tab, no local Metro needed) hit a real, reproducible crash in `expo-dev-launcher`'s own update-loading code (`EXDevLauncherUpdatesHelper createUpdatesConfigurationWithURL:...`, nil object inserted into a dictionary) — not fixed, not pursued further. Next attempt should either happen when fewer local sessions are competing for memory, or dig into that dev-launcher crash properly.
