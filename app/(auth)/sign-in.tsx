import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { errorMessage } from '@/lib/api';
import { AUTH0_AVAILABLE, AUTH0_REDIRECT_URI } from '@/lib/auth0';
import { colors } from '@/lib/theme';
import { Wordmark } from '@/components/AppMark';
import { LightPole } from '@/components/LightPole';
import { Button, Caption, ErrorNote } from '@/components/ui';
import { DEMO_ACCOUNT_AVAILABLE, useSession } from '@/providers/SessionProvider';

/**
 * Where to go after signing in, from `?next=`. Only paths inside the app, so a
 * crafted link can't send anyone off-site.
 */
function safeNext(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
}

/** Welcome (design kit v2, 2.1): logo, the lit pole, one instruction, sign in. */
export default function SignIn() {
  const { session, signInWithAuth0, signInWithDemoAccount } = useSession();
  const router = useRouter();
  // "Sign in to claim" on a table sends ?next=/table/<id>: go back there, not home.
  const next = safeNext(useLocalSearchParams<{ next?: string }>().next);
  const [busy, setBusy] = useState<null | 'auth0' | 'signup' | 'demo'>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Back to the screen that sent us here (popping sign-in off the stack rather
  // than stacking a second copy of it); home when there wasn't one.
  useEffect(() => {
    if (session && next) router.dismissTo(next as Href);
  }, [session, next, router]);

  if (session) return next ? null : <Redirect href="/" />;

  async function run(kind: 'auth0' | 'signup' | 'demo', fn: () => Promise<unknown>) {
    setBusy(kind);
    setError(null);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  // Closing the Auth0 window reaches us as a plain dismissal. Usually that's
  // just someone changing their mind, so say so kindly. A rejected callback
  // address looks the same from here; the dev-only line at the bottom shows the
  // address to register in Auth0 for that case.
  async function startAuth0(signUp = false) {
    const outcome = await signInWithAuth0({ signUp });
    if (outcome === 'dismissed') setNote(signUp ? 'Sign-up was closed. Tap Create an account to try again.' : 'Sign-in was closed. Tap a button to try again.');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      {/* Scrolls on short phones, so messages push the buttons down instead of hiding behind them. */}
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 20 }}>
        <Wordmark size={20} />
        {/* The pole shrinks to md so it never collides with the headline on shorter phones. */}
        <View style={{ flex: 1, minHeight: 200, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 }}>
          <LightPole light="green" size="md" />
        </View>
        <Text
          accessibilityRole="header"
          style={{ fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: -0.7, color: colors.espresso }}
        >
          When the light&apos;s green, say hi.
        </Text>
        <Text style={{ fontSize: 17, lineHeight: 23, color: colors.mocha, marginTop: 8 }}>
          FirstPlace tables show who&apos;s open to talk. No profiles to scroll, just people nearby.
        </Text>
        {error ? (
          <View style={{ marginTop: 16 }}>
            <ErrorNote error={error} />
          </View>
        ) : null}
        {note ? (
          <View style={{ marginTop: 16 }} accessibilityLiveRegion="polite">
            <Caption>{note}</Caption>
          </View>
        ) : null}
      </ScrollView>

      <View style={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24, gap: 8 }}>
        {AUTH0_AVAILABLE ? (
          <Button
            label="Create an account"
            accessibilityHint="Opens a secure sign-up page. You can use Google or your email."
            busy={busy === 'signup'}
            onPress={() => run('signup', () => startAuth0(true))}
          />
        ) : null}
        {AUTH0_AVAILABLE ? (
          <Button
            label="I already have an account"
            variant="secondary"
            accessibilityHint="Opens a secure sign-in page."
            busy={busy === 'auth0'}
            onPress={() => run('auth0', () => startAuth0())}
          />
        ) : null}
        {DEMO_ACCOUNT_AVAILABLE ? (
          <Button
            label="Try the demo account"
            variant={AUTH0_AVAILABLE ? 'quiet' : 'primary'}
            busy={busy === 'demo'}
            onPress={() => run('demo', signInWithDemoAccount)}
          />
        ) : null}
        <Caption className="text-center">For adults 18 and over in Calgary.</Caption>
        {__DEV__ && AUTH0_AVAILABLE ? (
          <Caption className="text-center">
            <Text selectable>Dev: Auth0 callback {AUTH0_REDIRECT_URI}</Text>
          </Caption>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
