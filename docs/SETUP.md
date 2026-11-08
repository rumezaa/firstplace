# FirstPlace: developer setup

Everything you need to run FirstPlace on your own laptop and build features. About 15 minutes the first time.

## What you're running

| Part | Folder | Runs on |
|---|---|---|
| iPhone app (Expo / React Native) | `app/`, `src/` | `npx expo start` → Expo Go or the browser |
| API server (Hono, Node 22) | `server/` | http://localhost:8787 |
| Database (Postgres + TimescaleDB) | `db/` | Docker on your laptop |

Read [TECH_STACK.md](TECH_STACK.md) for how the pieces fit, and [BOX.md](BOX.md) for the hardware light.

## You need

- Node 22+, Git, and **Docker Desktop** (running)
- Two config files from Farhan, sent privately: `app.env` and `server.env`. They contain no shared secrets.
- Optional: the **Expo Go** app on your phone, and a free Expo account

## 1. Get the code

```bash
git clone https://github.com/rumezaa/firstplace.git   # skip if you already have it
cd firstplace
git fetch
git switch feat/backend-structure
npm install
```

## 2. Add the config files

| Save this file | As |
|---|---|
| `app.env` | `firstplace/.env` |
| `server.env` | `firstplace/server/.env` |

Both are gitignored. Never commit them.

## 3. Start a local database

```bash
docker run -d --name firstplace-db -e POSTGRES_PASSWORD=localdev -p 54330:5432 timescale/timescaledb:latest-pg17
docker exec firstplace-db psql -U postgres -c "create database firstplace"
```

Next time, just run `docker start firstplace-db`.

## 4. Start the API (terminal 1)

```bash
cd server
npm install
npm run db:setup     # creates every table and loads the demo data
npm run dev
```

Check http://localhost:8787/health. You should see `"ok":true`.

## 5. Start the app (terminal 2)

From the `firstplace` folder:

```bash
npx expo start
```

- **Browser:** press `w`. Good for quick UI work; the map shows as a list on the web.
- **Your iPhone:**
  1. `npx expo login` on the laptop, and sign in to **Expo Go** with the same account.
  2. Put the phone and laptop on the **same network**. A phone hotspot works best, because campus Wi-Fi blocks devices from reaching each other.
  3. Scan the QR code in the terminal with the iPhone Camera.

## 6. Sign in

Tap **Try the demo account**. It signs you in as a seeded user ("Alex") without Auth0. Auth0 sign-in only works on addresses registered in Auth0, so ask Farhan to add yours if you need it.

## How we work

- **Branch per feature:** `git switch -c rumeza/<feature-name>`, then open a pull request into `feat/backend-structure`. Don't push to someone else's branch.
- **Database changes** go in a new file in `db/migrations/`, numbered after the last one (for example `090_my_change.sql`). Run `npm run db:setup` to apply it locally. Never edit the shared database directly; Farhan applies migrations to it after a merge.
- **Privacy rules live in the database.** Every API request runs as the signed-in user, so row-level security decides what they can see. New tables need RLS policies like the ones in `db/migrations/020_rls.sql`.
- **Design:** follow the FirstPlace design kit (v2). Colours come from the tokens in `global.css` and `src/lib/theme.ts`. Green, yellow and red are only for the box light.
- **Before you push:**
  ```bash
  npx tsc --noEmit                         # app
  (cd server && npx tsc --noEmit -p tsconfig.json)   # API
  npx expo lint
  ```

## Useful commands

| Command | What it does |
|---|---|
| `npm run db:setup` (in `server/`) | Rebuild the schema and reset the demo data |
| `python3 server/tests/flow_test.py http://localhost:8787` | End-to-end test of claim → request → conversation → vote (run on fresh demo data) |
| `npx expo start --clear` | Restart the app with a clean cache |
| `docker start firstplace-db` | Start the database after a reboot |

## When something breaks

| Problem | Fix |
|---|---|
| App says "Can't reach FirstPlace at http://…" | The API isn't running, or your phone isn't on the same network as the laptop. Check http://localhost:8787/health. |
| Expo Go: "You need to be signed in" | Sign in to the same Expo account on the laptop (`npx expo login`) and in Expo Go. |
| Expo Go spins on "Opening project" | The phone can't reach the laptop. Use a phone hotspot. |
| `db:setup` fails to connect | Docker isn't running, or the container is stopped: `docker start firstplace-db`. |
| Auth0 "callback URL mismatch" | Use the demo account, or ask Farhan to add the address shown on the sign-in screen. |
