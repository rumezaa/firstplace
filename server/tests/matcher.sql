-- Familiar faces matcher rules (migration 180). Run on a seeded DISPOSABLE
-- database; everything is rolled back:
--   docker exec -i firstplace-db psql -U postgres -d firstplace_test -v ON_ERROR_STOP=1 < server/tests/matcher.sql
begin;
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); d uuid := gen_random_uuid();
  v uuid := 'c0ffee00-0000-4000-8000-000000000005';
  t uuid := (select id from public.tables where venue_id = v limit 1);
  day timestamptz;
  n int;
begin
  insert into public.users (id, auth0_sub, name, familiar_faces_opt_in) values
    (a, 'test|a', 'A', true), (b, 'test|b', 'B', true), (c, 'test|c', 'C', true), (d, 'test|d', 'D', false);

  -- A and B: 40 minutes together on 3 different days, plus a 2nd overlap on day 1.
  foreach day in array array[now() - interval '10 days', now() - interval '6 days', now() - interval '2 days'] loop
    insert into public.checkins (user_id, venue_id, table_id, checked_in_at, checked_out_at) values
      (a, v, t, day, day + interval '60 minutes'), (b, v, t, day + interval '20 minutes', day + interval '90 minutes');
  end loop;
  insert into public.checkins (user_id, venue_id, table_id, checked_in_at, checked_out_at) values
    (a, v, t, now() - interval '10 days' + interval '3 hours', now() - interval '10 days' + interval '4 hours'),
    (b, v, t, now() - interval '10 days' + interval '3 hours', now() - interval '10 days' + interval '4 hours');
  -- A and C: three days but only 10 minutes each time.
  foreach day in array array[now() - interval '9 days', now() - interval '5 days', now() - interval '1 days'] loop
    insert into public.checkins (user_id, venue_id, table_id, checked_in_at, checked_out_at) values
      (a, v, t, day, day + interval '30 minutes'), (c, v, t, day + interval '20 minutes', day + interval '50 minutes');
  end loop;
  -- A and D: plenty of overlap, but D has familiar faces off.
  foreach day in array array[now() - interval '8 days', now() - interval '4 days', now() - interval '3 days'] loop
    insert into public.checkins (user_id, venue_id, table_id, checked_in_at, checked_out_at) values
      (a, v, t, day, day + interval '2 hours'), (d, v, t, day, day + interval '2 hours');
  end loop;

  perform public.refresh_familiar_faces();

  select overlap_count into n from public.familiar_faces where user_a = least(a, b) and user_b = greatest(a, b) and venue_id = v;
  if n = 3 then raise notice 'PASS 3 days together makes a card, and a second overlap the same day counts once';
  else raise exception 'FAIL A+B overlap_count = %', n; end if;

  if not exists (select 1 from public.familiar_faces where user_a = least(a, c) and user_b = greatest(a, c))
  then raise notice 'PASS 10-minute overlaps do not count';
  else raise exception 'FAIL short overlaps made a card'; end if;

  if not exists (select 1 from public.familiar_faces where user_a = least(a, d) and user_b = greatest(a, d))
  then raise notice 'PASS someone with familiar faces off is never matched';
  else raise exception 'FAIL opted-out user matched'; end if;

  update public.familiar_faces set a_accepted = true where user_a = least(a, b) and user_b = greatest(a, b);
  perform public.refresh_familiar_faces();
  if (select a_accepted from public.familiar_faces where user_a = least(a, b) and user_b = greatest(a, b))
  then raise notice 'PASS re-running keeps someone''s yes';
  else raise exception 'FAIL re-run reset an answer'; end if;
end $$;
rollback;
