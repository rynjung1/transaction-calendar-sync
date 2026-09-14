-- The mobile app never queries these tables directly (confirmed by grep —
-- it only ever calls supabase.auth.*, never supabase.from(...)); every real
-- read/write goes through the backend's own API endpoints, which use the
-- service-role key and bypass RLS entirely (0002_grants.sql only ever
-- granted table privileges to service_role, never to authenticated/anon).
--
-- That means these three SELECT policies from 0001_init.sql are currently
-- unreachable dead code — Postgres denies the query at the GRANT layer
-- before RLS is even evaluated (verified live: a real user's own valid
-- session JWT against these tables via the anon/publishable key returns
-- 403 "permission denied", not a filtered result).
--
-- But they're one unrelated `GRANT SELECT ... TO authenticated` away from
-- silently reactivating exactly as written — which for plaid_items would
-- expose access_token_encrypted (ciphertext, but a client has zero
-- legitimate reason to ever see it) to the row's own owner. Dropping them
-- now means there's no policy sitting around to accidentally reactivate;
-- a future feature that genuinely needs direct client reads should add a
-- new, narrowly-scoped policy deliberately rather than inherit this one.

drop policy if exists "users can read their own row" on public.users;
drop policy if exists "users can read their own plaid items" on public.plaid_items;
drop policy if exists "users can read their own transactions" on public.synced_transactions;

-- RLS stays enabled on all three tables (from 0001_init.sql) — with zero
-- policies now defined, the default-deny behavior blocks all direct client
-- access regardless of any future GRANT, rather than relying on the GRANT
-- layer alone to be the only thing standing in the way.
