import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { RefreshControl, View } from 'react-native';

import { AVAILABILITY, tablesSummary } from '@/lib/availability';
import { hourLabel, people } from '@/lib/format';
import {
  fetchBusyHours,
  fetchCrowdTags,
  fetchTables,
  fetchVenue,
  fetchVenueLiveOne,
} from '@/lib/venues';
import { useAsync } from '@/hooks/useAsync';
import { useVenueTablesRealtime } from '@/hooks/useRealtime';
import { ChatTableNote, TableGrid, TableGridLegend } from '@/components/TableGrid';
import {
  Badge,
  Body,
  Button,
  Caption,
  Card,
  ErrorNote,
  Loading,
  ProgressBar,
  Screen,
  SectionTitle,
  Title,
} from '@/components/ui';

export default function VenueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const venueId = String(id);
  const router = useRouter();

  const venue = useAsync(() => fetchVenue(venueId), [venueId]);
  const live = useAsync(() => fetchVenueLiveOne(venueId), [venueId]);
  const tables = useAsync(() => fetchTables(venueId), [venueId]);
  const busy = useAsync(() => fetchBusyHours(venueId), [venueId]);
  const crowd = useAsync(() => fetchCrowdTags(venueId), [venueId]);

  const refresh = useCallback(() => {
    void live.reload();
    void tables.reload();
  }, [live, tables]);
  useVenueTablesRealtime(venueId, refresh);

  if (venue.loading && !venue.data) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  if (venue.error) {
    return (
      <Screen>
        <ErrorNote error={venue.error} onRetry={() => void venue.reload()} />
      </Screen>
    );
  }

  const v = venue.data;
  if (!v) {
    return (
      <Screen>
        <ErrorNote error="That place is not in the list." />
      </Screen>
    );
  }

  const l = live.data;
  const presentation = AVAILABILITY[l?.availability ?? 'open'];
  const openToChat = l?.people_open_to_chat ?? 0;
  const rows = tables.data ?? [];
  const hours = busy.data ?? [];
  const peakVisits = Math.max(1, ...hours.map((h) => h.visits));

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={live.loading && Boolean(l)} onRefresh={refresh} />
      }
    >
      <View className="gap-1">
        <Title>{v.name}</Title>
        {v.address ? <Caption>{v.address}</Caption> : null}
      </View>

      <View className="flex-row flex-wrap items-center gap-2">
        <Badge
          label={presentation.label}
          tone={
            l?.availability === 'full' ? 'full' : l?.availability === 'filling_up' ? 'filling' : 'open'
          }
          accessibilityLabel={presentation.a11y}
        />
        {l?.chat_table_active ? <Badge label="Chat table active" tone="chat" /> : null}
        {v.is_quiet ? <Badge label="Quiet" /> : null}
        {v.good_for_groups ? <Badge label="Good for groups" /> : null}
        <Badge label={v.type === 'study' ? 'Study space' : v.type === 'cafe' ? 'Cafe' : 'Social space'} />
      </View>

      {v.vibe_summary ? (
        <Card className="gap-2">
          <SectionTitle>The vibe</SectionTitle>
          <Body>{v.vibe_summary}</Body>
        </Card>
      ) : null}

      {/* The headline social signal. Deliberately a count and nothing more --
          never a list of who, never a location within the room. */}
      <Card accent={openToChat > 0 ? 'berry' : undefined} className="gap-2">
        <SectionTitle>Open to chat right now</SectionTitle>
        <Body>
          {openToChat === 0
            ? 'Nobody has flagged themselves as open to chat yet. You could be the first.'
            : `${people(openToChat)} here said they are happy to be talked to.`}
        </Body>
        <Caption>We only ever show the number, never who.</Caption>
      </Card>

      {v.insider_info ? (
        <Card accent="clay" className="gap-2">
          <SectionTitle>Insider info</SectionTitle>
          <Body>{v.insider_info}</Body>
        </Card>
      ) : null}

      {v.popular_drinks.length > 0 ? (
        <Card className="gap-2">
          <SectionTitle>What people order</SectionTitle>
          <Body>{v.popular_drinks.join(' · ')}</Body>
        </Card>
      ) : null}

      {/* Crowd type, aggregated. The view suppresses any tag held by fewer than
          3 recent visitors, so a tag here never describes one person. */}
      {crowd.data && crowd.data.length > 0 ? (
        <Card className="gap-2">
          <SectionTitle>Who tends to be here</SectionTitle>
          <View className="flex-row flex-wrap gap-2">
            {crowd.data.map((tag) => (
              <Badge key={tag.tag} label={`${tag.tag} · ${tag.people}`} />
            ))}
          </View>
          <Caption>
            Grouped from regulars&apos; own tags. Tags shared by fewer than three people are not shown.
          </Caption>
        </Card>
      ) : null}

      <Card className="gap-3">
        <View className="flex-row items-baseline justify-between">
          <SectionTitle>Tables</SectionTitle>
          <Caption>{tablesSummary(l?.open_tables ?? 0, l?.total_tables ?? 0)}</Caption>
        </View>
        <TableGridLegend hasChatTable={Boolean(l?.has_chat_table)} />
        {tables.loading && rows.length === 0 ? <Loading label="Reading the room" /> : null}
        <TableGrid tables={rows} />
        {l?.has_chat_table ? <ChatTableNote /> : null}
      </Card>

      {hours.length > 0 ? (
        <Card className="gap-3">
          <SectionTitle>Busiest hours</SectionTitle>
          <Caption>Check-ins over the last 60 days, local time.</Caption>
          <View className="gap-2">
            {hours.map((h) => (
              <View key={h.hour_of_day} className="flex-row items-center gap-3">
                <Caption className="w-12">{hourLabel(h.hour_of_day)}</Caption>
                <View className="flex-1">
                  <ProgressBar
                    fraction={h.visits / peakVisits}
                    label={`${hourLabel(h.hour_of_day)}, ${h.visits} check-ins`}
                  />
                </View>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Card className="gap-3">
        <SectionTitle>Going in?</SectionTitle>
        <Body>
          Tap your phone on a table&apos;s box, or scan the code on its side, to claim it. Pick the
          chat table if you would like company.
        </Body>
        <Button label="Find a table" onPress={() => router.push('/checkin')} />
      </Card>

      <Button
        label="Cafe owner? See the anonymous dashboard"
        variant="quiet"
        accessibilityHint={`Opens the owner dashboard for ${v.name}`}
        onPress={() => router.push(`/dashboard/${v.id}`)}
      />
    </Screen>
  );
}
