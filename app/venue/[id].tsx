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
  fetchVenueVibe,
} from '@/lib/venues';
import { useAsync } from '@/hooks/useAsync';
import { useVenueTablesRealtime } from '@/hooks/useRealtime';
import { FLOOR_LAYOUTS } from '@/lib/floorLayouts';
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
  // Gemini line from live aggregates; falls back to the venue's own description.
  const vibe = useAsync(() => fetchVenueVibe(venueId).catch(() => null), [venueId]);

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

  const l = live.error ? null : live.data;
  // Without Gemini the server falls back to insider_info, which has its own
  // card below. Use the venue's summary instead so nothing shows twice.
  const vibeText = vibe.data && vibe.data !== v.insider_info ? vibe.data : v.vibe_summary;
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

      {FLOOR_LAYOUTS[v.id] ? (
        // Same screen the NFC tag at the entrance opens.
        <Button label="See the floor" onPress={() => router.push(`/floor/${v.id}`)} />
      ) : null}

      {live.error ? <ErrorNote error={live.error} onRetry={() => void live.reload()} /> : null}
      <View className="flex-row flex-wrap items-center gap-2">
        <Badge
          label={l ? presentation.label : 'Live status unavailable'}
          tone="neutral"
          accessibilityLabel={l ? presentation.a11y : 'Live status unavailable'}
        />
        {l?.chat_table_active ? <Badge label="Chat table active" tone="chat" /> : null}
        {v.is_quiet ? <Badge label="Quiet" /> : null}
        {v.good_for_groups ? <Badge label="Good for groups" /> : null}
        <Badge label={v.type === 'study' ? 'Study space' : v.type === 'cafe' ? 'Cafe' : 'Social space'} />
      </View>

      {vibeText ? (
        <Card className="gap-2">
          <SectionTitle>What it&apos;s like right now</SectionTitle>
          <Body>{vibeText}</Body>
        </Card>
      ) : null}

      {/* The headline social signal. Deliberately a count and nothing more --
          never a list of who, never a location within the room. */}
      <Card accent={openToChat > 0 ? 'berry' : undefined} className="gap-2">
        <SectionTitle>Open to chat right now</SectionTitle>
        <Body>
          {!l ? 'Live information is unavailable. Try refreshing.' : openToChat === 0
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
          {l ? <Caption>{tablesSummary(l.open_tables, l.total_tables)}</Caption> : null}
        </View>
        <TableGridLegend hasChatTable={Boolean(l?.has_chat_table)} />
        {tables.loading && rows.length === 0 ? <Loading label="Reading the room" /> : null}
        {tables.error ? <ErrorNote error={tables.error} onRetry={() => void tables.reload()} /> : <TableGrid tables={rows} />}
        {!tables.loading && !tables.error && rows.length === 0 ? <Body>No tables are listed yet.</Body> : null}
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
          Tap your phone on the box at any conversation table, or scan the code on its side. Green
          means say hi; yellow means ask in the app.
        </Body>
        <Button label="Find a table" onPress={() => router.push('/checkin')} />
      </Card>

      <Button
        label="Owner dashboard"
        variant="quiet"
        accessibilityHint={`Opens the anonymous owner dashboard for ${v.name}`}
        onPress={() => router.push(`/dashboard/${v.id}`)}
      />
    </Screen>
  );
}
