import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { boxLink, fetchTableView, LIGHT_INFO } from '@/lib/conversations';
import { fetchTables, fetchVenue } from '@/lib/venues';
import { colors } from '@/lib/theme';
import { useAsync } from '@/hooks/useAsync';
import { useVenueTablesRealtime } from '@/hooks/useRealtime';
import { LightPole } from '@/components/LightPole';
import { Body, Button, Caption, Card, EmptyState, ErrorNote, Loading, Screen, SectionTitle, Title } from '@/components/ui';

/** Public box display: the code identifies a table, never a counter session. */
export default function KioskScreen() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>();
  const router = useRouter();
  const venue = useAsync(() => fetchVenue(venueId), [venueId]);
  const tables = useAsync(() => fetchTables(venueId), [venueId]);
  useVenueTablesRealtime(venueId, () => void tables.reload());
  const rows = (tables.data ?? []).filter(t => t.is_chat_table);
  return <Screen>
    <Title>{venue.data?.name ?? 'Conversation tables'}</Title>
    <Body>Scan a table’s code in the FirstPlace app to claim it or join a conversation.</Body>
    {venue.error ? <ErrorNote error={venue.error} onRetry={() => void venue.reload()} /> : null}
    {!venue.loading && !venue.error && !venue.data ? <Body>This place is not available.</Body> : null}
    {tables.error ? <ErrorNote error={tables.error} onRetry={() => void tables.reload()} /> : null}
    {tables.loading && !tables.data ? <Loading label="Finding conversation tables" /> : null}
    {!tables.loading && !tables.error && rows.length === 0 ? <EmptyState title="No conversation tables yet" body="Ask staff where you can sit. No code is needed for an ordinary table." /> : null}
    {rows.map(table => <BoxCard key={table.id} id={table.id} label={table.label} />)}
    <Button label="Back to venue" variant="quiet" onPress={() => router.replace(`/venue/${venueId}`)} />
  </Screen>;
}

function BoxCard({ id, label }: { id: string; label: string }) {
  const state = useAsync(() => fetchTableView(id), [id]);
  useVenueTablesRealtime(null, () => void state.reload());
  const light = state.error ? 'off' : state.data?.light ?? 'off';
  return <Card className="gap-4">
    <SectionTitle>{label}</SectionTitle>
    <View className="flex-row flex-wrap items-center justify-center gap-6">
      <LightPole light={light} size="lg" />
      <QRCode value={boxLink(id)} size={180} color={colors.espresso} backgroundColor={colors.surface} />
    </View>
    <Body>{state.error ? 'No signal — check the connection' : `${LIGHT_INFO[light].label}: ${LIGHT_INFO[light].meaning}`}</Body>
    {state.loading && !state.data ? <Loading label="Checking the light" /> : null}
    {state.error ? <ErrorNote error={state.error} onRetry={() => void state.reload()} /> : null}
    <Caption>Green: say hi. Yellow: ask in the app. Red: please do not disturb. Off: just a table.</Caption>
  </Card>;
}
