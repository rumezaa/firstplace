import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';

import { leaveNow } from '@/lib/conversations';
import { MIN_TAP_TARGET, colors } from '@/lib/theme';
import { useSession } from '@/providers/SessionProvider';
import { Button, Caption, Screen, SectionTitle, Title } from '@/components/ui';

/**
 * Help, in the PRD's order: 911, Leave now, get staff, talk to someone.
 * Everything here is static, so it works signed out and with no network
 * (only "Leave now" needs the server, and it says so if it can't reach it).
 * Confirm all numbers before launch.
 */
const LINES = [
  { name: 'Suicide Crisis Helpline', detail: 'Call or text, any time', number: '988', tel: '988' },
  { name: 'Distress Centre Calgary', detail: 'Any time', number: '403-266-4357', tel: '4032664357' },
  { name: 'Health Link', detail: 'Advice from a nurse', number: '811', tel: '811' },
  { name: '211 Alberta', detail: 'Community and social services', number: '211', tel: '211' },
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
      <Stack.Screen options={{ title: '', presentation: 'modal' }} />
      <Title>Help</Title>

      <Pressable
        onPress={() => call('911')}
        accessibilityRole="button"
        accessibilityLabel="Call 911, for danger or an emergency"
        style={{ height: 64, backgroundColor: colors.stop, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18 }}
      >
        <Ionicons name="call" size={26} color="#FFFFFF" />
        <View>
          <Text style={{ color: '#fff', fontSize: 19, fontWeight: '600' }}>Call 911</Text>
          <Text style={{ color: '#fff', fontSize: 14, opacity: 0.92 }}>Danger or an emergency</Text>
        </View>
      </Pressable>

      <View style={{ backgroundColor: colors.surface, borderRadius: 12, overflow: 'hidden' }}>
        <HelpRow
          icon="exit-outline"
          danger
          label={left === 'done' ? "You've left" : 'Leave now'}
          detail={
            left === 'done'
              ? 'Your light is off. Nobody was told why.'
              : left === 'offline'
                ? "Couldn't reach FirstPlace. Just walk away; your table frees itself."
                : session
                  ? 'Check out and turn your light off'
                  : 'Not signed in, so nothing to check out of'
          }
          disabled={!session || left === 'busy' || left === 'done'}
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
        <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 52 }} />
        <HelpRow icon="hand-left-outline" label="Get staff to help" detail="A message to show at the counter" onPress={() => setStaffCard(true)} />
      </View>

      <SectionTitle className="mt-4 text-[15px]">Talk to someone</SectionTitle>
      <View style={{ backgroundColor: colors.surface, borderRadius: 12, overflow: 'hidden' }}>
        {LINES.map((l, i) => (
          <View key={l.tel}>
            {i > 0 ? <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 16 }} /> : null}
            <Pressable
              onPress={() => call(l.tel)}
              accessibilityRole="button"
              accessibilityLabel={`Call ${l.name}, ${l.number}. ${l.detail}`}
              style={{ flexDirection: 'row', alignItems: 'center', minHeight: MIN_TAP_TARGET + 8, paddingHorizontal: 16, gap: 12 }}
            >
              <View style={{ flex: 1, paddingVertical: 10, gap: 2 }}>
                <Text style={{ fontSize: 17, color: colors.espresso }}>{l.name}</Text>
                <Text style={{ fontSize: 13, color: colors.mocha }}>{l.detail}</Text>
              </View>
              <Text selectable style={{ fontSize: 17, color: colors.clay }}>{l.number}</Text>
            </Pressable>
          </View>
        ))}
      </View>
      {Platform.OS === 'web' ? <Caption>On a laptop, dial these from your phone.</Caption> : null}
      <Button className="mt-4" label="Close" variant="quiet" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </Screen>
  );
}

function HelpRow({
  icon,
  label,
  detail,
  danger,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${detail}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingHorizontal: 16 }}
    >
      <Ionicons name={icon} size={22} color={danger ? colors.brick : colors.mocha} />
      <View style={{ flex: 1, paddingVertical: 12, gap: 2 }}>
        <Text style={{ fontSize: 17, color: colors.espresso }}>{label}</Text>
        <Text style={{ fontSize: 13, color: colors.mocha }}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.mocha} />
    </Pressable>
  );
}
