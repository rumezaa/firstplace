import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/Text';
import QRCode from 'react-native-qrcode-svg';

import { LIGHT_INFO, boxLink, fetchTableView } from '@/lib/conversations';
import { colors } from '@/lib/theme';
import { useAsync } from '@/hooks/useAsync';
import { useVenueTablesRealtime } from '@/hooks/useRealtime';
import { LightPole } from '@/components/LightPole';

/**
 * A FirstPlace box, on a screen: the table's QR code (what the real box's
 * NFC tag and printed code hold) and its live light. Open it on a laptop or
 * tablet at the table: phones scan it exactly like the hardware box, and it
 * stands in for the box if the hardware isn't there.
 */
export default function VirtualBox() {
  const router = useRouter();
  const { tableId } = useLocalSearchParams<{ tableId: string }>();
  const view = useAsync(() => fetchTableView(tableId), [tableId]);
  const reload = useCallback(() => void view.reload(), [view]);
  useVenueTablesRealtime(tableId, reload);

  const light = view.error ? 'off' : view.data?.light ?? 'off';
  const info = LIGHT_INFO[light];

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 24 }}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* A full-screen display, but never a dead end. */}
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        accessibilityRole="button"
        accessibilityLabel="Close the box screen"
        hitSlop={12}
        style={{ position: 'absolute', top: 48, left: 20 }}
      >
        <Text style={{ fontSize: 17, color: colors.clay }}>Close</Text>
      </Pressable>
      <Text style={{ fontSize: 28, fontWeight: '800', color: colors.espresso }}>
        {view.data ? `${view.data.table.label} · ${view.data.table.venue_name}` : 'FirstPlace box'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 40, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <LightPole light={light} size="lg" />
        <View style={{ alignItems: 'center', gap: 12 }}>
          <View style={{ backgroundColor: '#fff', padding: 16, borderRadius: 16 }}>
            <QRCode value={boxLink(tableId)} size={220} color={colors.espresso} backgroundColor="#fff" />
          </View>
          <Text style={{ color: colors.mocha, fontSize: 15 }}>Scan in the FirstPlace app to claim or join</Text>
        </View>
      </View>
      <Text style={{ fontSize: 22, fontWeight: '700', color: colors.espresso }} accessibilityLiveRegion="polite">
        {view.error ? 'No signal — check the connection' : `${info.label}: ${info.meaning}`}
      </Text>
      <Text style={{ color: colors.mocha, textAlign: 'center', maxWidth: 520 }}>
        Conversation zone. Anyone can sit here. Light off: just a table. Green: say hi. Yellow: request
        through the FirstPlace app. Red: please don&apos;t disturb.
      </Text>
    </View>
  );
}
