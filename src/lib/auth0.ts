import * as AuthSession from 'expo-auth-session';

/**
 * Auth0 settings, and the one value that has to agree on both sides: the
 * redirect URI.
 *
 * Auth0 compares the `redirect_uri` we send against the exact strings in
 * Applications -> FirstPlace -> Settings -> Allowed Callback URLs. Anything
 * that isn't on that list, character for character, gets the "Callback URL
 * mismatch" page instead of a login box.
 *
 * The catch is that the URI is not one string: it depends on where the app is
 * running. docs/AUTH0.md lists every one of them and what to paste where.
 */

export const AUTH0_DOMAIN = process.env.EXPO_PUBLIC_AUTH0_DOMAIN?.trim() ?? '';
export const AUTH0_CLIENT_ID = process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID?.trim() ?? '';
export const AUTH0_AUDIENCE = process.env.EXPO_PUBLIC_AUTH0_AUDIENCE?.trim() ?? '';

export const AUTH0_AVAILABLE = Boolean(AUTH0_DOMAIN && AUTH0_CLIENT_ID && AUTH0_AUDIENCE);

/**
 * Must stay equal to `expo.scheme` in app.json. The scheme is what lets iOS
 * and Android hand the browser's answer back to this app, and it is baked into
 * the native project: after changing it, rebuild (`npx expo prebuild --clean`).
 */
export const APP_SCHEME = 'firstplace';

/**
 * A fixed path on the end of the redirect. It costs nothing and buys two
 * things: the URL reads as a URL (Auth0 validates what you paste into the
 * dashboard), and `app/auth/callback.tsx` gives it somewhere real to land on
 * the web instead of a 404.
 */
export const AUTH0_CALLBACK_PATH = 'auth/callback';

/**
 * What the current environment produces on its own:
 *
 *   development build / TestFlight / store build   firstplace://auth/callback
 *   Expo Go on a phone                             exp://<laptop-lan-ip>:8081/--/auth/callback
 *   web (dev)                                      http://localhost:8081/auth/callback
 *   web (deployed)                                 https://<host>/auth/callback
 *
 * The Expo Go one is the troublemaker: it contains the LAN address of whoever
 * is running `npx expo start`, so it is different on every laptop and changes
 * when the network does. It cannot be pre-registered for the whole team, and
 * Auth0 does not accept wildcards for it.
 */
const derivedRedirectUri = AuthSession.makeRedirectUri({
  scheme: APP_SCHEME,
  path: AUTH0_CALLBACK_PATH,
});

/**
 * Escape hatch for exactly that case: put the address the sign-in screen shows
 * you into `EXPO_PUBLIC_AUTH0_REDIRECT_URI` in .env (and into Auth0), and the
 * app will use it verbatim. No code change, no shared branch to edit.
 */
const pinnedRedirectUri = process.env.EXPO_PUBLIC_AUTH0_REDIRECT_URI?.trim() ?? '';

/** The address Auth0 sends you back to. Register this exact string. */
export const AUTH0_REDIRECT_URI = pinnedRedirectUri || derivedRedirectUri;

/** True when .env is overriding the derived value. */
export const AUTH0_REDIRECT_URI_PINNED = Boolean(pinnedRedirectUri);

/**
 * Expo Go hands back an `exp://` dev-server URL because it cannot register our
 * custom scheme. Expo's own guidance is to use a development build for OAuth;
 * registering the address below is the workaround when you can't.
 */
export const RUNS_IN_EXPO_GO = derivedRedirectUri.startsWith('exp://');

/**
 * What to do about a "Callback URL mismatch", worded for whoever is looking at
 * the screen right now rather than for the Auth0 docs.
 */
export function auth0CallbackMismatchHelp(): string {
  const register = `Add this exact address to Auth0 -> Applications -> FirstPlace -> Settings -> Allowed Callback URLs:\n\n${AUTH0_REDIRECT_URI}`;

  if (RUNS_IN_EXPO_GO && !AUTH0_REDIRECT_URI_PINNED) {
    return `${register}\n\nIt contains this laptop's network address, so it only works here and it changes when the network does. For something permanent, run a development build (npx expo run:ios) and register ${APP_SCHEME}://${AUTH0_CALLBACK_PATH} instead, or sign in with the demo account.`;
  }
  return `${register}\n\nIt has to match character for character, including the scheme, any port, and no trailing slash.`;
}

if (__DEV__ && AUTH0_AVAILABLE) {
  // Printed on every start so the address is in the terminal when you need to
  // paste it into Auth0, not just on the sign-in screen.
  console.log(
    `[auth0] redirect_uri = ${AUTH0_REDIRECT_URI}` +
      (AUTH0_REDIRECT_URI_PINNED ? ' (pinned by EXPO_PUBLIC_AUTH0_REDIRECT_URI)' : ''),
  );
}
