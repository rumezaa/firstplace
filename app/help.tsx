import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';

import { leaveNow } from '@/lib/conversations';
import { MIN_TAP_TARGET, colors } from '@/lib/theme';
import { useSession } from '@/providers/SessionProvider';
import { Body, Button, Caption, Card, Screen, SectionTitle, Title } from '@/components/ui';

/**
 * Help, in the PRD's order: 911, Leave now, get staff, talk to someone.
 * Everything here is static, so it works signed out and with no network
 * (only "Leave now" needs the server, and it says so if it can't reach it).
 * Confirm all numbers before launch.
 */
const LINES = [
  { name: 'Suicide Crisis Helpline', detail: 'Call or text 988, any time', tel: '988' },
  { name: 'Distress Centre Calgary', detail: '403-266-4357 (HELP), 24/7', tel: '4032664357' },
  { name: 'Health Link', detail: '811, health advice from a nurse', tel: '811' },
  { name: '211 Alberta', detail: 'Community and social services', tel: '211' },
];

function call(tel: string) {
  void Linking.openURL(`tel:${tel}`).catch(() => {});
}

export default function Help() {
  const router = useRouter();
  const { session } = useSession();
  const [left, setLeft] = useState<'idle' | 'busy' | 'done' | 'offline'>('idle');
  const [staffCard, setStaffCard] = useState(false);

  if (staffCard) {
    // Full-screen message to show at the counter, for anyone who finds speaking up hard.
    return (
      <Pressable
        onPress={() => setStaffCard(false)}
        accessibilityRole="button"
        accessibilityLabel="I need some help, please. Tap to close."
        style={{ flex: 1, backgroundColor: colors.espresso, alignItems: 'center', justifyContent: 'center', padding: 32 }}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={{ color: '#fff', fontSize: 44, fontWeight: '800', textAlign: 'center', lineHeight: 52 }}>
          I need some help, please.
        </Text>
        <Text style={{ color: '#EADFD3', fontSize: 18, marginTop: 24, textAlign: 'center' }}>
          Show this to a staff member. Tap anywhere to close.
        </Text>
      </Pressable>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Help', presentation: 'modal' }} />
      <Title>Help</Title>

      <Pressable
        onPress={() => call('911')}
        accessibilityRole="button"
        accessibilityLabel="Call 911, for danger or an emergency"
        style={{ minHeight: MIN_TAP_TARGET + 16, backgroundColor: colors.brick, borderRadius: 16, justifyContent: 'center', padding: 16 }}
      >
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>Call 911</Text>
        <Text style={{ color: '#fff', fontSize: 14 }}>For danger or an emergency</Text>
      </Pressable>

      <Card className="gap-3">
        <SectionTitle>Leave now</SectionTitle>
        <Body>Checks you out, ends any conversation and turns your light off. Nobody is told why.</Body>
        {left === 'done' ? (
          <Body>Done. You&apos;re checked out.</Body>
        ) : (
          <Button
            label="Leave now"
            variant="danger"
            busy={left === 'busy'}
            disabled={!session}
            onPress={async () => {
              setLeft('busy');
              try {
                await leaveNow();
                setLeft('done');
              } catch {
                setLeft('offline');
              }
            }}
          />
        )}
        {left === 'offline' ? (
          <Caption>Couldn&apos;t reach FirstPlace. Just walk away; your table frees itself after a while.</Caption>
        ) : null}
        {!session ? <Caption>You&apos;re not signed in, so there&apos;s nothing to check out of.</Caption> : null}
      </Card>

      <Card className="gap-3">
        <SectionTitle>Get staff to help</SectionTitle>
        <Body>A big message to show at the counter, if speaking up is hard right now.</Body>
        <Button label="Show the staff message" variant="secondary" onPress={() => setStaffCard(true)} />
      </Card>

      <Card className="gap-3">
        <SectionTitle>Talk to someone</SectionTitle>
        {LINES.map((l) => (
          <Pressable
            key={l.tel}
            onPress={() => call(l.tel)}
            accessibilityRole="button"
            accessibilityLabel={`Call ${l.name}. ${l.detail}`}
            style={{ minHeight: MIN_TAP_TARGET }}
            className="border-border-warm justify-center rounded-tile border px-4 py-2"
          >
            <Text className="text-espresso text-base font-semibold">{l.name}</Text>
            <Text className="text-mocha text-sm">{l.detail}</Text>
          </Pressable>
        ))}
        {Platform.OS === 'web' ? <Caption>On a laptop, dial these from your phone.</Caption> : null}
      </Card>

      <View className="pb-4">
        <Button label="Close" variant="quiet" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </View>
    </Screen>
  );
}
