-- ============================================================================
-- FirstPlace — demo seed
-- ============================================================================
-- Run with:  npm run db:setup   (from server/; applies db/migrations then this file)
--
-- WHAT YOU NEED TO EDIT
--   The 12 venues below are placeholders with REAL Calgary coordinates but
--   placeholder names/addresses/copy. Replace every `-- TODO:` marked value
--   with the actual cafe. The coordinates are neighbourhood centres, so the map
--   looks right straight away -- nudge each one to the real address.
--
-- WHAT THIS GUARANTEES FOR THE DEMO
--   * venue 1 has 6 distinct visitors in the last 30 days, which is above
--     dashboard_min_group_size() = 5, so the owner dashboard is NOT suppressed.
--     Venue 2 deliberately has only 2, so you can show the suppression working.
--   * one pending familiar-faces match (Alex <-> Maya at venue 1) you can
--     accept on camera, and one already-mutual match to show the revealed state.
--   * live check-ins at venue 1 including one at the chat table, so the map
--     marker is amber and "chat table active" is true.
--   * the demo account has NO open check-in, so you can scan the kiosk live.
--
-- Safe to re-run: it deletes the seeded rows by their fixed ids first.

-- ---------------------------------------------------------------------------
-- 0. Clear previously seeded data (fixed ids, so real data is untouched)
-- ---------------------------------------------------------------------------
delete from public.users where auth0_sub like 'seed|%';
delete from public.venues where id in (
  'c0ffee00-0000-4000-8000-000000000001', 'c0ffee00-0000-4000-8000-000000000002',
  'c0ffee00-0000-4000-8000-000000000003', 'c0ffee00-0000-4000-8000-000000000004',
  'c0ffee00-0000-4000-8000-000000000005', 'c0ffee00-0000-4000-8000-000000000006',
  'c0ffee00-0000-4000-8000-000000000007', 'c0ffee00-0000-4000-8000-000000000008',
  'c0ffee00-0000-4000-8000-000000000009', 'c0ffee00-0000-4000-8000-000000000010',
  'c0ffee00-0000-4000-8000-000000000011', 'c0ffee00-0000-4000-8000-000000000012'
);

-- ---------------------------------------------------------------------------
-- 1. Venues  (12) -- TODO: replace names, addresses and copy
-- ---------------------------------------------------------------------------
insert into public.venues
  (id, name, lat, lng, type, address, insider_info, popular_drinks, vibe_summary, is_quiet, good_for_groups)
values
  -- Kensington
  ('c0ffee00-0000-4000-8000-000000000001',
   'Kensington Coffee Co.',                        -- TODO: real name
   51.0527, -114.0876, 'cafe',
   '1100 Kensington Rd NW, Calgary, AB',           -- TODO: real address
   'Outlets along the window bench; the back corner has the only two-prong plug.',  -- TODO
   array['Flat white', 'Honey oat latte', 'Pour-over'],                             -- TODO
   'Bright and chatty in the morning, settles into laptop quiet after 2pm.',        -- TODO
   false, true),

  -- Inglewood, 9 Ave SE
  ('c0ffee00-0000-4000-8000-000000000002',
   'Ninth & Ink',                                  -- TODO
   51.0387, -114.0330, 'cafe',
   '1300 9 Ave SE, Calgary, AB',                   -- TODO
   'Ask for the back room on weekdays, it is almost always empty before noon.',     -- TODO
   array['Cortado', 'Maple latte'],                                                  -- TODO
   'Record-shop energy. Good for a first solo visit because the staff talk to you.', -- TODO
   false, false),

  -- Beltline / 17 Ave SW
  ('c0ffee00-0000-4000-8000-000000000003',
   'Seventeenth Social',                           -- TODO
   51.0376, -114.0836, 'cafe',
   '500 17 Ave SW, Calgary, AB',                   -- TODO
   'Loud espresso machine near the door; sit past the pillar if you are on calls.',  -- TODO
   array['Iced americano', 'Matcha'],                                                -- TODO
   'Busy and social. The long communal table is where people actually talk.',        -- TODO
   false, true),

  -- Mission / 4 St SW
  ('c0ffee00-0000-4000-8000-000000000004',
   'Mission Reading Room',                         -- TODO
   51.0300, -114.0730, 'study',
   '2000 4 St SW, Calgary, AB',                    -- TODO
   'Unofficially a quiet room after 6pm. Bring headphones anyway.',                  -- TODO
   array['Drip coffee', 'Earl grey'],                                                -- TODO
   'Heads-down study room feel, library quiet, very few conversations.',             -- TODO
   true, false),

  -- Bridgeland
  ('c0ffee00-0000-4000-8000-000000000005',
   'Bridgeland Bakehouse',                         -- TODO
   51.0520, -114.0470, 'cafe',
   '1000 1 Ave NE, Calgary, AB',                   -- TODO
   'Pastries gone by 11am. The patio has the best afternoon light.',                 -- TODO
   array['Cappuccino', 'Hot chocolate'],                                             -- TODO
   'Neighbourhood regulars. You will see the same faces every Saturday.',            -- TODO
   false, true),

  -- Marda Loop
  ('c0ffee00-0000-4000-8000-000000000006',
   'Marda Loop Roasters',                          -- TODO
   51.0130, -114.0960, 'cafe',
   '3400 33 Ave SW, Calgary, AB',                  -- TODO
   'Two big tables upstairs that nobody seems to know about.',                        -- TODO
   array['Single origin pour-over', 'Chai'],                                          -- TODO
   'Calm, a bit older crowd, good for a long afternoon.',                             -- TODO
   true, true),

  -- Downtown core
  ('c0ffee00-0000-4000-8000-000000000007',
   'Eighth Avenue Espresso',                       -- TODO
   51.0460, -114.0630, 'cafe',
   '300 8 Ave SW, Calgary, AB',                    -- TODO
   'Empties out completely after 5pm on weekdays.',                                   -- TODO
   array['Double espresso', 'Cold brew'],                                             -- TODO
   'Office crowd at lunch, nearly yours alone in the early evening.',                 -- TODO
   false, false),

  -- East Village
  ('c0ffee00-0000-4000-8000-000000000008',
   'East Village Commons',                         -- TODO
   51.0455, -114.0450, 'other',
   '500 Riverfront Ave SE, Calgary, AB',           -- TODO
   'Free to sit, no purchase expected. Plugs under every bench.',                     -- TODO
   array['Library coffee cart'],                                                      -- TODO
   'Public space rather than a cafe. Nobody will ever rush you out.',                 -- TODO
   true, true),

  -- University District NW
  ('c0ffee00-0000-4000-8000-000000000009',
   'University District Study Hall',               -- TODO
   51.0680, -114.1430, 'study',
   '4100 University Ave NW, Calgary, AB',          -- TODO
   'Packed during midterms. Mornings before 9 are wide open.',                        -- TODO
   array['Americano', 'Iced latte'],                                                  -- TODO
   'Students, laptops, long stays. Easy place to be alone around people.',            -- TODO
   true, true),

  -- Bowness
  ('c0ffee00-0000-4000-8000-000000000010',
   'Bowness Bench',                                -- TODO
   51.0870, -114.1900, 'cafe',
   '6400 Bowness Rd NW, Calgary, AB',              -- TODO
   'Tiny. Four tables. Worth the trip on a weekday.',                                 -- TODO
   array['Latte', 'Drip coffee'],                                                     -- TODO
   'Small and friendly. Hard not to end up in a conversation.',                        -- TODO
   false, false),

  -- Altadore / Garrison
  ('c0ffee00-0000-4000-8000-000000000011',
   'Garrison Green Coffee',                        -- TODO
   51.0230, -114.0990, 'cafe',
   '2200 Crowchild Trail SW, Calgary, AB',         -- TODO
   'Dog-friendly patio, which is how most people here meet each other.',              -- TODO
   array['Oat cappuccino', 'Lemonade'],                                               -- TODO
   'Relaxed weekend energy, families and regulars.',                                   -- TODO
   false, true),

  -- International Ave / Forest Lawn
  ('c0ffee00-0000-4000-8000-000000000012',
   'International Avenue Tea House',               -- TODO
   51.0380, -113.9770, 'cafe',
   '3400 17 Ave SE, Calgary, AB',                  -- TODO
   'Stays open late. The back half is much quieter than the front.',                   -- TODO
   array['Masala chai', 'Vietnamese coffee'],                                          -- TODO
   'Late-night spot. Mixed crowd, lots of long conversations.',                        -- TODO
   false, true);

-- ---------------------------------------------------------------------------
-- 2. Tables -- 4 to 8 per venue, exactly one chat table each
-- ---------------------------------------------------------------------------
do $$
declare
  v         record;
  v_n       integer;
  i         integer;
  v_idx     integer := 0;
begin
  -- Skip venues that already have their own tables (e.g. the TFDL floor from
  -- migration 130), or their chat table would collide with ours.
  for v in select ven.id from public.venues ven
           where not exists (select 1 from public.tables t where t.venue_id = ven.id)
           order by ven.id loop
    v_idx := v_idx + 1;
    v_n   := 4 + (v_idx % 5);   -- 4..8 tables, deterministic

    for i in 1 .. v_n loop
      -- Stable ids (derived from venue + label) so box configs and printed
      -- QR codes keep working after the demo data is reset.
      insert into public.tables (id, venue_id, label, seats, status, is_chat_table)
      values (
        md5(v.id::text || ':T' || i)::uuid,
        v.id,
        'T' || i,
        case when i % 3 = 0 then 4 else 2 end,
        'open',
        false
      );
    end loop;

    -- The chat table. One per venue, deliberately bigger and clearly named --
    -- the whole point is that it is obvious which table is the one where it is
    -- fine to say hello to a stranger.
    insert into public.tables (id, venue_id, label, seats, status, is_chat_table)
    values (md5(v.id::text || ':Chat Table')::uuid, v.id, 'Chat Table', 6, 'open', true);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Fake users
-- ---------------------------------------------------------------------------
-- Seed users have auth0_sub = 'seed|<email>'. In development the API accepts
-- them through POST /dev/login, so the demo never depends on Auth0 being up.
-- The first account (demo@thirdplace.test) is the demo login.

do $$
declare
  seedlings constant jsonb := jsonb_build_array(
    jsonb_build_object('id', 'a11ce000-0000-4000-8000-000000000001', 'email', 'demo@thirdplace.test',    'name', 'Alex Chen',      'interests', jsonb_build_array('board games','cycling','film photography'), 'vibes', jsonb_build_array('quiet worker','regular','laptop crowd'), 'incognito', false, 'opt_in', true),
    jsonb_build_object('id', 'a11ce000-0000-4000-8000-000000000002', 'email', 'maya@thirdplace.test',    'name', 'Maya Okafor',    'interests', jsonb_build_array('running','novels','pottery'),             'vibes', jsonb_build_array('regular','chatty','morning person'),   'incognito', false, 'opt_in', true),
    jsonb_build_object('id', 'a11ce000-0000-4000-8000-000000000003', 'email', 'sam@thirdplace.test',     'name', 'Sam Rivera',     'interests', jsonb_build_array('climbing','guitar','cooking'),            'vibes', jsonb_build_array('chatty','laptop crowd'),                 'incognito', false, 'opt_in', true),
    jsonb_build_object('id', 'a11ce000-0000-4000-8000-000000000004', 'email', 'priya@thirdplace.test',   'name', 'Priya Nair',     'interests', jsonb_build_array('grad school','knitting','birdwatching'),  'vibes', jsonb_build_array('quiet worker','studying'),               'incognito', false, 'opt_in', true),
    jsonb_build_object('id', 'a11ce000-0000-4000-8000-000000000005', 'email', 'jordan@thirdplace.test',  'name', 'Jordan Blake',   'interests', jsonb_build_array('skateboarding','zines','coffee'),         'vibes', jsonb_build_array('regular','chatty'),                      'incognito', false, 'opt_in', true),
    jsonb_build_object('id', 'a11ce000-0000-4000-8000-000000000006', 'email', 'wei@thirdplace.test',     'name', 'Wei Zhang',      'interests', jsonb_build_array('chess','hiking','languages'),             'vibes', jsonb_build_array('studying','quiet worker'),               'incognito', false, 'opt_in', true),
    -- opted OUT of familiar faces: should never appear in anyone's connections
    jsonb_build_object('id', 'a11ce000-0000-4000-8000-000000000007', 'email', 'taylor@thirdplace.test',  'name', 'Taylor Finch',   'interests', jsonb_build_array('podcasts','baking'),                     'vibes', jsonb_build_array('laptop crowd'),                          'incognito', false, 'opt_in', false),
    -- INCOGNITO: must be excluded from every aggregate and from familiar faces
    jsonb_build_object('id', 'a11ce000-0000-4000-8000-000000000008', 'email', 'ghost@thirdplace.test',   'name', 'Robin Vale',     'interests', jsonb_build_array('cycling'),                               'vibes', jsonb_build_array('quiet worker'),                          'incognito', true,  'opt_in', true)
  );
  s         jsonb;
  v_id      uuid;
  v_email   text;
begin
  for s in select * from jsonb_array_elements(seedlings) loop
    v_id    := (s ->> 'id')::uuid;
    v_email := s ->> 'email';

    -- Seeded users log in through the API's dev login (no Auth0 needed):
    --   auth0_sub = 'seed|<email>'. The first one is the demo account.
    insert into public.users (id, auth0_sub, name, interests, vibe_tags, incognito, familiar_faces_opt_in, created_at)
    values (
      v_id,
      'seed|' || v_email,
      s ->> 'name',
      (select array_agg(x) from jsonb_array_elements_text(s -> 'interests') x),
      (select array_agg(x) from jsonb_array_elements_text(s -> 'vibes') x),
      (s ->> 'incognito')::boolean,
      (s ->> 'opt_in')::boolean,
      now() - interval '90 days'
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Historical check-ins
-- ---------------------------------------------------------------------------
-- Alex and Maya overlap at venue 1 on three separate Tuesdays. That is the
-- pattern refresh_familiar_faces() is meant to find once it is implemented.
do $$
declare
  v_venue1 uuid := 'c0ffee00-0000-4000-8000-000000000001';
  v_venue2 uuid := 'c0ffee00-0000-4000-8000-000000000002';
  v_alex   uuid := 'a11ce000-0000-4000-8000-000000000001';
  v_maya   uuid := 'a11ce000-0000-4000-8000-000000000002';
  v_sam    uuid := 'a11ce000-0000-4000-8000-000000000003';
  v_priya  uuid := 'a11ce000-0000-4000-8000-000000000004';
  v_jordan uuid := 'a11ce000-0000-4000-8000-000000000005';
  v_wei    uuid := 'a11ce000-0000-4000-8000-000000000006';
  v_ghost  uuid := 'a11ce000-0000-4000-8000-000000000008';
  v_t1     uuid;
  v_chat1  uuid;
  d        integer;
begin
  select id into v_t1    from public.tables where venue_id = v_venue1 and label = 'T1';
  select id into v_chat1 from public.tables where venue_id = v_venue1 and is_chat_table;

  -- three overlapping Tuesday afternoons, 7 / 14 / 21 days ago
  foreach d in array array[7, 14, 21] loop
    insert into public.checkins (user_id, venue_id, table_id, open_to_chat, checked_in_at, checked_out_at)
    values
      (v_alex, v_venue1, v_t1,    true,
       now() - make_interval(days => d) - interval '4 hours',
       now() - make_interval(days => d) - interval '2 hours'),
      (v_maya, v_venue1, v_chat1, true,
       now() - make_interval(days => d) - interval '3 hours 30 minutes',
       now() - make_interval(days => d) - interval '1 hour');
  end loop;

  -- Alex is a regular at venue 1 (feeds the frequent-visit reward) and has
  -- visited venue 2 as well (feeds the passport grid).
  foreach d in array array[3, 5, 10, 17, 28] loop
    insert into public.checkins (user_id, venue_id, table_id, open_to_chat, checked_in_at, checked_out_at)
    values (v_alex, v_venue1, v_t1, false,
            now() - make_interval(days => d) - interval '6 hours',
            now() - make_interval(days => d) - interval '4 hours');
  end loop;

  insert into public.checkins (user_id, venue_id, table_id, open_to_chat, checked_in_at, checked_out_at)
  select v_alex, v_venue2, t.id, false,
         now() - interval '12 days' - interval '5 hours',
         now() - interval '12 days' - interval '3 hours'
  from public.tables t where t.venue_id = v_venue2 and t.label = 'T2';

  -- Spread of other visitors so venue 1 clears dashboard_min_group_size() = 5.
  -- Distinct visitors at venue 1 in 30 days: alex, maya, sam, priya, jordan, wei = 6.
  foreach d in array array[2, 6, 9, 13, 20, 26] loop
    insert into public.checkins (user_id, venue_id, table_id, open_to_chat, checked_in_at, checked_out_at)
    select u, v_venue1, v_t1, (d % 2 = 0),
           now() - make_interval(days => d) - interval '8 hours',
           now() - make_interval(days => d) - interval '6 hours'
    from unnest(array[v_sam, v_priya, v_jordan, v_wei]) u
    where (d + length(u::text)) % 2 = 0;
  end loop;

  -- Make sure each of the four shows up at least once in the window.
  insert into public.checkins (user_id, venue_id, table_id, open_to_chat, checked_in_at, checked_out_at)
  select u, v_venue1, v_t1, false,
         now() - interval '15 days' - interval '7 hours',
         now() - interval '15 days' - interval '5 hours'
  from unnest(array[v_sam, v_priya, v_jordan, v_wei]) u;

  -- The incognito account visits venue 1 a lot. None of it may ever surface in
  -- an aggregate -- a good thing to point at during the privacy part of the demo.
  foreach d in array array[1, 4, 8, 11, 16, 23] loop
    insert into public.checkins (user_id, venue_id, table_id, open_to_chat, checked_in_at, checked_out_at)
    values (v_ghost, v_venue1, v_t1, true,
            now() - make_interval(days => d) - interval '9 hours',
            now() - make_interval(days => d) - interval '7 hours');
  end loop;

  -- Venue 2 keeps only 2 distinct visitors, so its dashboard stays suppressed.
  insert into public.checkins (user_id, venue_id, table_id, open_to_chat, checked_in_at, checked_out_at)
  select v_maya, v_venue2, t.id, false,
         now() - interval '4 days' - interval '3 hours',
         now() - interval '4 days' - interval '1 hour'
  from public.tables t where t.venue_id = v_venue2 and t.label = 'T1';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Live check-ins at venue 1 (so the map marker and counts are not empty)
-- ---------------------------------------------------------------------------
-- Note Alex (the demo account) is NOT in here, so the demo can scan and check
-- in live without hitting checkins_one_open_per_user.
do $$
declare
  v_venue1 uuid := 'c0ffee00-0000-4000-8000-000000000001';
  v_tables uuid[];
  v_chat1  uuid;
begin
  select id into v_chat1 from public.tables where venue_id = v_venue1 and is_chat_table;
  select array_agg(id order by label) into v_tables
  from public.tables where venue_id = v_venue1 and not is_chat_table;

  -- Sam is at the chat table right now -> chat_table_active = true
  insert into public.checkins (user_id, venue_id, table_id, open_to_chat, checked_in_at)
  values ('a11ce000-0000-4000-8000-000000000003', v_venue1, v_chat1, true, now() - interval '35 minutes');
  update public.tables set status = 'taken' where id = v_chat1;

  -- Priya and Wei are at ordinary tables, Priya open to chat
  insert into public.checkins (user_id, venue_id, table_id, open_to_chat, checked_in_at)
  values ('a11ce000-0000-4000-8000-000000000004', v_venue1, v_tables[1], true,  now() - interval '1 hour 10 minutes'),
         ('a11ce000-0000-4000-8000-000000000006', v_venue1, v_tables[2], false, now() - interval '20 minutes');
  update public.tables set status = 'taken' where id in (v_tables[1], v_tables[2]);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Familiar faces rows
-- ---------------------------------------------------------------------------
-- Inserted directly because public.refresh_familiar_faces() is still a stub
-- (migration 0500). Delete this section the moment the matcher works.
insert into public.familiar_faces
  (user_a, user_b, venue_id, overlap_count, a_accepted, b_accepted, common_weekday, last_overlap_at)
values
  -- PENDING: neither side has answered. This is the card to accept on camera.
  ('a11ce000-0000-4000-8000-000000000001', 'a11ce000-0000-4000-8000-000000000002',
   'c0ffee00-0000-4000-8000-000000000001', 3, false, false,
   extract(dow from now() - interval '7 days')::smallint,
   now() - interval '7 days'),

  -- ALREADY MUTUAL: shows the revealed state, first names visible.
  ('a11ce000-0000-4000-8000-000000000001', 'a11ce000-0000-4000-8000-000000000003',
   'c0ffee00-0000-4000-8000-000000000001', 5, true, true,
   extract(dow from now() - interval '3 days')::smallint,
   now() - interval '3 days'),

  -- WAITING ON THEM: Alex accepted, Jordan has not. Should read as pending.
  ('a11ce000-0000-4000-8000-000000000001', 'a11ce000-0000-4000-8000-000000000005',
   'c0ffee00-0000-4000-8000-000000000001', 4, true, false,
   extract(dow from now() - interval '9 days')::smallint,
   now() - interval '9 days'),

  -- MUST NOT APPEAR: Taylor has familiar_faces_opt_in = false.
  ('a11ce000-0000-4000-8000-000000000001', 'a11ce000-0000-4000-8000-000000000007',
   'c0ffee00-0000-4000-8000-000000000001', 6, false, false,
   extract(dow from now() - interval '5 days')::smallint,
   now() - interval '5 days')
on conflict (user_a, user_b, venue_id) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Rewards
-- ---------------------------------------------------------------------------
-- Also inserted directly, because public.recompute_rewards() is a stub.
-- Alex: 9 weighted visits at venue 1 (the three chat-table visits count double),
-- and 2 venues on the passport.
insert into public.rewards (user_id, venue_id, type, progress, status)
values
  ('a11ce000-0000-4000-8000-000000000001', 'c0ffee00-0000-4000-8000-000000000001', 'frequent', 9, 'in_progress'),
  ('a11ce000-0000-4000-8000-000000000001', 'c0ffee00-0000-4000-8000-000000000002', 'frequent', 1, 'in_progress'),
  ('a11ce000-0000-4000-8000-000000000001', null,                                    'passport', 2, 'in_progress')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 5. PRD profile fields for the demo: overlapping topics and languages, so a
--    request card and the shared-topics screen have real content. Everyone
--    seeded is a verified adult (we store only "verified", never ID data).
-- ---------------------------------------------------------------------------
update public.users u set
  topics         = s.topics,
  languages      = s.languages,
  age_range      = s.age_range,
  comm_pref      = s.comm_pref,
  share_comm_pref = s.comm_pref is not null,
  id_verified_at = now() - interval '30 days',
  interests      = u.interests || s.extra_interests
from (values
  ('demo@thirdplace.test',   array['hiking','board games','Calgary food','photography'], array['English','Mandarin'], '25-34', null,             array['hiking']),
  ('maya@thirdplace.test',   array['books','running','Calgary food','music'],            array['English','Igbo'],     '25-34', null,             array['board games']),
  ('sam@thirdplace.test',    array['hiking','music','cooking','travel'],                 array['English','Spanish'],  '18-24', null,             array['hiking','board games']),
  ('priya@thirdplace.test',  array['books','science','travel'],                          array['English','Hindi'],    '25-34', 'I''d rather type first', array['hiking']),
  ('jordan@thirdplace.test', array['music','art','skateboarding'],                       array['English'],            '18-24', null,             array['music']),
  ('wei@thirdplace.test',    array['hiking','travel','languages','board games'],        array['English','Mandarin'], '18-24', 'Please face me, I lip-read', array['hiking','board games']),
  ('taylor@thirdplace.test', array['podcasts','baking'],                                 array['English'],            '35-44', null,             array[]::text[]),
  ('ghost@thirdplace.test',  array['cycling'],                                           array['English'],            '45-54', null,             array[]::text[])
) as s(email, topics, languages, age_range, comm_pref, extra_interests)
where u.auth0_sub = 'seed|' || s.email;

-- ---------------------------------------------------------------------------
-- 6. One finished conversation that BOTH people called good, so there is a
--    real connection on the Connections screen and the meetup planner
--    (db/migrations/100_meetups.sql) has something to plan.
--
--    Alex and Wei are the pair on purpose: they share "hiking" AND
--    "board games", one outdoors and one in, so the plan the forecast picks
--    visibly changes with the weather instead of always being a cafe.
-- ---------------------------------------------------------------------------
with pair as (
  select (select id from public.users where auth0_sub = 'seed|demo@thirdplace.test') as alex,
         (select id from public.users where auth0_sub = 'seed|wei@thirdplace.test')  as wei,
         t.id as table_id, t.venue_id
  from public.tables t
  where t.venue_id = 'c0ffee00-0000-4000-8000-000000000002' and t.is_chat_table
  limit 1
), conv as (
  insert into public.conversations
    (table_id, venue_id, seated_user, joiner_user, via, started_at, ends_at, ended_at, seated_vote, joiner_vote)
  select table_id, venue_id, alex, wei, 'request',
         now() - interval '6 days', now() - interval '6 days' + interval '30 minutes',
         now() - interval '6 days' + interval '34 minutes', 'good', 'good'
  from pair
  where alex is not null and wei is not null
  returning id, seated_user, joiner_user
)
insert into public.connections (user_a, user_b, conversation_id, created_at)
select least(seated_user, joiner_user), greatest(seated_user, joiner_user), id,
       now() - interval '6 days'
from conv
on conflict (user_a, user_b) do nothing;
