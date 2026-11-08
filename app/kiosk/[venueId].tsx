import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { kioskQrPayload } from '@/lib/checkins';
import { KIOSK_ROTATE_SECONDS, rotateKioskCode, type KioskCode } from '@/lib/kiosk';
import { errorMessage } from '@/lib/api';
import { MIN_TAP_TARGET, colors } from '@/lib/theme';
import { fetchTables, fetchVenue, setTableStatus } from '@/lib/venues';
import { useAsync } from '@/hooks/useAsync';
import { useVenueTablesRealtime } from '@/hooks/useRealtime';
import { TableGrid, TableGridLegend } from '@/components/TableGrid';
import { Body, Caption, ErrorNote, Loading, SectionTitle } from '@/components/ui';

/**
 * Kiosk mode: what runs on the tablet by the till.
 *
 * Two jobs. Left, a QR code that regenerates every KIOSK_ROTATE_SECONDS so a
 * photo of it is worthless a moment later. Right, a table grid staff tap to
 * mark tables open or taken.
 */
export default function KioskScreen() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>();
  const id = String(venueId);
  const router = useRouter();

  const venue = useAsync(() => fetchVenue(id), [id]);
  const tables = useAsync(() => fetchTables(id), [id]);

  const [code, setCode] = useState<KioskCode | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(KIOSK_ROTATE_SECONDS);
  const [error, setError] = useState<string | null>(null);

  // Landscape while this screen is mounted, back to normal on the way out.
  // (Expo Router can also do this declaratively with
  // `options={{ orientation: 'landscape' }}` on the Stack.Screen; doing it here
  // keeps the behaviour next to the screen that wants it.)
  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => {
      void ScreenOrientation.unlockAsync();
    };
  }, []);

  const rotate = useCallback(async () => {
    try {
      setCode(await rotateKioskCode(id));
      setSecondsLeft(KIOSK_ROTATE_SECONDS);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  // Mint the first code, then keep rotating.
  useEffect(() => {
    void rotate();
    const timer = setInterval(() => void rotate(), KIOSK_ROTATE_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [rotate]);

  // The countdown ring under the QR, so staff can see it is live.
  useEffect(() => {
    const tick = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(tick);
  }, []);

  const reloadTables = useCallback(() => {
    void tables.reload();
  }, [tables]);
  useVenueTablesRealtime(id, reloadTables);

  async function toggleTable(tableId: string, current: 'open' | 'taken') {
    try {
      await setTableStatus(tableId, current === 'open' ? 'taken' : 'open');
      reloadTables();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const rows = tables.data ?? [];

  return (
    <SafeAreaView className="bg-cream flex-1">
      <View className="flex-1 flex-row gap-6 p-6">
        {/* ------------------------------------------------ QR ------------- */}
        <View className="bg-surface border-border-warm rounded-card flex-1 items-center justify-center gap-4 border p-6">
          <SectionTitle>Scan to check in</SectionTitle>

          {code ? (
            <>
              <View className="bg-surface rounded-card p-4">
                <QRCode
                  value={kioskQrPayload(id, code.code)}
                  size={220}
                  color={colors.espresso}
                  backgroundColor={colors.surface}
                />
              </View>
              <Text
                className="text-espresso text-3xl font-bold tracking-[6px]"
                accessibilityLabel={`Kiosk code ${code.code.split('').join(' ')}`}
              >
                {code.code}
              </Text>
              <Caption>
                New code in {secondsLeft}s · type it in if the camera will not play along
              </Caption>
            </>
          ) : error ? (
            <ErrorNote error={error} onRetry={() => void rotate()} />
          ) : (
            <Loading label="Minting a code" />
          )}
        </View>

        {/* --------------------------------------------- table grid -------- */}
        <View className="bg-surface border-border-warm rounded-card flex-1 gap-3 border p-6">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <SectionTitle>{venue.data?.name ?? 'Tables'}</SectionTitle>
              <Caption>Tap a table to flip it between open and taken.</Caption>
            </View>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Leave kiosk mode"
              style={{ minHeight: MIN_TAP_TARGET, minWidth: MIN_TAP_TARGET }}
              className="bg-sunk rounded-chip items-center justify-center px-4"
            >
              <Text className="text-espresso text-sm font-semibold">Exit</Text>
            </Pressable>
          </View>

          <TableGridLegend hasChatTable={rows.some((t) => t.is_chat_table)} />

          {tables.loading && rows.length === 0 ? (
            <Loading />
          ) : (
            <TableGrid
              tables={rows}
              allowTakenPress
              onSelect={(table) => void toggleTable(table.id, table.status)}
            />
          )}

          <Body className="mt-auto">
            Guests scan the code, pick their table, and it turns itself taken. Tap here when someone
            sits down without the app.
          </Body>
        </View>
      </View>
    </SafeAreaView>
  );
}
