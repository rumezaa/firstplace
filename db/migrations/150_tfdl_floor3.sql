-- ============================================================================
-- FirstPlace — TFDL floor 3, full layout (16 study tables) + demo students
-- ============================================================================
-- Positions come from where each room's number sits on the real floor 3 plan
-- (scripts/trace_floor.py prints them), drawn upright (north at the top, the
-- west windows on the left). The outline is src/lib/floorPlans/tfdl3.ts.
-- Labels name the real study area (room number) so people can find them.
-- Table 0001 is the physical box. Safe to run twice.

insert into public.tables (id, venue_id, label, seats, status, is_chat_table, box_enabled, pos_x, pos_y)
values
  ('f3f3f3f3-0000-4000-8000-000000000001', 'c0ffee00-0000-4000-8000-0000000000f3', '354 · Window',      4, 'open', true,  true, 0.100, 0.310),
  ('f3f3f3f3-0000-4000-8000-000000000002', 'c0ffee00-0000-4000-8000-0000000000f3', '354 · Centre',      4, 'open', false, true, 0.310, 0.400),
  ('f3f3f3f3-0000-4000-8000-000000000003', 'c0ffee00-0000-4000-8000-0000000000f3', '354 · South',       4, 'open', false, true, 0.130, 0.470),
  ('f3f3f3f3-0000-4000-8000-000000000004', 'c0ffee00-0000-4000-8000-0000000000f3', '352 · Corner',      4, 'open', false, true, 0.100, 0.100),
  ('f3f3f3f3-0000-4000-8000-000000000005', 'c0ffee00-0000-4000-8000-0000000000f3', '352 · Window',      2, 'open', false, true, 0.270, 0.120),
  ('f3f3f3f3-0000-4000-8000-000000000006', 'c0ffee00-0000-4000-8000-0000000000f3', '350 · North lounge', 4, 'open', false, true, 0.800, 0.120),
  ('f3f3f3f3-0000-4000-8000-000000000007', 'c0ffee00-0000-4000-8000-0000000000f3', '351 · North lounge', 4, 'open', false, true, 0.600, 0.075),
  ('f3f3f3f3-0000-4000-8000-000000000008', 'c0ffee00-0000-4000-8000-0000000000f3', '340 · Window',      4, 'open', false, true, 0.100, 0.610),
  ('f3f3f3f3-0000-4000-8000-000000000009', 'c0ffee00-0000-4000-8000-0000000000f3', '340 · Centre',      4, 'open', false, true, 0.310, 0.600),
  ('f3f3f3f3-0000-4000-8000-000000000010', 'c0ffee00-0000-4000-8000-0000000000f3', '330A · Study',      2, 'open', false, true, 0.130, 0.765),
  ('f3f3f3f3-0000-4000-8000-000000000011', 'c0ffee00-0000-4000-8000-0000000000f3', '330F · Study',      2, 'open', false, true, 0.160, 0.875),
  ('f3f3f3f3-0000-4000-8000-000000000012', 'c0ffee00-0000-4000-8000-0000000000f3', '364 · Study',       4, 'open', false, true, 0.840, 0.360),
  ('f3f3f3f3-0000-4000-8000-000000000013', 'c0ffee00-0000-4000-8000-0000000000f3', '368 · Study',       4, 'open', false, true, 0.840, 0.540),
  ('f3f3f3f3-0000-4000-8000-000000000014', 'c0ffee00-0000-4000-8000-0000000000f3', '310 · Study',       4, 'open', false, true, 0.840, 0.715),
  ('f3f3f3f3-0000-4000-8000-000000000015', 'c0ffee00-0000-4000-8000-0000000000f3', '316 · Study',       2, 'open', false, true, 0.840, 0.800),
  ('f3f3f3f3-0000-4000-8000-000000000016', 'c0ffee00-0000-4000-8000-0000000000f3', '320 · Study',       4, 'open', false, true, 0.790, 0.915)
on conflict (id) do update
  set label = excluded.label, seats = excluded.seats, is_chat_table = excluded.is_chat_table,
      box_enabled = true, pos_x = excluded.pos_x, pos_y = excluded.pos_y;

-- Demo students to fill the floor (dev login only: auth0_sub 'seed|…').
insert into public.users (id, auth0_sub, name, interests, vibe_tags, incognito, familiar_faces_opt_in, created_at)
select md5('floor3:' || n)::uuid, 'seed|' || e, n, i, array['quiet'], false, true, now() - interval '30 days'
from (values
  ('Amara', 'amara@thirdplace.test', array['chemistry', 'running']),
  ('Ben',   'ben@thirdplace.test',   array['history', 'board games']),
  ('Chloe', 'chloe@thirdplace.test', array['design', 'hiking']),
  ('Dev',   'dev@thirdplace.test',   array['engineering', 'chess']),
  ('Elena', 'elena@thirdplace.test', array['nursing', 'coffee']),
  ('Farid', 'farid@thirdplace.test', array['economics', 'soccer']),
  ('Grace', 'grace@thirdplace.test', array['biology', 'photography']),
  ('Hiro',  'hiro@thirdplace.test',  array['computer science', 'music'])
) as s(n, e, i)
on conflict (auth0_sub) do nothing;
