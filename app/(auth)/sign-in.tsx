import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { errorMessage } from '@/lib/api';
import { colors } from '@/lib/theme';
import { Wordmark } from '@/components/AppMark';
import { LightPole } from '@/components/LightPole';
import { Button, Caption, ErrorNote } from '@/components/ui';
import {
  AUTH0_AVAILABLE,
  AUTH0_REDIRECT_URI,
  DEMO_ACCOUNT_AVAILABLE,
  useSession,
} from '@/providers/SessionProvider';

/** Welcome (design kit v2, 2.1): logo, the lit pole, one instruction, sign in. */
export default function SignIn() {
  const { session, signInWithAuth0, signInWithDemoAccount } = useSession();
  const [busy, setBusy] = useState<null | 'auth0' | 'demo'>(null);
  const [error, setError] = useState<string | null>(null);

  if (session) return <Redirect href="/" />;

  async function run(kind: 'auth0' | 'demo', fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 20 }}>
        <Wordmark size={20} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LightPole light="green" size="lg" />
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
      </View>

      <View style={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24, gap: 8 }}>
        {AUTH0_AVAILABLE ? (
          <Button
            label="Get started"
            accessibilityHint="Opens a secure sign-in page. You can use Google or your email."
            busy={busy === 'auth0'}
            onPress={() => run('auth0', signInWithAuth0)}
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
          <Caption className="text-center">Dev: Auth0 callback {AUTH0_REDIRECT_URI}</Caption>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
