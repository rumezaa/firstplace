-- ============================================================================
-- FirstPlace — RPCs
-- ============================================================================
-- ERROR CONVENTION
-- Every user-facing failure is a plain `raise exception` (SQLSTATE P0001),
-- which PostgREST returns as HTTP 400 with the message intact, so the message
-- is safe to show directly in the UI. A stable token goes in `hint` for code
-- that needs to branch on the reason:
--   kiosk_code_invalid | table_not_at_venue | table_taken | familiar_face_not_found
-- See CHECKIN_ERROR_HINTS in src/lib/checkins.ts.
--
-- These are security definer on purpose. They are the only code that reads
-- kiosk_codes, the only code that writes a check-in alongside a table status,
-- and the only code that can ever return another person's name.

-- -------------------------------------------------------- kiosk rotation ----
-- The kiosk screen calls this every KIOSK_ROTATE_SECONDS. The code lives a
-- little longer than the rotation interval so a scan that lands mid-rotation
-- still validates.
create or replace function public.rotate_kiosk_code(
  p_venue_id    uuid,
  p_ttl_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code    text;
  v_expires timestamptz;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to run kiosk mode.';
  end if;

  -- TODO(auth): gate on a staff role for p_venue_id. See the matching TODO on
  -- the tables update policy in 0200.

  if p_ttl_seconds < 10 or p_ttl_seconds > 600 then
    raise exception 'p_ttl_seconds must be between 10 and 600.';
  end if;

  -- 8 hex characters: short enough to re-type by hand if the camera fails,
  -- large enough (4 billion) that guessing within a 60 second window is hopeless.
  v_code    := upper(encode(extensions.gen_random_bytes(4), 'hex'));
  v_expires := now() + make_interval(secs => p_ttl_seconds);

  -- Housekeeping so the table does not grow without bound.
  delete from public.kiosk_codes
  where venue_id = p_venue_id and expires_at < now() - interval '10 minutes';

  insert into public.kiosk_codes (venue_id, code, expires_at)
  values (p_venue_id, v_code, v_expires);

  return jsonb_build_object('code', v_code, 'expires_at', v_expires);
end $$;

revoke all on function public.rotate_kiosk_code(uuid, integer) from public;
grant execute on function public.rotate_kiosk_code(uuid, integer) to authenticated;

-- ------------------------------------------------------------- check in -----
create or replace function public.check_in(
  p_code         text,
  p_table_id     uuid,
  p_open_to_chat boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_venue   uuid;
  v_is_chat boolean;
  v_status  public.table_status;
  v_checkin public.checkins;
begin
  if v_user is null then
    raise exception 'You must be signed in to check in.';
  end if;

  -- 1. The code must exist and must not have expired.
  select venue_id into v_venue
  from public.kiosk_codes
  where code = upper(trim(p_code))
    and expires_at > now();

  if v_venue is null then
    raise exception 'That code has expired. Grab a fresh one from the kiosk.'
      using hint = 'kiosk_code_invalid';
  end if;

  -- 2. The table has to belong to the venue that code was minted for, so a
  --    valid code for cafe A cannot be used to claim a table at cafe B.
  select is_chat_table, status into v_is_chat, v_status
  from public.tables
  where id = p_table_id and venue_id = v_venue
  for update;

  if not found then
    raise exception 'That table is not at this venue.'
      using hint = 'table_not_at_venue';
  end if;

  if v_status = 'taken' then
    raise exception 'Someone just took that table. Pick another one.'
      using hint = 'table_taken';
  end if;

  -- 3. Close any session still open for this person and free the table they
  --    were sitting at. checkins_one_open_per_user depends on this.
  with closed as (
    update public.checkins
       set checked_out_at = now()
     where user_id = v_user and checked_out_at is null
    returning table_id
  )
  update public.tables t
     set status = 'open'
   where t.id in (select table_id from closed where table_id is not null);

  -- 4. Sitting at the chat table *is* opting in to chat.
  insert into public.checkins (user_id, venue_id, table_id, open_to_chat)
  values (v_user, v_venue, p_table_id, p_open_to_chat or v_is_chat)
  returning * into v_checkin;

  update public.tables set status = 'taken' where id = p_table_id;

  -- TODO(rewards): recompute this user's rewards here.
  --   perform public.recompute_rewards(v_user);
  -- Chat-table check-ins count double -- see 0500.

  -- TODO(familiar-faces): either call the matcher for this user now, or leave
  -- it entirely to the scheduled job in 0500. Doing it here makes the demo
  -- feel instant; doing it on a schedule is cheaper.
  --   perform app_private.refresh_familiar_faces_for_venue(v_venue);

  return to_jsonb(v_checkin) || jsonb_build_object('venue_id', v_venue, 'at_chat_table', v_is_chat);
end $$;

revoke all on function public.check_in(text, uuid, boolean) from public;
grant execute on function public.check_in(text, uuid, boolean) to authenticated;

-- ------------------------------------------------------------ check out -----
create or replace function public.check_out()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_table uuid;
  v_id    uuid;
begin
  if v_user is null then
    raise exception 'You must be signed in to check out.';
  end if;

  update public.checkins
     set checked_out_at = now()
   where user_id = v_user and checked_out_at is null
  returning id, table_id into v_id, v_table;

  if v_id is null then
    return jsonb_build_object('checked_out', false);
  end if;

  if v_table is not null then
    update public.tables set status = 'open' where id = v_table;
  end if;

  return jsonb_build_object('checked_out', true, 'checkin_id', v_id);
end $$;

revoke all on function public.check_out() from public;
grant execute on function public.check_out() to authenticated;

-- ------------------------------------------------- automatic check out ------
-- "Auto check-out after 3 hours". The aggregate views already ignore sessions
-- older than session_length(), so the counts are correct even if this never
-- runs; this is what actually frees the table and closes the row.
create or replace function public.auto_checkout_stale()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with closed as (
    update public.checkins
       set checked_out_at = checked_in_at + public.session_length()
     where checked_out_at is null
       and checked_in_at < now() - public.session_length()
    returning id, table_id
  ),
  freed as (
    update public.tables t
       set status = 'open'
     where t.id in (select table_id from closed where table_id is not null)
    returning t.id
  )
  select count(*)::int into v_count from closed;

  return v_count;
end $$;

comment on function public.auto_checkout_stale() is
  'Closes check-ins older than session_length() and frees their tables.';

-- TODO(ops): schedule this. In the Supabase dashboard enable the pg_cron
-- extension, then run:
--
--   select cron.schedule(
--     'third-place-auto-checkout',
--     '*/5 * * * *',
--     $$select public.auto_checkout_stale()$$
--   );
--
-- Until that is scheduled, the app calls it opportunistically on app open --
-- see src/lib/checkins.ts.
revoke all on function public.auto_checkout_stale() from public;
grant execute on function public.auto_checkout_stale() to authenticated;

-- -------------------------------------------------- familiar faces reads ----
-- The only path by which one user learns another user's name, and only after
-- both sides accepted. Note what is NOT returned: the other person's user id,
-- their current venue, or anything about where they are right now.
create or replace function public.my_familiar_faces()
returns table (
  id              uuid,
  venue_id        uuid,
  venue_name      text,
  overlap_count   integer,
  common_weekday  smallint,
  last_overlap_at timestamptz,
  i_accepted      boolean,
  they_accepted   boolean,
  mutual          boolean,
  their_first_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    ff.id,
    ff.venue_id,
    v.name,
    ff.overlap_count,
    ff.common_weekday,
    ff.last_overlap_at,
    case when ff.user_a = auth.uid() then ff.a_accepted else ff.b_accepted end,
    case when ff.user_a = auth.uid() then ff.b_accepted else ff.a_accepted end,
    (ff.a_accepted and ff.b_accepted),
    case
      when ff.a_accepted and ff.b_accepted
        then nullif(split_part(trim(other.name), ' ', 1), '')
      else null
    end
  from public.familiar_faces ff
  join public.venues v     on v.id = ff.venue_id
  join public.users  me    on me.id = auth.uid()
  join public.users  other on other.id = case when ff.user_a = auth.uid()
                                              then ff.user_b else ff.user_a end
  where auth.uid() in (ff.user_a, ff.user_b)
    -- either side opting out, or going incognito, hides the pair for both.
    and me.familiar_faces_opt_in
    and not me.incognito
    and other.familiar_faces_opt_in
    and not other.incognito
  order by ff.overlap_count desc, ff.last_overlap_at desc nulls last;
$$;

revoke all on function public.my_familiar_faces() from public;
grant execute on function public.my_familiar_faces() to authenticated;

-- ------------------------------------------------- accept / ignore a pair ---
create or replace function public.respond_to_familiar_face(
  p_id     uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.familiar_faces;
begin
  if v_user is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_row from public.familiar_faces where id = p_id for update;

  if not found or v_user not in (v_row.user_a, v_row.user_b) then
    raise exception 'No such connection.' using hint = 'familiar_face_not_found';
  end if;

  -- You can only ever flip your own side.
  if v_row.user_a = v_user then
    update public.familiar_faces set a_accepted = p_accept where id = p_id returning * into v_row;
  else
    update public.familiar_faces set b_accepted = p_accept where id = p_id returning * into v_row;
  end if;

  return jsonb_build_object(
    'id',     v_row.id,
    'mutual', v_row.a_accepted and v_row.b_accepted
  );
end $$;

revoke all on function public.respond_to_familiar_face(uuid, boolean) from public;
grant execute on function public.respond_to_familiar_face(uuid, boolean) to authenticated;
