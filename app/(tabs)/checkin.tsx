import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/Text';

import { fetchOpenCheckin } from '@/lib/checkins';
import { fetchConversation } from '@/lib/conversations';
import { MIN_TAP_TARGET } from '@/lib/theme';
import { fetchTables, fetchVenues } from '@/lib/venues';
import { useAsync } from '@/hooks/useAsync';
import { Body, Button, Card, Screen, SectionTitle, Title } from '@/components/ui';

/**
 * Tap or scan a ChatterBox box. The box's NFC tag and printed QR both hold a
 * link with its table id; either one opens that table's screen, where you
 * take it if it's yellow (free), or join on green.
 */
export default function CheckinScreen() {
  const router = useRouter();
  const conversation = useAsync(() => fetchConversation(), []);
  const open = useAsync(fetchOpenCheckin, []);

  useFocusEffect(
    useCallback(() => {
      void conversation.reload();
      void open.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const openTable = useCallback((tableId: string) => router.push(`/table/${tableId}`), [router]);

  return (
    <Screen>
      <View className="gap-1">
        <Title>Find a table</Title>
        <Body>Hold your phone to the box on any table, or to the tag at the entrance.</Body>
      </View>

      {conversation.data && !conversation.data.ended_at ? (
        <Card accent="berry" className="gap-3">
          <SectionTitle>You&apos;re in a conversation</SectionTitle>
          <Body>With {conversation.data.their_first_name ?? 'someone new'}.</Body>
          <Button label="Open conversation" onPress={() => router.push('/conversation')} />
        </Card>
      ) : null}

      {open.data?.table_id ? (
        <Card accent="clay" className="gap-3">
          <SectionTitle>You&apos;ve claimed a table</SectionTitle>
          <Button label="Go to my table" variant="secondary" onPress={() => openTable(open.data!.table_id!)} />
        </Card>
      ) : null}
      <PickByHand onTable={openTable} />
    </Screen>
  );
}

/* ----------------------------------------------------- pick a box by hand -- */

function PickByHand({ onTable }: { onTable: (id: string) => void }) {
  const venues = useAsync(fetchVenues, []);
  const [venueId, setVenueId] = useState<string | null>(null);
  const tables = useAsync(() => (venueId ? fetchTables(venueId) : Promise.resolve([])), [venueId]);

  return (
    <Card className="gap-1">
      <SectionTitle className="mb-1">Or pick a place</SectionTitle>
      {!venueId ? (
        (venues.data ?? []).map((v) => (
          <Row key={v.id} label={v.name} onPress={() => setVenueId(v.id)} />
        ))
      ) : (
        <>
          {(tables.data ?? []).map((t) => (
            <Row
              key={t.id}
              label={`${t.label}${t.is_chat_table ? ' · conversation box' : ''}`}
              onPress={() => onTable(t.id)}
            />
          ))}
          <Button label="Back to places" variant="quiet" onPress={() => setVenueId(null)} />
        </>
      )}
    </Card>
  );
}

function Row({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ minHeight: MIN_TAP_TARGET }}
      className="border-border-warm flex-row items-center justify-between border-b"
    >
      <Text className="text-espresso text-base">{label}</Text>
      <Text className="text-mocha text-lg">›</Text>
    </Pressable>
  );
}
