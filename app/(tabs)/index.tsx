import { Link, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AVAILABILITY, tablesSummary } from '@/lib/availability';
import { APP_NAME } from '@/lib/branding';
import type { Venue, VenueLive } from '@/lib/database.types';
import { people } from '@/lib/format';
import { MIN_TAP_TARGET } from '@/lib/theme';
import {
  NO_FILTERS,
  activeFilterCount,
  fetchVenueLive,
  fetchVenues,
  filterVenues,
  type VenueFilters,
} from '@/lib/venues';
import { useAsync } from '@/hooks/useAsync';
import { useVenueTablesRealtime } from '@/hooks/useRealtime';
import { Badge, Body, Caption, Chip, ErrorNote, Loading, SectionTitle } from '@/components/ui';
import { VenueMap } from '@/components/VenueMap';

export default function MapScreen() {
  const [filters, setFilters] = useState<VenueFilters>(NO_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const venuesState = useAsync(fetchVenues, []);
  const liveState = useAsync(fetchVenueLive, []);

  // Table status changes anywhere -> re-read the aggregate counts. See the
  // notes in useRealtime.ts for why this listens on `tables` and not `checkins`.
  const reloadLive = useCallback(() => {
    void liveState.reload();
  }, [liveState]);
  useVenueTablesRealtime(null, reloadLive);

  const venues = venuesState.data ?? [];
  const live = liveState.data ?? {};
  const visible = filterVenues(venues, live, filters);
  const selected = visible.find((v) => v.id === selectedId) ?? null;

  function toggle(key: keyof VenueFilters) {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (venuesState.loading && venues.length === 0) {
    return (
      <SafeAreaView className="bg-cream flex-1">
        <Loading label="Looking for places to sit" />
      </SafeAreaView>
    );
  }

  if (venuesState.error) {
    return (
      <SafeAreaView className="bg-cream flex-1 px-5 pt-4">
        <ErrorNote error={venuesState.error} onRetry={() => void venuesState.reload()} />
      </SafeAreaView>
    );
  }

  return (
    <View className="bg-cream flex-1">
      <VenueMap venues={visible} live={live} onSelect={setSelectedId} />

      {/* Header + filter chips float over the map so the map stays full-bleed. */}
      <SafeAreaView edges={['top']} className="absolute left-0 right-0 top-0" pointerEvents="box-none">
        <View className="px-5 pb-2 pt-1" pointerEvents="none">
          <Text className="text-espresso text-2xl font-bold" accessibilityRole="header">
            {APP_NAME}
          </Text>
          <Caption>
            {visible.length} of {venues.length} places
            {activeFilterCount(filters) > 0 ? ' match your filters' : ' in Calgary'}
          </Caption>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 px-5 pb-2"
        >
          <Chip
            label="Has tables"
            selected={filters.hasTables}
            onPress={() => toggle('hasTables')}
            accessibilityHint="Only show places with an open table right now"
          />
          <Chip
            label="Chat table active"
            selected={filters.chatTableActive}
            onPress={() => toggle('chatTableActive')}
            accessibilityHint="Only show places where someone is at the chat table"
          />
          <Chip label="Quiet" selected={filters.quiet} onPress={() => toggle('quiet')} />
          <Chip
            label="Good for groups"
            selected={filters.goodForGroups}
            onPress={() => toggle('goodForGroups')}
          />
        </ScrollView>
      </SafeAreaView>

      {selected ? (
        <VenuePreviewSheet
          venue={selected}
          live={live[selected.id]}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </View>
  );
}

/**
 * The bottom sheet preview. A plain absolutely positioned card rather than a
 * gesture-driven sheet: one fewer native dependency to go wrong in Expo Go,
 * and there is nothing here worth dragging.
 */
function VenuePreviewSheet({
  venue,
  live,
  onClose,
}: {
  venue: Venue;
  live: VenueLive | undefined;
  onClose: () => void;
}) {
  const router = useRouter();
  const presentation = AVAILABILITY[live?.availability ?? 'open'];
  const openToChat = live?.people_open_to_chat ?? 0;

  return (
    <View className="absolute bottom-0 left-0 right-0">
      <SafeAreaView edges={['bottom']} className="bg-surface border-border-warm rounded-t-card border-t px-5 pb-2 pt-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <SectionTitle>{venue.name}</SectionTitle>
            {venue.address ? <Caption numberOfLines={1}>{venue.address}</Caption> : null}
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close preview"
            style={{ minHeight: MIN_TAP_TARGET, minWidth: MIN_TAP_TARGET }}
            className="items-center justify-center"
          >
            <Text className="text-mocha text-xl">✕</Text>
          </Pressable>
        </View>

        <View className="mt-3 flex-row flex-wrap items-center gap-2">
          <Badge
            label={presentation.label}
            tone={
              live?.availability === 'full'
                ? 'full'
                : live?.availability === 'filling_up'
                  ? 'filling'
                  : 'open'
            }
            accessibilityLabel={presentation.a11y}
          />
          {live?.chat_table_active ? <Badge label="Chat table active" tone="chat" /> : null}
          {venue.is_quiet ? <Badge label="Quiet" /> : null}
          {venue.good_for_groups ? <Badge label="Good for groups" /> : null}
        </View>

        <Caption className="mt-3">
          {tablesSummary(live?.open_tables ?? 0, live?.total_tables ?? 0)}
          {openToChat > 0 ? ` · ${people(openToChat)} open to chat` : ''}
        </Caption>

        {venue.vibe_summary ? (
          <Body className="mt-2" numberOfLines={2}>
            {venue.vibe_summary}
          </Body>
        ) : null}

        <Pressable
          onPress={() => router.push(`/venue/${venue.id}`)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${venue.name}`}
          style={{ minHeight: MIN_TAP_TARGET }}
          className="bg-clay rounded-chip mt-4 items-center justify-center active:opacity-80"
        >
          <Text className="text-base font-semibold text-white">See inside</Text>
        </Pressable>

        <Link
          href={`/kiosk/${venue.id}`}
          className="text-mocha mt-3 text-center text-xs"
          accessibilityLabel={`Open kiosk mode for ${venue.name}`}
        >
          Staff? Open kiosk mode
        </Link>
      </SafeAreaView>
    </View>
  );
}
