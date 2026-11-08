-- ============================================================================
-- FirstPlace — "I'm here": venue check-in from the entrance tag, and the room
-- ============================================================================
-- Tapping the entrance NFC tag (or scanning its QR) opens the floor map and
-- checks you in to the venue, without a table. Nothing about you is sent over
-- NFC: the phone is signed in, so the server already knows who you are.
--
-- The room summary is counts only, like public.venue_live: how many people
-- are here, how many tables are open to talk (green), and the most common interest
-- you share with people here. Never who. Incognito people are not counted
-- (app_private.active_checkins), blocked people never count towards "like
-- you", and the shared-interest line respects the "Show what we have in
-- common" switch on both sides and only appears when at least two people
-- share it, so it can't single anyone out. Safe to rerun.

-- ------------------------------------------------------------- enter -------
-- Check in to a venue with no table. Already checked in here (with or without
-- a table): nothing changes, so tapping the door never drops your table claim.
-- Checked in somewhere else: that session closes and its table is freed, the
-- same "one place at a time" rule as public.claim_table(). Claiming a table
-- later closes this table-less session and opens the table's one.
create or replace function public.enter_venue(p_venue uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_row  public.checkins;
begin
  if v_user is null then raise exception 'Please sign in first.'; end if;
  if not exists (select 1 from public.venues where id = p_venue) then
    raise exception 'No such venue.' using hint = 'venue_not_found';
  end if;

  select * into v_row from public.checkins
  where user_id = v_user and checked_out_at is null and venue_id = p_venue
    and checked_in_at > now() - public.session_length();
  if found then
    return jsonb_build_object('checkin_id', v_row.id, 'venue_id', p_venue, 'table_id', v_row.table_id, 'new', false);
  end if;

  with closed as (
    update public.checkins set checked_out_at = now()
    where user_id = v_user and checked_out_at is null
    returning table_id)
  update public.tables set status = 'open' where id in (select table_id from closed where table_id is not null);

  -- Not at a table, so not open to chat: only a box light says that.
  insert into public.checkins (user_id, venue_id, table_id, open_to_chat, light)
  values (v_user, p_venue, null, false, 'red') returning * into v_row;

  return jsonb_build_object('checkin_id', v_row.id, 'venue_id', p_venue, 'table_id', null, 'new', true);
end $$;

-- -------------------------------------------------------------- room -------
-- "12 people here · 4 open to talk · 3 into hiking like you". Works signed
-- out (no "like you", no `here`).
create or replace function public.venue_room(p_venue uuid)
returns jsonb language sql stable security definer set search_path = public, app_private as $$
  with here as (
    select ac.user_id from app_private.active_checkins ac where ac.venue_id = p_venue
  ),
  me as (
    select u.id, u.interests from public.users u
    where u.id = auth.uid() and u.share_overlap
  ),
  shared as (
    -- One row per (person here, interest they share with me).
    select x.interest, h.user_id
    from here h
    join public.users u on u.id = h.user_id
    cross join me
    cross join lateral (select unnest(u.interests) intersect select unnest(me.interests)) x(interest)
    where h.user_id <> me.id
      and u.share_overlap
      and not app_private.is_blocked(me.id, h.user_id)
  ),
  top as (
    select interest, count(distinct user_id)::int as people
    from shared group by interest
    having count(distinct user_id) >= 2
    order by people desc, interest
    limit 1
  )
  select jsonb_build_object(
    'people_here', (select count(*)::int from here),
    -- Green only: since 190, yellow means an empty table (a free seat).
    'open_to_talk', (select count(*)::int from public.tables t
                     where t.venue_id = p_venue and public.table_light(t.id) = 'green'),
    'here', exists (select 1 from here where user_id = auth.uid()),
    'like_you', (select jsonb_build_object('interest', interest, 'people', people) from top)
  );
$$;

revoke all on function public.enter_venue(uuid) from public;
grant execute on function public.enter_venue(uuid) to authenticated;
revoke all on function public.venue_room(uuid) from public;
grant execute on function public.venue_room(uuid) to anon, authenticated;
