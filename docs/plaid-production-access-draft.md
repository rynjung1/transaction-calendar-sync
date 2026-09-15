# Plaid production access — draft answers

I can't see Plaid's actual current application form (it's personalized, behind your Plaid Dashboard login, and Plaid's public docs point to that "Launch Center" rather than publishing the exact field list). These are drafted against the standard categories every fintech-data-aggregator production application asks for, based on this project's real, specific details — adapt the wording to whatever the actual form fields say, but the substance should transfer directly.

## Company / product profile

**Product name**: Transaction Calendar Sync

**One-line description**: A personal app that connects to your bank via Plaid and writes each transaction as an event on your own device calendar — a passive spending diary that shows up automatically on the calendar you already check.

**Use case description** (the actual required field as of the Oct 2024 Data Transparency Messaging rollout — you'll need to pick from Plaid's defined use-case list in the dashboard, but here's the plain-language version to match against their options):
> Personal finance visibility / spending tracking. The app reads transaction history (merchant, amount, date, category) from the user's own linked bank account(s) and writes each transaction as a calendar event on a calendar the user selects. No money movement, no lending, no investment advice — read-only visibility into the user's own spending, presented on their own calendar.

**Products used**: Transactions (via Transactions Sync / `/transactions/sync`). Not using Auth, Identity, Balance, Investments, Assets, Payment Initiation, or Income.

**Countries**: Canada (primary), United States (secondary — `country_codes: [CA, US]` is set in `linkTokenCreate`, matching this project's institution search).

## Volume / scale

Be honest and modest here — this reads as a small, early-stage personal project, not enterprise scale:

> Currently pre-launch, targeting an initial App Store release. Expected initial volume: low hundreds of users in the first months post-launch, growing organically. No B2B/enterprise distribution planned; this is a direct-to-consumer app.

(Fill in real numbers if you have a specific launch/marketing plan — Plaid's review may ask follow-up questions if the volume estimate seems inconsistent with your actual usage once live.)

## Monetization

State your actual model here — the app doesn't have a business model built into it as of this session's work (no in-app purchase, no subscription, no ads implemented). If that's still accurate:

> Not yet monetized. [Update if/when you decide: free app / one-time purchase / subscription / etc.]

## Data handling & security (this is the section reviewers scrutinize hardest)

> - Access tokens are encrypted at rest with AES-256-GCM before storage; the encryption key is never stored alongside the encrypted data.
> - All API access is server-side only (Vercel serverless functions) — the mobile client never receives or handles a Plaid `access_token` or `client_secret` directly; it only ever calls our own backend, authenticated via Supabase Auth.
> - We use the Transactions Sync (`/transactions/sync`) pattern exclusively, driven by Plaid's `SYNC_UPDATES_AVAILABLE` webhook plus user-initiated refresh — no timer-based polling.
> - Plaid webhooks are cryptographically verified (ES256 JWT signature against Plaid's published key, freshness check, and a body-hash check) before being processed.
> - Users can permanently delete their account in-app, which calls Plaid's `/item/remove` to formally revoke the access token at Plaid (not just delete our copy of it) before deleting all associated data.
> - The Items connection is monitored via webhooks for `USER_PERMISSION_REVOKED`/`USER_ACCOUNT_REVOKED` (bank-side revocation) and `ITEM_LOGIN_REQUIRED` (needs re-auth), both surfaced to the user with a reconnect path — not left silently stale.
> - `/transactions/sync` calls are rate-limited per linked item (a cooldown after each successful sync) so a client bug or a compromised session token can't drive unbounded call volume against Plaid's API.
> - A PIPEDA-compliant privacy policy is published and linked in-app.

## Privacy policy & terms of service URLs

- Privacy policy: [insert your published, publicly-shared privacy policy URL here — `PRIVACY.md` is the source text, published at `https://claude.ai/code/artifact/4e325609-3c98-4037-a842-c39e4b7fce07` but still private by default; share it via the page's own share menu first]
- Terms of service: [insert your published, publicly-shared terms of service URL here — `TERMS.md` is the source text, published at `https://claude.ai/code/artifact/33d1e392-0850-42bf-b17f-75cc5456d2b9`, same private-by-default caveat as the privacy policy above]

## OAuth redirect URI

**Flag this before submitting**: as documented in `CLAUDE.md`, this project's `linkTokenCreate` call does not currently set a `redirect_uri`, and no code exists yet to handle an inbound OAuth redirect. Several major Canadian banks (RBC, TD, Scotiabank, BMO, CIBC — all visible in this app's own institution search) commonly require OAuth-based Plaid Link. If Plaid's production application asks for OAuth redirect URIs (it likely will, per their own Link SDK README), this needs to be resolved — registering a redirect URI and implementing the mobile-side handling — before real users with an OAuD-requiring bank can actually complete Link in production, not just before the application itself.

## Company / legal entity fields

Whatever the form asks here should match whatever you land on for the App Store Guideline 5.1.1(ix) question — see `docs/app-store-5.1.1ix-research.md`. Plaid's own terms may have a similar "must be a legitimate business, not evaluated for personal/hobby use" posture for production (worth confirming once you're in the actual dashboard), so the same underlying decision (sole proprietor vs. incorporated entity) likely affects both applications, not just Apple's.
