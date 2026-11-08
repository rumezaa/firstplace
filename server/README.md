# FirstPlace API server

Hono on Node 22. It sits between the app and the database: it verifies the Auth0 login, runs every query **as that user** so the database's privacy rules apply, calls Gemini, and serves the chat-table light. See [../docs/TECH_STACK.md](../docs/TECH_STACK.md) for the full design.

## Run it locally (5 minutes)

```bash
# 1. Database: TimescaleDB in Docker (same engine as Tiger Cloud)
docker run -d --name firstplace-db -e POSTGRES_PASSWORD=localdev -p 54330:5432 timescale/timescaledb:latest-pg17
docker exec firstplace-db psql -U postgres -c "create database firstplace"

# 2. Server
cd server
npm install
cp .env.example .env        # set DATABASE_URL to .../firstplace, add GEMINI_API_KEY
npm run db:setup            # applies db/migrations/*.sql, then db/seed.sql
npm run dev                 # http://localhost:8787/health
```

No Auth0 yet? Use the dev login: `POST /dev/login {"email":"demo@thirdplace.test"}` returns a token for the seeded demo user. Send it as `Authorization: Bearer <token>`.

**Switching to Tiger Cloud:** set `DATABASE_URL` to the Tiger connection string and run `npm run db:setup` again.

## Endpoints

| Method | Path | Login | What |
|---|---|---|---|
| GET | `/health` | – | server, database, Auth0 and Gemini status |
| GET | `/venues`, `/venues/live` | – | all venues; live counts per venue |
| GET | `/venues/:id`, `/venues/:id/live` | – | one venue; its live counts |
| GET | `/venues/:id/tables` | – | table grid (status only, never who) |
| GET | `/venues/:id/busy-hours` | – | from the TimescaleDB continuous aggregate |
| GET | `/venues/:id/crowd-tags` | – | tags held by 3+ recent visitors only |
| GET | `/venues/:id/vibe` | – | Gemini: "what it's like inside right now" |
| GET/PATCH | `/me` | ✓ | your profile |
| GET | `/me/checkins`, `/me/checkins/open` | ✓ | your history; your current check-in |
| GET | `/me/visited-venues`, `/me/rewards` | ✓ | passport and rewards |
| GET | `/me/familiar-faces` | ✓ | your cards (first name only after both say yes) |
| GET | `/me/familiar-faces/:id/openers` | ✓ | Gemini openers, **mutual matches only** |
| POST | `/checkins` | ✓ | `{code, tableId, openToChat}` from the kiosk QR |
| POST | `/checkins/checkout` | ✓ | check out |
| PATCH | `/checkins/:id` | ✓ | `{openToChat}` |
| POST | `/familiar-faces/:id/respond` | ✓ | `{accept}` |
| PATCH | `/tables/:id` | ✓ staff | `{status: open/taken}` from the kiosk grid |
| POST | `/kiosk/:venueId/code` | ✓ staff | mint a rotating kiosk code |
| GET | `/dashboard/:venueId`, `/dashboard/:venueId/insight` | ✓ staff | owner dashboard (hidden below 5 visitors); Gemini tip |
| GET | `/hw/tables/:tableId/state` | device key | chat-table light: `off`, `welcome` or `full` |

Errors come back as `{ "error": "message safe to show", "hint": "stable_token" }`.

## How privacy is enforced

- `asUser()` in `src/db.ts` opens a transaction, switches to the `authenticated` (or `anon`) role and sets `request.user_id`. The row-level security policies from `db/migrations/020_rls.sql` do the filtering.
- Only provisioning, background jobs and the hardware light use full access (`asSystem()`), and none of them returns a person's identity.
- The light **fails closed**: it is `welcome` only when everyone at the chat table is open to chat, and goes `off` on any "no", incognito or error.

## Background jobs (`src/jobs.ts`)

- auto check-out after 3 hours (every 5 min)
- familiar-faces matcher (every 15 min; still a stub in `db/migrations/050_matcher_and_rewards.sql`)
- forget personal check-ins older than 90 days (daily). Anonymous TimescaleDB events stay.

## Auth0 setup (what worked for us)

1. **APIs → Create API**: identifier `https://api.firstplace.app`, RS256.
2. **Applications → Create Application**: `FirstPlace`, type **Native**.
3. App → **URLs** tab (not Settings) → **Allowed Callback URLs** and **Allowed Logout URLs**:
   `exp://<laptop-LAN-IP>:8081, http://localhost:8081`. The sign-in screen shows the exact URL for each device in dev. The LAN IP changes with the Wi-Fi.
   Leave **Application Login URI** empty: it only accepts https. Auth0 also rejects a bare `firstplace://`.
4. App → **API Access** tab → authorize **FirstPlace API** for user access. Without it, sign-in fails with *"Client … is not authorized to access resource server"*.
5. App `.env`: `EXPO_PUBLIC_AUTH0_DOMAIN`, `EXPO_PUBLIC_AUTH0_CLIENT_ID`, `EXPO_PUBLIC_AUTH0_AUDIENCE`. Server `.env`: `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`.
