# FirstPlace: tech stack

**Status:** proposed, Nov 7 2026. It replaces Supabase with a stack that competes for the MLH sponsor prizes while keeping every privacy rule from the project doc.

> **Pitch:** We don't just find you a seat. We turn strangers you keep seeing into people you know.

## 1. Architecture

```
 Phones: iPhone + Android (Expo Go)     Cafe kiosk + owner dashboard (Expo web, laptop/tablet)
                 │                                      │
                 └────── Auth0 login (only at check-in) ┘
                                   │  Bearer access token
                                   ▼
          API server: Node 22 + Hono (TypeScript), Docker on Vultr
          https://api.<our-domain>   (GoDaddy Registry domain, HTTPS via Caddy)
            ├─ verifies the Auth0 token
            ├─ runs every query AS that user → database privacy rules still apply
            ├─ calls the existing SQL functions (check_in, my_familiar_faces, …)
            ├─ Gemini API: venue vibe, openers after a match, owner tip
            └─ /hw endpoints for the chat-table light  ◀── ESP32 polls every 2s
                                   │
                                   ▼
          Tiger Data (Tiger Cloud: Postgres + TimescaleDB)
            check-ins = hypertable · busy hours = continuous aggregate
            raw check-ins deleted after 30 days, totals kept
```

## 2. Stack at a glance

| Layer | Choice | Why |
|---|---|---|
| App | **Expo SDK 58**, React Native 0.88, Expo Router, TypeScript, NativeWind | Already built. Runs in Expo Go on iPhone and Android, so judges scan a QR. |
| Map | `react-native-maps` | Works in Expo Go with no native setup |
| QR | `expo-camera` to scan, `react-native-qrcode-svg` for the kiosk | Rotating codes stop fake check-ins from home |
| Kiosk + dashboard | The same app, run with `expo start --web` on a laptop or tablet | No extra app to build |
| Auth | **Auth0** Universal Login via `expo-auth-session` (PKCE) | Works in Expo Go. Not `react-native-auth0`, which needs a custom build. |
| API | **Hono** on Node 22 | Small, fast, easy to write and review |
| Hosting | **Vultr** Cloud Compute, Docker Compose, **Caddy** for automatic HTTPS | One box for the API and the landing page |
| Domain | **GoDaddy Registry** free domain: root for the landing page, `api.` for the API | |
| Database | **Tiger Data** (Postgres + TimescaleDB), driver `pg` | Check-ins are time-series data |
| AI | **Gemini API** (`@google/genai`, `gemini-3.5-flash` with fallbacks), server only | The key never ships in the app |
| Live updates | Polling every 5s | Replaces Supabase Realtime. Simple and demo-safe. |
| Hardware | **ESP32** + **PN532** NFC reader + LED strip | The physical "open to chat" table light |
| Code | GitHub (`rumezaa/firstplace`), mirrored to **Entire** | |

## 3. Product rules (from the project doc)

| Rule | Value |
|---|---|
| Kiosk QR | rotates every **30s**, expires after **45s** |
| Familiar faces | **3+** overlapping visits at the same cafe within **90 days**. Proposed: at least **20 min** of overlap, at most **one overlap per day**. |
| Name reveal | first name only, and only after **both** people accept |
| Auto check-out | after **3 hours** |
| Regular reward | **5 visits** at one cafe = a free drink; chat-table check-ins count **double** |
| Cafe passport | a stamp for every new cafe; a reward for all **12** |
| Owner dashboard | aggregates only, hidden below **5 visits** |
| Incognito | removed from every count and from familiar faces |

## 4. Privacy: how it survives the move

The current SQL already enforces privacy inside the database. We keep it, and change only *how the database knows who you are*.

1. `auth.uid()` (Supabase) is replaced by `app.uid()`, which reads `current_setting('app.user_id')`.
2. The server wraps each request in a transaction:
   `SET LOCAL ROLE app_user; SELECT set_config('app.user_id', <uuid>, true);`
3. `app_user` cannot bypass row-level security. Every current rule still applies: you only see your own check-ins, shared numbers come from aggregate views only, the private schema stays locked, and the minimum group size of 5 holds.
4. `users` keeps its `uuid` id and gains `auth0_sub text unique`. On first login the server creates the user row.
5. The seed's `auth.users` / `auth.identities` inserts become a normal `users` row with a fixed `auth0_sub` for the demo account.

If the server forgets a filter, the database still refuses.

## 5. Tiger Data: what we use it for

- `checkins` becomes a **hypertable** on `checked_in_at`.
- Busy-by-hour becomes a **continuous aggregate**, refreshed automatically.
- A **retention policy** deletes raw check-ins after 30 days and keeps the totals. We forget where you were and still know when the cafe is busy.
- The owner dashboard reads only continuous aggregates.

## 6. Gemini: helper, not a chatbot

| Feature | What it reads (never an identifiable person) | What it writes |
|---|---|---|
| Venue vibe | busy hours, crowd tags, open-to-chat count, venue info | a 2-sentence "what it's like inside right now" |
| Conversation openers | shared interests and the venue, **after mutual acceptance only** | 3 opener ideas |
| Owner tip | the dashboard aggregates | one practical tip, e.g. "Tuesdays 2–4pm are quiet: try a study-hour deal" |

Rate-limited per user, with responses cached in the database.

## 7. Hardware: the chat-table light

```
ESP32 (Wi-Fi) ── GET /hw/tables/:tableId/state  (header: X-Device-Key) ── every 2s
      │            ← { "lit": true, "openToChat": 2 }
      ├─ LED strip glows warm while someone open to chat is checked in at that table
      └─ PN532 + NFC: tap your phone on the table to open the check-in (stretch)
```

- The device gets **counts only**, never who is sitting there.
- Each device has its own key, checked by the server.
- For the demo, run it on a **phone hotspot**, not venue Wi-Fi.
- If it fails, the in-app chat-table highlight still tells the story.

## 8. API

The app makes about 15 Supabase calls today, all in `src/lib/*`. Each becomes one endpoint. `src/lib/supabase.ts` is replaced by `src/lib/api.ts`, a typed `fetch` wrapper that adds the Auth0 token. The screens barely change.

| Today | New endpoint | Login |
|---|---|---|
| `from('venues')`, `from('venue_live')` | `GET /venues`, `GET /venues/:id` | no |
| `from('tables')` | `GET /venues/:id/tables` | no |
| `rpc('check_in')`, `rpc('check_out')` | `POST /checkins`, `POST /checkins/:id/checkout` | yes |
| `from('checkins')` | `GET /me/checkins` | yes |
| `from('rewards')` | `GET /me/rewards` | yes |
| `rpc('my_familiar_faces')`, `rpc('respond_to_familiar_face')` | `GET /me/familiar-faces`, `POST /familiar-faces/:id/respond` | yes |
| `rpc('rotate_kiosk_code')` | `POST /kiosk/:venueId/code` | staff |
| `rpc('venue_dashboard')` | `GET /dashboard/:venueId` | staff |
| `rpc('auto_checkout_stale')`, matcher | server jobs (every 5 min / 15 min) | — |
| `auth.*` | Auth0 in `SessionProvider` | — |
| new | `GET /venues/:id/vibe`, `GET /familiar-faces/:id/openers`, `GET /dashboard/:venueId/insight` | varies |
| new | `GET /hw/tables/:tableId/state` | device key |

## 9. Repo layout after the change

```
app/  src/            Expo app (same structure)
server/               Hono API: routes/, db.ts, auth.ts, gemini.ts, jobs.ts, Dockerfile
db/migrations/        ported SQL (Supabase parts removed, TimescaleDB added)
db/seed.sql           real Calgary cafes, libraries and community centres + demo data
hardware/             ESP32 sketch
deploy/               docker-compose.yml, Caddyfile
```

## 10. Secrets

The repo is **public**. Run `git diff --staged` before every push.

| Secret | Where it lives | Never in |
|---|---|---|
| Tiger connection string | `server/.env` on Vultr | the app, git |
| Gemini API key | `server/.env` | the app, git |
| ESP32 device keys | `server/.env` + the device | git |
| Auth0 domain, client ID, audience | app `.env` (`EXPO_PUBLIC_*`), public by design | — |

## 11. Accounts to create

1. **Tiger Cloud:** a free service; copy the connection string.
2. **Auth0:** a tenant, a **Native** application (callback = the Expo redirect URI) and an **API** (the audience).
3. **Vultr:** claim the MLH credit, then create a small Ubuntu instance.
4. **GoDaddy Registry:** claim the free domain through MLH.
5. **Entire:** log in from the MLH prize page.

## 12. Build order (the demo works after every step)

0. **Fallback:** run `supabase/setup_all.sql` on the current Supabase project, so tonight's demo works on the prototype as it stands.
1. **Tiger:** port the migrations and seed, then re-check the privacy rules.
2. **Server:** Auth0 middleware, the endpoints and jobs, running locally.
3. **App:** `api.ts` + Auth0 login, tested in Expo Go on iPhone and Android.
4. **Familiar-faces matcher and rewards:** implement the two SQL stubs in migration 0500.
5. **Gemini** endpoints and UI.
6. **Deploy:** Vultr, domain, HTTPS; point the app at it.
7. **Hardware:** the ESP32 light reading `/hw`.
8. **Polish:** real Calgary venues, an accessibility pass, the rename to FirstPlace everywhere.
9. **Submit:** Entire mirror, Devpost, backup demo video, DEV post after the event.

## 13. Prize map

| Prize | How we qualify |
|---|---|
| MLH Best Use of Gemini API | vibe, openers and owner tips, all server-side |
| MLH Best Use of Auth0 | login with tokens verified server-side; database rules keyed to the Auth0 user |
| MLH Best Use of Tiger Data | hypertable, continuous aggregates, retention policy for privacy |
| MLH Best Use of Vultr | the API and landing page hosted on Vultr |
| MLH Best Domain (GoDaddy Registry) | our domain for the API and landing page |
| MLH Best Use of Entire | the repo mirrored there; our human + AI-agent workflow |
| MLH DEV Writing Challenge | a post after the event |
| Benevity: Best Local Impact | real Calgary neighbourhoods, newcomers, students |
| Clio: Best in Accessibility | privacy by design, no login to browse, accessible UI |
| Hardware angle (ZeroKey judges) | the chat-table light and kiosk |
| Skipped | Solana (no natural fit), Voltex/AESO (no energy angle) |
