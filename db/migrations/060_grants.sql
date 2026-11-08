-- ============================================================================
-- FirstPlace: base grants (what Supabase granted by default)
-- ============================================================================
-- Supabase gives anon/authenticated broad table privileges and relies on RLS to
-- narrow them. We do the same, explicitly, so the RLS policies in 020 behave
-- exactly as they did. Tables without a policy for a role stay unreadable
-- (kiosk_codes has none at all), because RLS is enabled on every table.

grant usage on schema public to anon, authenticated;

grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Views are re-granted in 030, but repeat it so a re-run of this file alone is enough.
grant select on public.venue_live, public.venue_busy_hours, public.venue_crowd_tags to anon, authenticated;

-- app_private stays locked (also enforced in 020).
revoke all on schema app_private from anon, authenticated;
