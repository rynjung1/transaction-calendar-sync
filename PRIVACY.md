# Privacy Policy — Transaction Calendar Sync

**Last updated:** September 14, 2026

This policy explains what personal information Transaction Calendar Sync ("the app") collects, why, and what you can do about it. It's written to meet Canada's *Personal Information Protection and Electronic Documents Act* (PIPEDA), since the app is built for use with a Canadian bank account.

## Who this policy covers

Transaction Calendar Sync is operated by Ryan Jung. There is no separate corporate entity at this time — this policy will be updated if that changes.

**Contact for any privacy question, request, or complaint:** ryanjung2007@gmail.com

## What the app collects, and why

| Data | Why it's collected | Source |
| --- | --- | --- |
| Email address | To create and secure your account | You, at sign-up |
| Bank transaction data (merchant name, amount, date/time, category) | To create calendar events representing your spending | Plaid, from your linked bank account |
| Which calendar you choose | To know where to write events | You, on-device |
| Sync preferences (minimum amount, excluded categories) | To apply the filters you've configured | You, in Settings |

The app does **not** collect your bank login credentials. Those go directly to Plaid and your bank; the app only ever receives a secure access token from Plaid, which is encrypted before it's stored.

The app does **not** read your existing calendar events — it only requests permission to list your calendars (so you can pick one) and to add new events to the one you choose.

## How your information is used

Solely to provide the app's one function: turning your bank transactions into calendar events on the calendar you pick, and showing you a spending summary inside the app. Your data is never sold, and never used for advertising.

## Who else touches your information

- **Plaid** — connects to your bank and provides transaction data. See [Plaid's privacy policy](https://plaid.com/legal/#end-user-privacy-policy).
- **Supabase** — hosts the app's database and handles sign-in. Your data is stored on Supabase's infrastructure in the United States (AWS, us-east-1 region).
- **Vercel** — runs the app's backend server logic, also hosted in the United States.
- **Apple / Google** — if you choose an iCloud or Google calendar, the events the app creates are stored there under that provider's own terms, not this app's.
- **Sentry** — if enabled, receives crash and error reports (e.g. device/OS information, a stack trace, and diagnostic details about what the app was doing when something went wrong) so problems can be found and fixed. Your bank login, your Plaid access token, and your app password are never sent to Sentry or anywhere else outside the app's own backend. See [Sentry's privacy policy](https://sentry.io/privacy/).
- **Cloudflare** — if enabled, its Turnstile service runs an automated check when you sign in or sign up, to help prevent automated abuse of the app's login. See [Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/).

**Cross-border disclosure:** because Supabase and Vercel host their infrastructure in the United States, your personal information is processed and stored outside Canada and may be accessible to foreign courts, law enforcement, or national security authorities under the laws of that jurisdiction.

## Security

Your Plaid access token is encrypted (AES-256-GCM) before it's stored — never stored in plain text. Every request to the app's backend is authenticated and scoped to your own account, so it only ever reads or writes your own data; the database itself is also locked down so it can't be queried directly from outside the app's own backend. Your session is stored using your device's secure hardware-backed storage (iOS Keychain), not plain app storage.

No security measure is perfect. If a breach occurs that creates a real risk of significant harm to you, you'll be notified as soon as feasible, consistent with PIPEDA's breach notification requirements.

## How long your information is kept

Your data is kept as long as your account is active. There is currently no automatic deletion after a period of inactivity — you can request or perform deletion at any time (see below).

## Your rights

You can, at any time:

- **See your own data** — the app itself shows you every synced transaction (Home and Insights tabs).
- **Correct or update it** — your sync preferences are editable in Settings; transaction data itself comes directly from your bank via Plaid and can't be edited in-app, since it reflects what actually happened in your account.
- **Delete your account and all associated data** — in-app, via Settings → Delete account. This permanently removes your bank connection (revoked with Plaid, not just deleted from our side), every synced transaction, and your account itself. This does not delete calendar events already created — those live in your own calendar and are yours to manage.
- **Ask a question or file a complaint** — email ryanjung2007@gmail.com. If you're not satisfied with the response, you can complain to the [Office of the Privacy Commissioner of Canada](https://www.priv.gc.ca/en/report-a-concern/).

## Children's privacy

This app is not directed at children and does not knowingly collect personal information from anyone under 13.

## Changes to this policy

If this policy changes in a way that affects how your information is used, you'll be notified via the app or the email associated with your account before the change takes effect.
