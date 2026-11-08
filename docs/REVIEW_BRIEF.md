# Reviewer and fixer brief

Your job on this repo: **review, then fix**. Find bugs, design drift from the kit, and unhandled edge cases, fix them in small commits, and prove each fix. You are not here to add features unless a gap below says so.

Read first: [SETUP.md](SETUP.md), [TECH_STACK.md](TECH_STACK.md), [BOX.md](BOX.md), [MEETUP_PLANNER.md](MEETUP_PLANNER.md), [AUTH0.md](AUTH0.md).

## How to work

1. Pick one area (a screen, a route, a migration). Read it fully before changing anything.
2. Write down what is wrong and why, then fix the smallest thing that makes it right.
3. Verify (below). One concern per commit, message says what was wrong and what changed.
4. Never commit `.env`, `server/.env` or `server/box.local.json`. No AI co-author lines in commits.
5. Don't edit a file a teammate is actively working on without saying so in the commit message.
6. The demo path must never break: sign in → Explore → venue → claim a table → change light → box follows → request → conversation → vote → Connections → plan a meetup.

## Verify every change

```bash
npx tsc --noEmit
npx expo lint                                   # 3 known errors in src/hooks/useAsync.ts and useRealtime.ts; fixing them is welcome
(cd server && npx tsc --noEmit -p tsconfig.json && npm test)
python3 server/tests/flow_test.py http://localhost:8787     # needs the API running; fresh demo data
python3 server/tests/meetup_test.py http://localhost:8787
```

For UI changes, run the app (`npx expo start`, press `w`) and look at the screen at phone width. Say what you checked.

**Database:** migrations in `db/migrations/` are applied by hand to the shared Tiger database. Write new ones as new numbered files (`120_…`) that are safe to run twice (`if not exists`, `create or replace`). Never edit an applied migration. `npm run db:setup` resets all demo data, so don't run it against Tiger.

## Design kit (v2) — the rules

The look is clean, calm iOS-native. Not "vibe coded".

**Colour.** Use only the tokens in `global.css` / `src/lib/theme.ts`.
- Background `cream` #f6f6f3, cards `surface` #fff, sunk fields `sunk`, borders `border-warm`.
- Text `espresso` (primary), `mocha` (secondary). Contrast ≥ 4.5:1.
- Accent is teal `clay` #1c5c64 (with `clay-soft`). `berry` is an alias of it.
- **Green / yellow / red are reserved for the box light** and its states. Never use them for decoration, success toasts or generic buttons. `brick` (red) is allowed only for destructive actions, Help and Report.

**Type and spacing.** System font. Use the `Title`, `SectionTitle`, `Body`, `Caption` components from `src/components/ui`. Spacing from the 4-pt scale already in use. Cards: 16px radius; chips: pill; tiles: 12px.

**Components.** Reuse `src/components/ui` (`Button`, `Card`, `Badge`, `ErrorNote`, `Loading`, `Screen`…), `LightPole`, `LightPicker`, `AppMark`, `HelpButton`. Don't make one-off styled copies.

**Don't** (the vibe-coded tells): gradient or glowing backgrounds, coloured stripes on cards, emoji as icons, uppercase "eyebrow" labels above headings, drop-shadow stacks, centred walls of text, placeholder lorem, three-dot "more" menus hiding the main action, the same heading twice (screen title + header title).

**Do.**
- Touch targets at least 44pt. Every pressable has an `accessibilityRole` and `accessibilityLabel`.
- Every screen handles **loading, empty, error (with retry) and signed-out** states.
- Headers: one title, set once.
- The soft red **Help** pill stays reachable from every in-person screen.
- Copy is short, plain and kind. Say what happens next ("Your phone will buzz when someone asks").

Screens still on the old layout, which need to move to v2: `app/kiosk/[venueId].tsx` (also still the old counter-code flow; switch it to the box/light flow), `app/venue/[id].tsx`, `app/dashboard/[venueId].tsx`.

## Privacy rules (do not weaken)

- The server never filters rows itself; RLS decides. New tables need RLS policies like `db/migrations/020_rls.sql`. `asSystem()` only for provisioning, jobs and `/hw`.
- The box endpoint returns a colour and nothing else. No names, no counts of who.
- A decline must look exactly like "not available" to the asker. The 24h cooldown after a decline is silent.
- Blocked users never see each other anywhere (familiar faces, connections, requests, meetups, venue lists).
- Meetup availability: each person sees only the overlap, and only after both answered.
- Never log tokens, device keys, emails or Wi-Fi details.

## Edge cases to check (each needs a test or a manual proof)

**Light and box**
- No claim, box disabled, after 10pm (when `box_hours` = `enforce`), or anything unclear → `off`. Fail closed.
- Red while a conversation runs, whatever the owner picked.
- Unknown table → 404, malformed id → 400, wrong device key → 401.
- Claiming a table someone else holds; claiming a second table while holding one.
- 3-hour auto check-out; "I'll be right back" holds 5 minutes, then releases.
- API restarts or the network changes mid-request: API stays up, app shows a retry, box shows no-signal, never a stale green.

**Requests and conversations**
- Request expires after 2 minutes; asker sees "not available", not "declined".
- Double-tapping Request / Join / Claim sends one action, not two.
- Two people tap Join on the same green table at once: one conversation.
- Requesting yourself, a blocked user, or after the 24h cooldown.
- Extend vote with only one yes; conversation ends while one phone is offline.
- Vote after the conversation ended (within 15 min) works; later it doesn't.
- Leave now mid-conversation, then Report what happened.
- Report ends the conversation, blocks, and turns the reporter's light red.

**Accounts and sessions**
- Expired or missing session on any screen → back to sign-in, no silent 401s. (Table page was fixed; check the rest.)
- Deep link to a table/meetup while signed out.
- First Auth0 sign-in with a blank profile; under-18 or empty profile fields.
- Demo account and Auth0 account on the same device, signing out and in.

**Meetups**
- "See the plan" on a **confirmed** plan currently opens a new empty planner, because `public.open_meetup()` only reuses `collecting`/`proposed`. Show the confirmed plan; make "plan another" explicit.
- `db/migrations/100_meetups.sql` and `100_places.sql` share a number. They don't depend on each other; leave applied files alone and number new ones from 120.
- No overlap, one side never answers, plan expires, forecast API down (Open-Meteo times out after 4s): the planner must still work without weather.
- Places API key missing or over quota: map shows seeded venues, nothing errors.

**General**
- Empty lists everywhere (no venues nearby, no connections, no requests).
- Long names and long venue names don't break layouts. Phone width 375pt, and web.
- Dark text on light only; no screen relies on colour alone to convey state (the light also has a word: Green / Yellow / Red / Off).

## Known gaps (fix or hide; don't fake)

- Matcher and rewards in `server/src/jobs.ts` are stubs. Either implement them simply or hide their UI. Never show made-up numbers.

## Report back

Per pass: what you reviewed, each bug found (file:line, what went wrong, how you fixed it), how you verified, and what's left.
