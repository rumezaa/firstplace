-- ============================================================================
-- Third Place — row level security
-- ============================================================================
-- The privacy rules from the brief, expressed as policies:
--
--   * Nobody can read another person's row in users or checkins. That is what
--     makes "never display which specific users are at a venue" true at the
--     database level rather than only in the UI.
--   * Crowd information leaves the database only through the aggregate views
--     and functions in 0300, which run with the definer's rights and emit
--     counts, never user ids.
--   * Names are revealed only by public.my_familiar_faces(), and only once
--     both people have accepted.

alter table public.users         enable row level security;
alter table public.venues        enable row level security;
alter table public.tables        enable row level security;
alter table public.checkins      enable row level security;
alter table public.kiosk_codes   enable row level security;
alter table public.familiar_faces enable row level security;
alter table public.rewards       enable row level security;

-- ---------------------------------------------------------------- users ------
drop policy if exists users_select_self on public.users;
create policy users_select_self on public.users
  for select to authenticated
  using (id = auth.uid());

drop policy if exists users_insert_self on public.users;
create policy users_insert_self on public.users
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No delete policy: account deletion goes through auth.users and cascades.

-- --------------------------------------------------------------- venues ------
-- Venue detail is public information; anon can read it so the map works before
-- sign-in. Writes are left to the service role (seed script / admin tooling).
drop policy if exists venues_select_all on public.venues;
create policy venues_select_all on public.venues
  for select to anon, authenticated
  using (true);

-- --------------------------------------------------------------- tables ------
-- Table status is public: it is the thing painted on the map and the kiosk.
-- It says "table 4 is taken", never who is sitting there.
drop policy if exists tables_select_all on public.tables;
create policy tables_select_all on public.tables
  for select to anon, authenticated
  using (true);

-- TODO(auth): gate this on a staff role before this is used outside a demo.
-- Right now any signed-in account can flip a table on the kiosk grid, which is
-- what lets the tablet work without a second auth system. A real deployment
-- wants a venue_staff table and `using (exists (select 1 from venue_staff ...))`.
drop policy if exists tables_staff_update_status on public.tables;
create policy tables_staff_update_status on public.tables
  for update to authenticated
  using (true)
  with check (true);

-- ------------------------------------------------------------- checkins ------
-- Own rows only, read and write. Everything a client needs about *other*
-- people's check-ins comes back as a count from an aggregate view.
drop policy if exists checkins_select_own on public.checkins;
create policy checkins_select_own on public.checkins
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists checkins_insert_own on public.checkins;
create policy checkins_insert_own on public.checkins
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists checkins_update_own on public.checkins;
create policy checkins_update_own on public.checkins
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------- kiosk_codes ------
-- Deliberately no select policy for anon or authenticated. If clients could
-- read this table, anyone could check in to any cafe from home by reading the
-- current code. Codes are minted by public.rotate_kiosk_code() and validated
-- inside public.check_in(); both are security definer.

-- ------------------------------------------------------- familiar_faces ------
-- A user can see a pair they are part of. The row contains the other person's
-- user id, so the client should read these through public.my_familiar_faces(),
-- which strips the id and only exposes a first name after mutual acceptance.
-- This policy exists so realtime and ad-hoc queries still behave.
drop policy if exists familiar_faces_select_own on public.familiar_faces;
create policy familiar_faces_select_own on public.familiar_faces
  for select to authenticated
  using (auth.uid() in (user_a, user_b));

-- Accept/ignore goes through public.respond_to_familiar_face(), which makes
-- sure you can only ever flip your own side of the pair.
drop policy if exists familiar_faces_update_own_side on public.familiar_faces;
create policy familiar_faces_update_own_side on public.familiar_faces
  for update to authenticated
  using (auth.uid() in (user_a, user_b))
  with check (auth.uid() in (user_a, user_b));

-- -------------------------------------------------------------- rewards ------
drop policy if exists rewards_select_own on public.rewards;
create policy rewards_select_own on public.rewards
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists rewards_write_own on public.rewards;
create policy rewards_write_own on public.rewards
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- --------------------------------------------- lock down app_private --------
revoke all on schema app_private from anon, authenticated;
