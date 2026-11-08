import { VenueList } from './VenueList';
import type { VenueMapProps } from './VenueMap';

/** Browser version: react-native-maps has no web support, so show the list. */
export function VenueMap(props: VenueMapProps) {
  return <VenueList {...props} />;
}
