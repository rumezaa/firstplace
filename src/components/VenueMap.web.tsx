import { Pressable, ScrollView, Text, View } from 'react-native';

import { AVAILABILITY } from '@/lib/availability';
import { MIN_TAP_TARGET } from '@/lib/theme';
import type { VenueMapProps } from './VenueMap';

/**
 * Browser version. react-native-maps has no web support, and the browser build
 * exists for the kiosk and owner dashboard on a laptop, so a list of the same
 * venues (same availability colours and labels) is enough here.
 */
export function VenueMap({ venues, live, onSelect }: VenueMapProps) {
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
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: presentation.pinColor }} />
            <View className="flex-1 py-3">
              <Text className="text-espresso text-base font-semibold">{venue.name}</Text>
              <Text className="text-mocha text-sm">{presentation.label}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
