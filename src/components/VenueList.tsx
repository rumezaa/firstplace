import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/components/Text';

import { AVAILABILITY } from '@/lib/availability';
import { MIN_TAP_TARGET } from '@/lib/theme';
import type { VenueMapProps } from './VenueMap';

/**
 * The venues as a list, with the same availability colours and labels as the
 * map pins. The browser uses it instead of a map (react-native-maps has no web
 * support); phones show it from the Map / List switch on Explore.
 */
const TYPE_LABEL: Record<string, string> = { cafe: 'Cafe', study: 'Study space', other: 'Place' };

export function VenueList({ venues, live, onSelect }: VenueMapProps) {
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingTop: 150, paddingBottom: 220, paddingHorizontal: 20, gap: 10 }}
      accessibilityLabel={`List of ${venues.length} places in Calgary`}
    >
      {venues.map((venue) => {
        const presentation = AVAILABILITY[live[venue.id]?.availability ?? 'open'];
        return (
          <Pressable
            key={venue.id}
            onPress={() => onSelect(venue.id)}
            accessibilityRole="button"
            accessibilityLabel={`${venue.name}. ${presentation.a11y}`}
            className="bg-surface border-border-warm rounded-tile flex-row items-center gap-3 border px-4"
            style={{ minHeight: MIN_TAP_TARGET + 12 }}
          >
            <View className="flex-1 py-3" style={{ gap: 2 }}>
              <Text className="text-espresso text-base font-semibold" numberOfLines={1}>{venue.name}</Text>
              <Text className="text-mocha text-sm" numberOfLines={1}>
                {[TYPE_LABEL[venue.type] ?? null, venue.address?.split(',')[0]].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: presentation.pinColor }} />
              <Text className="text-mocha text-[13px]">{presentation.label}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
