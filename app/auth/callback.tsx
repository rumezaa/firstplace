import { Redirect } from 'expo-router';

/**
 * Where Auth0 lands after a sign-in: `firstplace://auth/callback` on a device,
 * `http://localhost:8081/auth/callback` on the web.
 *
 * Nothing happens here. expo-auth-session reads the result before this screen
 * renders — on the web through `WebBrowser.maybeCompleteAuthSession()`, which
 * SessionProvider calls on import and which closes the popup. This route
 * exists so the callback URL is a real address: without it the web popup
 * would land on "not found", and a stray deep link on a phone would too.
 */
export default function Auth0Callback() {
  return <Redirect href="/" />;
}
