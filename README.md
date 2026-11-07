# Third Place

A React Native app for finding a **third place** in Calgary: cafes and social
spaces to work, study, and meet people.

The problem it attacks is loneliness, in two specific places where it bites:

1. **Showing up somewhere new alone is the hardest step.** So the app tells you
   what it is like inside before you walk in — the vibe, what people order, where
   the plugs are, how full it is right now, and how many people there have said
   they are happy to be talked to.
2. **The people you keep seeing never become people you know.** So the app
   notices when you and another regular keep overlapping at the same place, and
   offers an introduction that only happens if you *both* say yes.

> **The name is a placeholder.** The brief said `[APP NAME]`. "Third Place" lives
> in `src/lib/branding.ts` (`APP_NAME`) plus `expo.name` / `expo.slug` /
> `expo.scheme` in `app.json`. The scheme is what magic-link redirects come back
> to, so if you change it, change it in Supabase's redirect URLs too.

---

## Quick start

```bash
npm install
cp .env.example .env          # then fill in your Supabase URL + anon key
npm run start:clear           # --clear matters: env vars are read at bundle time
```

Scan the QR with Expo Go. **Use a real phone** — `expo-camera` does not run in a
simulator, and scanning the kiosk code is the centre of the demo.

### Database

Either paste the SQL into the Supabase SQL editor in order, or use the CLI:

```bash
supabase link --project-ref <your-ref>
supabase db push        # applies supabase/migrations/*
# then paste supabase/seed.sql into the SQL editor
```

Run order matters: `0100_init` → `0200_rls` → `0300_aggregates` → `0400_rpc` →
`0500_todo_matcher_and_rewards` → `0600_realtime` → `seed.sql`.

After seeding, add these to `.env` so the sign-in screen grows a one-tap demo
button and the demo never waits on an email to arrive:

```
EXPO_PUBLIC_DEMO_EMAIL=demo@thirdplace.test
EXPO_PUBLIC_DEMO_PASSWORD=demo-password-123
```

---

## What is built, and what is not

### Built and working

- Expo Router file-based routing, all 8 screens from the brief
- NativeWind styling with a warm-cafe token set, light mode only
- Supabase client, typed end to end (`src/lib/database.types.ts`)
- Auth: email magic link **and** 6-digit code **and** a seeded demo account
- Full schema, RLS policies, aggregate views, and the check-in / kiosk /
  familiar-faces RPCs
- The privacy rules, enforced in Postgres rather than in the UI
- Seed data that produces a live demo: a pending familiar-faces match, an
  already-mutual one, an active chat table, and one venue deliberately below the
  dashboard's minimum group size so you can show suppression working

### Deliberately left as `TODO` for the team

Each one is a stub with the intended approach written out next to it, so nobody
has to guess at the shape.

| What | Where |
|---|---|
| Familiar-faces matcher (the overlap-counting SQL) | `supabase/migrations/20261107000500_todo_matcher_and_rewards.sql` |
| Rewards recomputation | same file, `recompute_rewards()` |
| Realtime subscriptions (wired, never run against a live project) | `src/hooks/useRealtime.ts` |
| Google sign-in | `src/providers/SessionProvider.tsx` |
| Staff roles for kiosk + dashboard | `supabase/migrations/...0200_rls.sql`, `...0400_rpc.sql` |
| `pg_cron` schedules for auto check-out and the matcher | `...0400_rpc.sql`, `...0500_...sql` |

The matcher being a stub does **not** block the demo: `seed.sql` inserts
familiar-faces rows directly, so the Connections screen has real cards to accept.

---

## How the privacy rules are actually enforced

This is the part worth explaining to a judge, because it is structural rather
than cosmetic. The app *cannot* show who is at a venue, because it is never sent
that information.

| Rule from the brief | Where it is enforced |
|---|---|
| Never show which specific users are at a venue | `checkins` RLS is `user_id = auth.uid()`. There is no query a client can write that returns someone else's check-in. Crowd info arrives pre-counted from `public.venue_live`. |
| Crowd info is aggregated only | `venue_live`, `venue_busy_hours`, `venue_crowd_tags` emit counts and never a user id. The underlying cross-user views live in schema `app_private`, which is revoked from `anon` and `authenticated`. |
| Familiar faces reveals names only after mutual acceptance | `public.my_familiar_faces()` returns `their_first_name` inside a `CASE WHEN a_accepted AND b_accepted`. Before that it is `null` — the name is not sent and then hidden, it is never sent. |
| Incognito users excluded from aggregates and familiar faces | Filtered once, in `app_private.active_checkins` / `countable_checkins`, so no later query can forget. `my_familiar_faces()` also drops pairs where either side is incognito. |
| Dashboard aggregates need a minimum group size of 5 | `public.venue_dashboard()` returns `{suppressed: true}` and **no numbers at all** below `dashboard_min_group_size()`. |
| Kiosk codes cannot be harvested | `kiosk_codes` has RLS enabled and zero select policies. Codes are minted and validated only inside security-definer functions. |
| Crowd tags cannot describe one person | `venue_crowd_tags` has `having count(distinct user_id) >= 3`. |

Realtime is scoped the same way — see the comments in
`supabase/migrations/20261107000600_realtime.sql` for why `tables` is safe to
broadcast and why the open-to-chat count is *not* read over realtime.

---

## Verifying the database

The SQL was developed against a throwaway local Postgres with Supabase shims, so
the migrations and seed are known to run and the privacy rules are known to hold.
If you have `postgresql@14` from Homebrew:

```bash
.context/dbcheck/run.sh
```

That spins up a temporary cluster, applies every migration and the seed, then
asserts ~60 things — including that an incognito user with 6 check-ins
contributes nothing to any aggregate, that no name leaks before mutual
acceptance, that an expired kiosk code is rejected, and that a venue under the
minimum group size returns no numbers. It tears the cluster down afterwards.

It is a scaffolding tool, not a test suite you need to maintain — but it is the
fastest way to check you have not broken a privacy rule while writing the
matcher.

---

## Project layout

```
app/                        Expo Router routes — every file here is a screen
  _layout.tsx               providers, auth-aware root stack
  (auth)/sign-in.tsx        magic link / 6-digit code / demo account
  (tabs)/_layout.tsx        the 5 tabs
  (tabs)/index.tsx          1. map, availability markers, filter chips, preview sheet
  (tabs)/checkin.tsx        3. scan kiosk QR -> pick table -> open to chat
  (tabs)/connections.tsx    4. familiar faces, accept / ignore
  (tabs)/rewards.tsx        5. frequent visits + cafe passport
  (tabs)/profile.tsx        6. interests, vibe, incognito, history, kiosk entry
  venue/[id].tsx            2. vibe, drinks, crowd, live table grid, busy hours
  kiosk/[venueId].tsx       7. landscape tablet mode, rotating QR + staff grid
  dashboard/[venueId].tsx   8. owner view, aggregates only

src/                        everything that is not a route (aliased to @/)
  lib/                      supabase client, typed queries, domain helpers
  providers/                SessionProvider (auth + profile)
  hooks/                    useAsync, realtime subscriptions
  components/               ui primitives + the shared TableGrid

supabase/
  migrations/               schema, RLS, aggregates, RPCs, realtime
  seed.sql                  12 placeholder Calgary venues + demo data
```

### Commands

```bash
npm run start:clear   # dev server, clearing the Metro cache
npm run typecheck     # tsc --noEmit
npm run doctor        # expo-doctor
```

---

## Notes and gotchas

- **Seed venues are placeholders.** Real Calgary *coordinates* (so the map looks
  right immediately) with placeholder names, addresses and copy. Every line to
  replace is marked `-- TODO:` in `supabase/seed.sql`.
- **NativeWind here is a pre-release.** SDK 58 / RN 0.88 needs NativeWind v5 RC;
  stable v4 predates this RN version. `nativewind` and `react-native-css` are
  pinned exactly and must be upgraded as a pair. It is verified to compile — the
  theme colours land in the native bundle — but it is an RC, so treat styling
  regressions after any dependency bump as suspect first.
- **Design tokens live in two files.** `global.css` (`@theme`) for `className`,
  and `src/lib/theme.ts` for map pins, QR colours and navigator options, which
  cannot take a className. Change both together.
- **Android maps in a standalone build** need a Google Maps API key in
  `app.json` under `android.config.googleMaps.apiKey`. Expo Go supplies its own,
  so the demo does not need one.
- **Availability thresholds** are in `public.venue_live`: `full` at zero open
  tables, `filling_up` at or below a third open. One `CASE` expression to tune.
- **Magic links in Expo Go** redirect to an `exp://` URL that changes with your
  LAN address, and each one has to be allow-listed in Supabase. The 6-digit code
  path avoids that entirely, which is why it is there.
