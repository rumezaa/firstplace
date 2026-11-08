import { Pressable, View } from 'react-native';
import { Text } from '@/components/Text';

import type { VenueTable } from '@/lib/database.types';
import { MIN_TAP_TARGET } from '@/lib/theme';
import { Badge, Caption, SectionTitle } from '@/components/ui';

interface TableGridProps {
  tables: VenueTable[];
  /** Highlight the currently chosen tile (the check-in flow). */
  selectedId?: string | null;
  onSelect?: (table: VenueTable) => void;
  /** Kiosk mode lets staff tap a taken table to free it. */
  allowTakenPress?: boolean;
}

/**
 * The live table grid, shared by the venue screen, the check-in flow and the
 * kiosk. The chat table is always first and always visually distinct — it is
 * the single most important affordance in the app, because it is the one table
 * where sitting down with a stranger is socially sanctioned.
 */
export function TableGrid({
  tables,
  selectedId,
  onSelect,
  allowTakenPress = false,
}: TableGridProps) {
  if (tables.length === 0) {
    return <Caption>No table map for this place yet.</Caption>;
  }

  return (
    <View className="flex-row flex-wrap gap-3">
      {tables.map((table) => (
        <TableTile
          key={table.id}
          table={table}
          selected={selectedId === table.id}
          onSelect={onSelect}
          allowTakenPress={allowTakenPress}
        />
      ))}
    </View>
  );
}

function TableTile({
  table,
  selected,
  onSelect,
  allowTakenPress,
}: {
  table: VenueTable;
  selected: boolean;
  onSelect?: (table: VenueTable) => void;
  allowTakenPress: boolean;
}) {
  const isTaken = table.status === 'taken';
  const pressable = Boolean(onSelect) && (!isTaken || allowTakenPress);

  const tone = table.is_chat_table
    ? isTaken
      ? 'bg-berry-soft border-berry'
      : 'bg-berry-soft border-berry'
    : isTaken
      ? 'bg-sunk border-border-warm'
      : 'bg-surface border-border-warm';

  const selectedRing = selected ? 'border-clay' : '';

  return (
    <Pressable
      disabled={!pressable}
      onPress={() => onSelect?.(table)}
      accessibilityRole="button"
      // Everything a sighted user gets from colour and position, said out loud.
      accessibilityLabel={[
        table.is_chat_table ? 'Chat table' : `Table ${table.label}`,
        `${table.seats} ${table.seats === 1 ? 'seat' : 'seats'}`,
        isTaken ? 'taken' : 'open',
        selected ? 'selected' : null,
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityState={{ disabled: !pressable, selected }}
      accessibilityHint={
        pressable
          ? allowTakenPress
            ? 'Tap to flip this table between open and taken'
            : 'Tap to choose this table'
          : undefined
      }
      style={{ minHeight: MIN_TAP_TARGET + 28, minWidth: 104 }}
      className={`rounded-tile flex-1 justify-between border-2 p-3 ${tone} ${selectedRing} ${
        pressable ? 'active:opacity-80' : ''
      }`}
    >
      <Text
        numberOfLines={1}
        className={`text-base font-bold ${table.is_chat_table ? 'text-berry' : 'text-espresso'}`}
      >
        {table.is_chat_table ? 'Chat table' : table.label}
      </Text>
      <Caption>
        {table.seats} {table.seats === 1 ? 'seat' : 'seats'}
      </Caption>
      <Text
        className={`mt-1 text-xs font-semibold ${
          table.is_chat_table ? 'text-clay' : 'text-mocha'
        }`}
      >
        {isTaken ? 'Taken' : 'Open'}
      </Text>
    </Pressable>
  );
}

/** The legend under a grid. Colour alone is never the only signal. */
export function TableGridLegend({ hasChatTable }: { hasChatTable: boolean }) {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Badge label="Open" tone="open" />
      <Badge label="Taken" tone="full" />
      {hasChatTable ? <Badge label="Chat table" tone="chat" /> : null}
    </View>
  );
}

export function ChatTableNote() {
  return (
    <View className="bg-berry-soft rounded-tile p-3">
      <SectionTitle className="text-berry text-base">What is the chat table?</SectionTitle>
      <Caption className="text-berry mt-1">
        A conversation table with a light. Yellow means the seat is free, green means say hi, and red
        means please do not disturb. Sitting here does not oblige you to talk.
      </Caption>
    </View>
  );
}
