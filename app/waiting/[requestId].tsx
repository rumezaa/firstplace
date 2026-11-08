import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';

import { fetchRequestStatus } from '@/lib/conversations';
import { useAsync } from '@/hooks/useAsync';
import { useVenueTablesRealtime } from '@/hooks/useRealtime';
import { Body, Button, Caption, Card, ErrorNote, Loading, Screen, SectionTitle, Title } from '@/components/ui';

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

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

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
          {/* Polling keeps retrying, so a dropped connection recovers on its own. */}
          {status.error && !status.data ? <ErrorNote error={status.error} onRetry={reload} /> : null}
          <Card className="gap-3">
            <SectionTitle>Waiting for a yes</SectionTitle>
            <Body>Stay where you are. If they accept, you&apos;ll be told to come over.</Body>
            <Loading label="Usually under 2 minutes" />
          </Card>
          <Button label="Stop waiting" variant="quiet" onPress={leave} />
          <Caption className="text-center">
            Your request expires on its own if they don&apos;t answer.
          </Caption>
        </>
      )}
    </Screen>
  );
}
