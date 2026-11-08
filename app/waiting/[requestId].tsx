import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';

import { fetchRequestStatus } from '@/lib/conversations';
import { useAsync } from '@/hooks/useAsync';
import { useVenueTablesRealtime } from '@/hooks/useRealtime';
import { Body, Button, Card, Loading, Screen, SectionTitle, Title } from '@/components/ui';

/**
 * After "Request to chat". The answer is one of: pending, accepted, or "not
 * available right now" — which covers a decline AND no answer, so a no is
 * never obvious.
 */
export default function Waiting() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const router = useRouter();
  const status = useAsync(() => fetchRequestStatus(requestId), [requestId]);
  const reload = useCallback(() => void status.reload(), [status]);
  useVenueTablesRealtime(null, reload, status.data?.status === 'pending' || !status.data);

  useEffect(() => {
    if (status.data?.status === 'accepted') router.replace('/conversation');
  }, [status.data, router]);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Request sent' }} />
      {status.data?.status === 'not_available' ? (
        <>
          <Title>Not available right now</Title>
          <Card className="gap-2">
            <Body>That happens, and it isn&apos;t about you. Another table might be open to talk.</Body>
          </Card>
          <Button label="Back to the map" onPress={() => router.replace('/')} />
        </>
      ) : (
        <>
          <Title>Request sent</Title>
          <Card className="gap-3">
            <SectionTitle>Waiting for a yes</SectionTitle>
            <Body>Stay where you are. If they accept, you&apos;ll be told to come over.</Body>
            <Loading label="Usually under 2 minutes" />
          </Card>
        </>
      )}
    </Screen>
  );
}
