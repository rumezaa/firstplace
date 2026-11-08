# Auth0 callback URLs

If sign-in ends on a dark Auth0 page saying

> Callback URL mismatch. The provided redirect_uri is not in the list of allowed callback URLs.

this is the page to read. Nothing is broken in the code: Auth0 was handed an
address it hasn't been told to trust.

## Why there isn't one address

Auth0 compares the `redirect_uri` the app sends against the exact strings in
**Applications → FirstPlace → Settings → Allowed Callback URLs**. Character for
character — scheme, port and trailing slash all count, and wildcards are only
allowed in the subdomain of an `https://` URL.

The app can't send one fixed string, because the way a browser hands control
back to the app is different in each environment:

| Where you're running | What the app sends |
|---|---|
| Development build, TestFlight, store build | `firstplace://auth/callback` |
| Web (`npx expo start`, press `w`) | `http://localhost:8081/auth/callback` |
| **Expo Go on a phone** | `exp://<your-laptop-LAN-IP>:8081/--/auth/callback` |

The last one is the usual cause of the error. Expo Go can't own our
`firstplace://` scheme, so it routes the answer back through the Expo dev
server — and that address holds *your* laptop's address on *today's* network.
It is different for every person on the team and changes when you switch
Wi-Fi, so it cannot be registered once and left alone.

The app always knows which one it is using. It prints it to the terminal on
start:

```
[auth0] redirect_uri = exp://192.168.1.42:8081/--/auth/callback
```

and shows the same string at the bottom of the sign-in screen in development.
Copy it from there rather than guessing.

## What to put in the Auth0 dashboard

Tenant `dev-bvbtjmza0zjiz4ip.us.auth0.com`, Applications → **FirstPlace**.
Fields take a comma-separated list.

**Application type** must be **Native**. A Native app is a public client, which
is what lets the app finish sign-in with PKCE and no client secret. If it is
set to Single Page Application or Regular Web App, the token exchange fails
even when the callback URL is right.

**Allowed Callback URLs**

```
firstplace://auth/callback,
http://localhost:8081/auth/callback,
http://localhost:8081
```

Add your own Expo Go address to the same list while you need it:

```
exp://192.168.1.42:8081/--/auth/callback
```

**Allowed Logout URLs** — same list. Needed once the app calls Auth0's
`/v2/logout` (today sign-out only clears the local session).

**Allowed Web Origins** and **Allowed Origins (CORS)** — only for the web
build:

```
http://localhost:8081
```

Without these, the browser blocks the call to `/oauth/token` and sign-in fails
*after* a successful login, which looks like a different bug.

Press **Save Changes** at the bottom. It takes effect immediately; no rebuild.

## Two ways to work on a phone

**Pin your address (quick).** Copy the `exp://…` line from the sign-in screen,
add it to Allowed Callback URLs in Auth0, and put it in your own `.env` so a
changing IP doesn't silently move the target:

```
EXPO_PUBLIC_AUTH0_REDIRECT_URI=exp://192.168.1.42:8081/--/auth/callback
```

Restart with `npx expo start --clear` — `EXPO_PUBLIC_*` values are compiled
into the bundle, so a plain reload won't pick up the change. `.env` is
gitignored, so this stays yours.

**Use a development build (does not rot).** A development build owns the
`firstplace://` scheme, so the callback becomes `firstplace://auth/callback` on
every machine and every network, and that single entry covers the team
forever. This is also what Expo's own docs recommend — Expo Go isn't meant for
OAuth work.

```bash
npx expo run:ios        # or: npx expo run:android
```

Either way, **Try the demo account** still works without Auth0 at all, and is
the fastest path if you're working on something other than login.

## If it still mismatches

- Compare the two strings side by side. A trailing `/`, `http` vs `https`, or
  port `8081` vs `19006` is enough to fail.
- Changed `.env`? Restart with `npx expo start --clear`.
- Changed `expo.scheme` in app.json? The scheme is baked into the native
  project: `npx expo prebuild --clean`, then rebuild.
- Check you edited the **FirstPlace** application in Auth0, not another one in
  the tenant, and that `EXPO_PUBLIC_AUTH0_CLIENT_ID` in `.env` is that
  application's Client ID.
