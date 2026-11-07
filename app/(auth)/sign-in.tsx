import { Redirect } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { APP_NAME, APP_PITCH, APP_TAGLINE } from '@/lib/branding';
import { errorMessage } from '@/lib/supabase';
import {
  Body,
  Button,
  Caption,
  Card,
  ErrorNote,
  Screen,
  SectionTitle,
  Title,
} from '@/components/ui';
import { DEMO_ACCOUNT_AVAILABLE, useSession } from '@/providers/SessionProvider';

export default function SignIn() {
  const { session, pendingEmail, sendMagicLink, verifyEmailCode, signInWithDemoAccount } =
    useSession();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<null | 'link' | 'code' | 'demo'>(null);
  const [error, setError] = useState<string | null>(null);

  if (session) return <Redirect href="/" />;

  async function run(kind: 'link' | 'code' | 'demo', fn: () => Promise<void>) {
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

        <View className="gap-2">
          <Caption>Email</Caption>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#A1897A"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            accessibilityLabel="Email address"
            className="bg-cream border-border-warm text-espresso rounded-tile border px-4 py-3 text-base"
            style={{ minHeight: 48 }}
          />
        </View>

        <Button
          label={pendingEmail ? 'Send another link' : 'Email me a link'}
          busy={busy === 'link'}
          disabled={email.trim().length < 3}
          onPress={() => run('link', () => sendMagicLink(email))}
        />

        {pendingEmail ? (
          <View className="border-border-warm gap-3 border-t pt-4">
            <Caption>
              Sent to {pendingEmail}. Tap the link in the email, or type the 6-digit code from it
              here.
            </Caption>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor="#A1897A"
              keyboardType="number-pad"
              maxLength={6}
              accessibilityLabel="Six digit code from your email"
              className="bg-cream border-border-warm text-espresso rounded-tile border px-4 py-3 text-center text-2xl tracking-[8px]"
              style={{ minHeight: 48 }}
            />
            <Button
              label="Confirm code"
              variant="secondary"
              busy={busy === 'code'}
              disabled={code.trim().length < 6}
              onPress={() => run('code', () => verifyEmailCode(code))}
            />
          </View>
        ) : null}
      </Card>

      {DEMO_ACCOUNT_AVAILABLE ? (
        <Card accent="amber" className="gap-3">
          <SectionTitle>Demo account</SectionTitle>
          <Caption>
            Signs in as the seeded account, so a demo never waits on an email. Remove
            EXPO_PUBLIC_DEMO_EMAIL from .env to hide this.
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
