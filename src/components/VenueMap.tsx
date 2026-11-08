import MapView, { Marker } from 'react-native-maps';

import { AVAILABILITY } from '@/lib/availability';
import type { Venue, VenueLive } from '@/lib/database.types';
import { CALGARY_REGION } from '@/lib/venues';

export interface VenueMapProps {
  venues: Venue[];
  live: Record<string, VenueLive>;
  onSelect: (venueId: string) => void;
}

/** Phones: the real map. The browser gets VenueMap.web.tsx instead. */
export function VenueMap({ venues, live, onSelect }: VenueMapProps) {
  return (
    <MapView
      style={{ flex: 1 }}
      initialRegion={CALGARY_REGION}
      showsUserLocation={false}
      accessibilityLabel={`Map of ${venues.length} places in Calgary`}
    >
      {venues.map((venue) => {
        const presentation = AVAILABILITY[live[venue.id]?.availability ?? 'open'];
        return (
          <Marker
            key={venue.id}
            coordinate={{ latitude: venue.lat, longitude: venue.lng }}
            pinColor={presentation.pinColor}
            title={venue.name}
            description={presentation.label}
            onPress={() => onSelect(venue.id)}
            accessibilityLabel={`${venue.name}. ${presentation.a11y}`}
          />
        );
      })}
    </MapView>
  );
}
