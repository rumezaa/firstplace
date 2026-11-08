import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Text } from '@/components/Text';

import { cancelRequest, fetchRequestStatus } from '@/lib/conversations';
import { colors } from '@/lib/theme';
import { fetchVenueLive, fetchVenues } from '@/lib/venues';
import { useAsync } from '@/hooks/useAsync';
import { useVenueTablesRealtime } from '@/hooks/useRealtime';
import { Body, Button, Screen, Title } from '@/components/ui';

/**
 * After "Send request" (design kit v2, 4.6 / 4.7). Pending → a small spinner
 * and plain text. "Not available right now" covers a decline AND no answer,
 * so a no is never obvious, and it always offers somewhere else to go.
 */
export default function Waiting() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const status = useAsync(() => fetchRequestStatus(requestId), [requestId]);
  const reload = useCallback(() => void status.reload(), [status]);
  const pending = status.data?.status === 'pending' || !status.data;
  useVenueTablesRealtime(null, reload, pending);

  useEffect(() => {
    if (status.data?.status === 'accepted') router.replace('/conversation');
  }, [status.data, router]);

  if (status.data?.status === 'not_available') {
    return (
      <Screen>
        <Stack.Screen options={{ title: '' }} />
        <Title>Not available right now</Title>
        <Body>That&apos;s normal, and it isn&apos;t about you. These places have people open to talk:</Body>
        <OpenNearby onPick={(venueId) => router.replace(`/venue/${venueId}`)} />
        <Button label="Back to Explore" variant="quiet" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 }}>
        <ActivityIndicator color={colors.mocha} />
        <Text style={{ fontSize: 15, color: colors.mocha }}>Waiting for an answer</Text>
      </View>
      <Title>Request sent</Title>
      <Body>Stay where you are. If they say yes, you&apos;ll go straight to the conversation.</Body>
      <Button
        className="mt-4"
        label="Take back request"
        variant="quiet"
        busy={cancelling}
        onPress={async () => {
          setCancelling(true);
          // Silent for the other person, same as a request that runs out.
          await cancelRequest(requestId).catch(() => undefined);
          if (router.canGoBack()) router.back();
          else router.replace('/');
        }}
      />
    </Screen>
  );
}

/** Venues with at least one person open to talk, most first. */
function OpenNearby({ onPick }: { onPick: (venueId: string) => void }) {
  const venues = useAsync(fetchVenues, []);
  const live = useAsync(fetchVenueLive, []);
  const open = (venues.data ?? [])
    .map((v) => ({ v, n: live.data?.[v.id]?.people_open_to_chat ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 4);

  if (open.length === 0) {
    return <Body>Nobody else is open right now. Try again a little later.</Body>;
  }

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 12, overflow: 'hidden', marginTop: 8 }}>
      {open.map(({ v, n }, i) => (
        <View key={v.id}>
          {i > 0 ? <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 16 }} /> : null}
          <Pressable
            onPress={() => onPick(v.id)}
            accessibilityRole="button"
            accessibilityLabel={`${v.name}, ${n} open to talk`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 16 }}
          >
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.go }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 17, color: colors.espresso }}>{v.name}</Text>
              <Text style={{ fontSize: 13, color: colors.mocha }}>
                {n} {n === 1 ? 'person' : 'people'} open to talk
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.mocha} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}
