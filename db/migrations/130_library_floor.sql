-- ============================================================================
-- FirstPlace — demo floor: Taylor Family Digital Library, 3rd floor (UCalgary)
-- ============================================================================
-- The demo story: walk onto the floor, tap the NFC tag at the entrance, the
-- app opens on this floor and shows the three study tables with their lights.
-- Sit beside a green one; from there it is the usual flow.
--
-- Fixed ids so the NFC tag, the box config and the demo script never change.
-- Safe to run twice.

insert into public.venues
  (id, name, lat, lng, type, address, insider_info, vibe_summary, is_quiet, good_for_groups)
values (
  'c0ffee00-0000-4000-8000-0000000000f3',
  'TFDL · 3rd floor',
  51.0777, -114.1294,
  'study',
  'Taylor Family Digital Library, 410 University Ct NW, Calgary, AB',
  'Three study tables with FirstPlace lights. Tap the tag by the stairs to see them.',
  'Quiet study floor. Green tables are open to a short chat.',
  true, false
)
on conflict (id) do update
  set name = excluded.name, address = excluded.address, insider_info = excluded.insider_info,
      vibe_summary = excluded.vibe_summary;

insert into public.tables (id, venue_id, label, seats, status, is_chat_table, box_enabled)
values
  ('f3f3f3f3-0000-4000-8000-000000000001', 'c0ffee00-0000-4000-8000-0000000000f3', 'Window table', 4, 'open', true,  true),
  ('f3f3f3f3-0000-4000-8000-000000000002', 'c0ffee00-0000-4000-8000-0000000000f3', 'Centre table', 4, 'open', false, true),
  ('f3f3f3f3-0000-4000-8000-000000000003', 'c0ffee00-0000-4000-8000-0000000000f3', 'Stacks table', 4, 'open', false, true)
on conflict (id) do update
  set label = excluded.label, box_enabled = true;
