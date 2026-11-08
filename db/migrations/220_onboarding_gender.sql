-- ============================================================================
-- ChatterBox — onboarding: private gender + "finished onboarding" marker
-- ============================================================================
-- gender and gender_self_describe are PRIVATE. Only the owner ever sees them:
--   * RLS on public.users already limits every read and update to your own row
--     (users_select_self / users_update_self in 020_rls.sql).
--   * The only endpoint that returns a whole user row is GET /me (your own).
--   * No view, aggregate, crowd tag, venue_live, dashboard, shared-topics card,
--     conversation view or Gemini prompt reads these columns. Every function
--     that exposes another person's data names its columns explicitly
--     (first_name, shared_between, my_incoming_requests, venue_room...).
--   * server/tests/onboarding_test.py checks that no other response contains them.
-- Not used for matching or filtering. TODO(gender): the team is deciding what
-- this is for (e.g. an optional comfort setting); until then it is only stored.
--
-- onboarded_at: set when someone finishes the first-time flow. Null = show
-- onboarding after sign-in. Safe to rerun.

alter table public.users add column if not exists gender text;
alter table public.users add column if not exists gender_self_describe text;
alter table public.users add column if not exists onboarded_at timestamptz;

alter table public.users drop constraint if exists users_gender_known;
alter table public.users add constraint users_gender_known
  check (gender is null or gender in ('woman', 'man', 'non_binary', 'self_describe', 'prefer_not'));

alter table public.users drop constraint if exists users_gender_self_describe_ok;
alter table public.users add constraint users_gender_self_describe_ok
  check (
    gender_self_describe is null
    or (gender = 'self_describe' and char_length(gender_self_describe) between 1 and 40)
  );

-- Everyone who already has an account has, in effect, onboarded: don't make
-- existing users (and the demo accounts) walk through it again.
update public.users set onboarded_at = coalesce(onboarded_at, created_at, now())
where onboarded_at is null;
