# ChatterBox

ChatterBox is a mobile app and a small light box for study tables and cafes in Calgary. It gives people an easy, low-pressure way to start talking to each other.

## Why we built it

**Loneliness is common, and it's a health problem.**

- About **1 in 6 people worldwide** feel lonely. The World Health Organization links loneliness to roughly **871,000 deaths a year**: about 100 every hour. ([WHO, 2025](https://www.who.int/news/item/30-06-2025-social-connection-linked-to-improved-heath-and-reduced-risk-of-early-death))
- In Canada, **13% of people aged 15 and over** say they always or often feel lonely. Among people aged 15 to 24, it's **17%**. ([Statistics Canada, 2024](https://statcan.gc.ca/o1/en/plus/6735-youve-got-friend-me))

**Calgary is no exception.**

- About **2 in 10 Calgarians** say they often or always feel lonely, which is above the national average. That figure is from the Calgary Foundation's 2024 Quality-of-Life Report, as reported by [Avenue Calgary](https://www.avenuecalgary.com/city-life/loneliness-calgary).
- The same article cites United Way research finding that **1 in 5 Calgarians** don't feel a sense of belonging.
- In a 2023 national study, **28% of Calgarians** felt lonely at least three days a week. ([Insauga](https://insauga.com/loneliest-people-in-canada-live-in-toronto-mississauga-brampton-and-southern-ontario))

**People want to talk to each other; they just assume others don't.** In a Chicago study, commuters asked to talk to a stranger had a more pleasant ride than commuters asked to sit in silence. Beforehand, people predicted the opposite. Many wanted to talk but assumed the person next to them didn't. ([Epley & Schroeder, 2014, via Chicago Booth Review](https://www.chicagobooth.edu/review/talk-to-a-stranger-itll-make-you-happier))

## What ChatterBox changes

ChatterBox removes the guesswork. It creates low-pressure, controlled situations where people can choose to talk:

1. **You know who is open to chat before you sit down.** Each table has a light. Green means the people there are happy to talk. Red means not right now. Yellow means a seat is free. Nobody has to risk an awkward approach, and anyone can say "not now" without explaining.
2. **The people you keep seeing can become people you know.** The app notices when you and another regular keep turning up at the same place. It offers an introduction that only happens if you _both_ say yes, then helps you plan a second meeting.
3. **You stay in control.** Conversations have a set length, and you both vote on whether to keep going. Leave, Report and Help are always one tap away. Your name is shared only when you both agree.

**The ChatterBox community is for everyone.** Students, newcomers to Calgary, remote workers, older adults: anyone who wants a little more connection is welcome. We keep looking for new ways to bring people together, starting with the places they already go.

The demo runs at the University of Calgary's Taylor Family Digital Library (TFDL), floor 3, and at a set of Calgary cafes.

---

## What it does

| Feature                       | What you see                                                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Explore**                   | Calgary places on a map or a list, including the UCalgary campus. Live counts and a short Gemini summary of what each place is like right now.                                                               |
| **Floor map**                 | TFDL floor 3, traced from the real floor plan, with every study table showing its light.                                                                                                                     |
| **Table**                     | Claim a table and set your light to green or red. "I'll be right back" holds your seat for 5 minutes. You're checked out automatically after 3 hours.                                                        |
| **Conversations**             | Join a green table and talk. The light turns red while you talk. At the end you both vote on whether to keep going. Leave now, Report and Help are always one tap away.                                      |
| **People**                    | Familiar faces: you get a card when you've overlapped with someone on 3 or more separate days, for at least 20 minutes each time. You see a first name only after you both accept.                           |
| **Meetups**                   | Plan a second meeting with a connection. Each of you sees only the times you share. The plan takes Calgary weather, holidays and opening hours into account. There's also an "Or just go for a walk" option. |
| **You**                       | Your profile and interests, privacy settings (incognito, and "Show what we have in common"), and your recent visits.                                                                                         |
| **Box**                       | An ESP32 light on the table that mirrors the table's colour in about 2 seconds.                                                                                                                              |
| **Kiosk and owner dashboard** | For venue staff, in the web version of the app. The dashboard shows totals only and hides them below 5 visitors.                                                                                             |
| **Landing page**              | A static site in [`website/`](website/).                                                                                                                                                                     |

---

## How it works

```
 Phones (Expo Go)        Kiosk / dashboard / box screen (Expo web)        ESP32 box
        │                                 │                                   │
        └────── Auth0 sign-in ────────────┘                    X-Device-Key, every 2s
                         │ Bearer token                                       │
                         ▼                                                    ▼
          API: Node 22 + Hono (server/) ──────────────────────── GET /hw/tables/:id/state
            ├─ runs every query as the signed-in user → row-level security decides
            ├─ Gemini: venue summaries, openers, meetup plans, owner tips (server-side only)
            ├─ Google Places + Calgary open data + Environment Canada weather
            └─ background jobs: conversation expiry, 10pm box shutoff, familiar-faces matcher
                         │
                         ▼
          Tiger Data (Postgres + TimescaleDB)   db/migrations/*.sql
```

| Layer    | Choice                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------- |
| App      | Expo SDK 58, React Native, Expo Router, TypeScript, NativeWind                                     |
| Sign-in  | Auth0 through `expo-auth-session` (works in Expo Go). A demo account is available for development. |
| API      | Hono on Node 22                                                                                    |
| Database | Tiger Data: Postgres + TimescaleDB (check-ins stored by time, busy hours precomputed)              |
| AI       | Gemini, server-side only, with rate limits, timeouts and fallback text                             |
| Hardware | ESP32 + LED strip ([firmware](https://github.com/AArellano101/first-place-embedded))               |

More detail: [TECH_STACK.md](docs/TECH_STACK.md) · [MEETUP_PLANNER.md](docs/MEETUP_PLANNER.md) · [BOX.md](docs/BOX.md) · [AUTH0.md](docs/AUTH0.md)

---

## Privacy

The privacy rules are enforced in the database, not just hidden by the app. The server runs each request as the signed-in user, so if the server forgets a filter, the database still refuses.

- **Nobody can see who is at a place.** You can only read your own check-ins. Crowd information comes pre-counted, with no names or IDs.
- **The box gets a colour and nothing else.** No names, no counts. If anything is unclear (no one at the table, box switched off, after 10pm, any error), the light goes **off**.
- **Names appear only after both people accept.** Before that, the name is never sent at all.
- **A decline looks exactly like "not available."** The 24-hour cooldown after a decline is silent.
- **Blocked people never see each other** anywhere in the app.
- **Incognito** removes you from every count and from familiar faces.
- **Meetup times:** each person sees only the times you share, and only after both of you have answered.
- **Owner dashboard:** totals only, hidden below 5 visitors.
- **Check-ins are forgotten.** Personal check-ins are deleted after 90 days. Anonymous busy-hour totals are kept.
- **Gemini never sees an identifiable person**, only totals, shared interests and public places.

---

## Run it

Full walkthrough: **[docs/SETUP.md](docs/SETUP.md)** (about 15 minutes the first time).

```bash
# 1. Database (TimescaleDB in Docker)
docker run -d --name firstplace-db -e POSTGRES_PASSWORD=localdev -p 54330:5432 timescale/timescaledb:latest-pg17
docker exec firstplace-db psql -U postgres -c "create database firstplace"

# 2. API (terminal 1)
cd server
npm install
cp .env.example .env          # set DATABASE_URL, add GEMINI_API_KEY
npm run db:setup              # applies db/migrations/*.sql and loads demo data
npm run dev                   # http://localhost:8787/health

# 3. App (terminal 2, from the repo root)
npm install
cp .env.example .env          # Auth0 values; leave EXPO_PUBLIC_API_URL blank locally
npx expo start                # scan the QR with Expo Go, or press w for web
```

On the sign-in screen, tap **Try the demo account** to skip Auth0. Put your phone and laptop on the same network; a phone hotspot works best.

To seat demo students on TFDL floor 3: `python3 server/scripts/demo_floor.py`.

### Check your work

```bash
npx tsc --noEmit
npx expo lint
(cd server && npx tsc --noEmit -p tsconfig.json && npm test)
python3 server/tests/flow_test.py http://localhost:8787      # needs the API running on fresh demo data
python3 server/tests/meetup_test.py http://localhost:8787
```

---

## Project layout

```
app/                 Expo Router screens (every file is a route)
  (auth)/            sign-in
  (tabs)/            Explore, Table, People, You
  venue/ floor/      venue page, floor map
  table/ conversation.tsx waiting/   claim a table, talk, wait on a request
  meetup/            plan a second meeting
  box/ kiosk/ dashboard/             web screens for the box, kiosk and owners
src/                 components, hooks, API client and helpers (imported as @/)
server/              Hono API, background jobs, Gemini, Places, weather, tests
db/migrations/       database setup in numbered SQL files (applied in order) + seed.sql
website/             static landing page
docs/                setup, tech stack, box, Auth0, meetup planner, review brief
supabase/            old Supabase version, kept for reference only and no longer used
```

---

## Status

**Working:** sign-in, Explore, floor map, table lights and the box, conversations and votes, familiar faces (with real matching), connections, meetup planner, profile and privacy settings, kiosk, owner dashboard, landing page.

**Not done yet:**

- **Rewards** (5 visits = a free drink, cafe passport). `recompute_rewards()` is still a placeholder, so the Rewards screen says it isn't available yet rather than showing made-up numbers.
- **Staff-only access.** Any signed-in user can currently open the owner dashboard and change a table's status. This should be limited to venue staff.
- **Confirmed meetups.** "See the plan" on a confirmed meetup opens a new, empty planner instead of showing the plan.

---

## Next steps

These are designed but not built yet.

### Open to people without the app

Chatter circle tables are for everyone, not just app users. Today anyone can see the light and sit at a green table. Next:

- **A QR code that works in any phone camera.** It opens the table in the app if it's installed, or a simple web page if it isn't. That page explains the colours and lets people join from the browser, with nothing to download.
- **Join as a guest.** A first name and an "I agree to the house rules" tap, for one visit, with no account needed.
- **A button on the box** so anyone can switch a table between green and red without a phone.
- **Staff can turn on a table for a walk-in** from the kiosk.

### Safety at the table

Today you can turn your light red, leave at any time, and use the Help screen. Help calls 911, shows an "I need some help, please" card for staff, and lists Calgary support lines. Next:

- **Report a problem at this table.** The report is tied to the table and the time, not to a person, so it works even when the other person has no account. It goes to venue staff and to the ChatterBox team.
- **A quiet staff alert.** Tapping Help also lets staff know, for example "Someone at Table 5 needs help". Staff can then switch that table to red or off.
- **House rules on every chatter circle table:** be kind, accept "not now", red means don't disturb, and staff can ask anyone to leave.
- **An easy way out:** a "need an exit?" button that brings up a fake call or reminder, so you can leave without a confrontation.

### Growing the community

- More chatter circle tables across Calgary cafes, libraries and community centres.
- Rewards for regulars, and a passport stamp for every new place.
- More ways to bring people together, starting with the places they already go.

Contributing or reviewing? Start with [docs/REVIEW_BRIEF.md](docs/REVIEW_BRIEF.md) for the design rules, privacy rules and edge cases.
