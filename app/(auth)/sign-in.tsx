import { Redirect } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { APP_NAME, APP_PITCH, APP_TAGLINE } from '@/lib/branding';
import { errorMessage } from '@/lib/api';
import { Body, Button, Caption, Card, ErrorNote, Screen, SectionTitle, Title } from '@/components/ui';
import {
  AUTH0_AVAILABLE,
  AUTH0_REDIRECT_URI,
  DEMO_ACCOUNT_AVAILABLE,
  useSession,
} from '@/providers/SessionProvider';

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
    <Screen>
      <View className="gap-2 pb-2 pt-10">
        <Title>{APP_NAME}</Title>
        <Body>{APP_TAGLINE}</Body>
      </View>

      <Card className="gap-4">
        <SectionTitle>Sign in</SectionTitle>
        <Body>{APP_PITCH}</Body>

        {AUTH0_AVAILABLE ? (
          <Button
            label="Continue"
            accessibilityHint="Opens a secure sign-in page. You can use Google or your email."
            busy={busy === 'auth0'}
            onPress={() => run('auth0', signInWithAuth0)}
          />
        ) : (
          <Caption>
            Secure sign-in (Auth0) isn&apos;t set up yet. Add EXPO_PUBLIC_AUTH0_DOMAIN,
            EXPO_PUBLIC_AUTH0_CLIENT_ID and EXPO_PUBLIC_AUTH0_AUDIENCE to .env.
          </Caption>
        )}

        {__DEV__ && AUTH0_AVAILABLE ? (
          <Caption>Auth0 callback URL for this device: {AUTH0_REDIRECT_URI}</Caption>
        ) : null}
      </Card>

      {DEMO_ACCOUNT_AVAILABLE ? (
        <Card accent="amber" className="gap-3">
          <SectionTitle>Demo account</SectionTitle>
          <Caption>
            Signs in as the seeded demo user, so a live demo never depends on a sign-in page.
            Remove EXPO_PUBLIC_DEMO_EMAIL from .env to hide this.
          </Caption>
          <Button
            label="Continue as demo user"
            variant="quiet"
            busy={busy === 'demo'}
            onPress={() => run('demo', signInWithDemoAccount)}
          />
        </Card>
      ) : null}

      {error ? <ErrorNote error={error} /> : null}

      <Caption className="px-2 text-center">
        We never show other people where you are. Check-ins are only ever counted, never named.
      </Caption>
    </Screen>
  );
}
