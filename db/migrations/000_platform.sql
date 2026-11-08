-- ============================================================================
-- FirstPlace: platform layer (replaces what Supabase used to provide)
-- ============================================================================
-- Runs first, on plain Postgres or Tiger Cloud. It recreates the three things
-- the rest of the SQL relied on, so the privacy rules port unchanged:
--
--   * roles `anon` and `authenticated`, which the API server switches into
--     with SET LOCAL ROLE for every request (RLS policies are written for them)
--   * auth.uid(), which now reads the user id the API server put in
--     `request.user_id` after verifying the Auth0 token
--   * an `extensions` schema holding pgcrypto
--
-- The API connects as the database owner, so it can SET ROLE into these.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$ begin create role anon nologin;          exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;

-- Let the connecting role (Tiger: tsdbadmin, local: postgres) switch into them.
do $$ begin
  execute format('grant anon, authenticated to %I', current_user);
end $$;

create schema if not exists auth;

-- The signed-in user's id, or null. Set per transaction by the API server:
--   select set_config('request.user_id', '<uuid>', true);
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('request.user_id', true), '')::uuid
$$;

grant usage on schema auth, extensions to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
