# NFC stickers and QR codes

Every sticker and printed QR holds a link to the **API server**, not to the app:

| Tag | Link | Opens |
| --- | --- | --- |
| Table box | `<base>/t/<tableId>` | `<APP_LINK_BASE>table/<tableId>` |
| Venue entrance | `<base>/v/<venueId>` | `<APP_LINK_BASE>floor/<venueId>?here=1` |

**Entrance tag = check-in.** `?here=1` makes the floor screen call `POST /venues/<id>/enter`: you're checked in to the venue with no table (a table you already hold there is kept). Nothing goes over NFC; the login says who you are. The screen then shows the room in counts only (`GET /venues/<id>/room`, `db/migrations/170_venue_presence.sql`): "12 people here · 4 open to talk · 3 into hiking like you". The interest line needs two or more people, respects "Show what we have in common" and blocks, and never says who. Incognito people aren't counted. Opening the floor from inside the app shows an **I'm here** button instead.

The server answers with a tiny page that jumps into the app and shows a big **Open in app** button (Android sometimes blocks the automatic jump). No login, no database call. Code: `server/src/tagLinks.ts`.

**Change `APP_LINK_BASE` in `server/.env`, never the stickers:**

```
APP_LINK_BASE=firstplace://                    # dev build
APP_LINK_BASE=exp://<laptop-ip>:8081/--/       # Expo Go
WEB_APP_URL=https://<web-build>                # optional "Open on the web" link
```

In the app, `boxLink()` / `floorLink()` (`src/lib/conversations.ts`) build the same links from `EXPO_PUBLIC_BOX_BASE_URL` (blank = the API URL), so the QR on `/box/<tableId>` and `/kiosk/<venueId>` matches the sticker.

## 1. Pick the base

- **Deployed server** (`https://api.<our-domain>`): use it. Works from any network.
- **Laptop** (`http://<laptop-ip>:8787`): only works on the same Wi-Fi, and the stickers must be rewritten if the IP changes. Deploy first if you can.

## 2. List the links

```bash
BASE=https://api.<our-domain>
curl -s $BASE/venues | jq -r '.[] | "\(.name) entrance → '$BASE'/v/\(.id)"'
curl -s $BASE/venues/<venueId>/tables | jq -r '.[] | "\(.label) → '$BASE'/t/\(.id)"'
```

Or straight from the database:

```sql
select v.name, t.label, '<base>/t/' || t.id as link
from public.tables t join public.venues v on v.id = t.venue_id
order by v.name, t.label;
```

## 3. Write the stickers

NFC Tools → **Write** → Add a record → **URL/URI** → paste the link → Write, then hold the phone to the sticker.

- **Don't lock the tags yet.** Locking is permanent; only lock after the event if you're keeping them.
- Label each sticker on the back with its table name.

## 4. Test, in this order

1. Tap a table tag with an Android phone → the table screen opens.
2. Same tag with an iPhone.
3. Signed out → the table shows "Sign in to claim"; check it comes back to the table after signing in.
4. Entrance tag → the floor map opens and says "You're checked in here."
5. Scan the QR on the virtual box screen → lands in the same place.
6. Switch `APP_LINK_BASE` between Expo Go and a dev build (restart the server) → the same sticker still works.

## Demo safety

- Keep the virtual box screen (`/box/<tableId>`) open on a laptop as a backup.
- Bring a few pre-written spare stickers.
