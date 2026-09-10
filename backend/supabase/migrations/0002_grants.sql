-- 0001_init.sql created tables and RLS policies but never granted table-level
-- privileges. RLS and grants are separate layers in Postgres — even
-- service_role (which bypasses RLS) still needs an explicit GRANT to touch a
-- table created via raw SQL rather than the dashboard Table Editor (the
-- Table Editor issues these grants automatically; the SQL Editor does not).

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
