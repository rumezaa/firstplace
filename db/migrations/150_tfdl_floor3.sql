-- ============================================================================
-- FirstPlace — TFDL floor 3, full layout (16 study tables) + demo students
-- ============================================================================
-- Positions trace the real floor 3 plan, drawn upright (north at the top, the
-- west windows on the left). Our own simplified outline in
-- src/lib/floorLayouts.ts; the university's map is used as a reference only.
-- Labels name the real study area (room number) so people can find them.
-- Table 0001 is the physical box. Safe to run twice.

insert into public.tables (id, venue_id, label, seats, status, is_chat_table, box_enabled, pos_x, pos_y)
values
  ('f3f3f3f3-0000-4000-8000-000000000001', 'c0ffee00-0000-4000-8000-0000000000f3', '354 · Window',      4, 'open', true,  true, 0.12, 0.33),
  ('f3f3f3f3-0000-4000-8000-000000000002', 'c0ffee00-0000-4000-8000-0000000000f3', '354 · Centre',      4, 'open', false, true, 0.30, 0.43),
  ('f3f3f3f3-0000-4000-8000-000000000003', 'c0ffee00-0000-4000-8000-0000000000f3', '354 · South',       4, 'open', false, true, 0.14, 0.53),
  ('f3f3f3f3-0000-4000-8000-000000000004', 'c0ffee00-0000-4000-8000-0000000000f3', '352 · Corner',      4, 'open', false, true, 0.14, 0.17),
  ('f3f3f3f3-0000-4000-8000-000000000005', 'c0ffee00-0000-4000-8000-0000000000f3', '352 · Window',      2, 'open', false, true, 0.31, 0.21),
  ('f3f3f3f3-0000-4000-8000-000000000006', 'c0ffee00-0000-4000-8000-0000000000f3', '350 · North lounge', 4, 'open', false, true, 0.22, 0.06),
  ('f3f3f3f3-0000-4000-8000-000000000007', 'c0ffee00-0000-4000-8000-0000000000f3', '351 · North lounge', 4, 'open', false, true, 0.72, 0.06),
  ('f3f3f3f3-0000-4000-8000-000000000008', 'c0ffee00-0000-4000-8000-0000000000f3', '340 · Window',      4, 'open', false, true, 0.13, 0.64),
  ('f3f3f3f3-0000-4000-8000-000000000009', 'c0ffee00-0000-4000-8000-0000000000f3', '340 · Centre',      4, 'open', false, true, 0.31, 0.69),
  ('f3f3f3f3-0000-4000-8000-000000000010', 'c0ffee00-0000-4000-8000-0000000000f3', '330A · Study',      2, 'open', false, true, 0.14, 0.79),
  ('f3f3f3f3-0000-4000-8000-000000000011', 'c0ffee00-0000-4000-8000-0000000000f3', '330F · Study',      2, 'open', false, true, 0.30, 0.88),
  ('f3f3f3f3-0000-4000-8000-000000000012', 'c0ffee00-0000-4000-8000-0000000000f3', '364 · Study',       4, 'open', false, true, 0.72, 0.27),
  ('f3f3f3f3-0000-4000-8000-000000000013', 'c0ffee00-0000-4000-8000-0000000000f3', '368 · Study',       4, 'open', false, true, 0.74, 0.46),
  ('f3f3f3f3-0000-4000-8000-000000000014', 'c0ffee00-0000-4000-8000-0000000000f3', '310 · Study',       4, 'open', false, true, 0.72, 0.75),
  ('f3f3f3f3-0000-4000-8000-000000000015', 'c0ffee00-0000-4000-8000-0000000000f3', '316 · Study',       2, 'open', false, true, 0.86, 0.82),
  ('f3f3f3f3-0000-4000-8000-000000000016', 'c0ffee00-0000-4000-8000-0000000000f3', '320 · Study',       4, 'open', false, true, 0.72, 0.90)
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
