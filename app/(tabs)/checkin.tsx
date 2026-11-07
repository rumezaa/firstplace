import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';

import {
  checkIn,
  checkOut,
  fetchOpenCheckin,
  parseKioskQr,
  setOpenToChat,
  sweepStaleCheckins,
} from '@/lib/checkins';
import type { Venue, VenueTable } from '@/lib/database.types';
import { timeOfDay } from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { MIN_TAP_TARGET } from '@/lib/theme';
import { fetchTables, fetchVenue, fetchVenues } from '@/lib/venues';
import { useAsync } from '@/hooks/useAsync';
import { ChatTableNote, TableGrid, TableGridLegend } from '@/components/TableGrid';
import {
  Badge,
  Body,
  Button,
  Caption,
  Card,
  ErrorNote,
  Loading,
  Screen,
  SectionTitle,
  Title,
  ToggleRow,
} from '@/components/ui';

type Step =
  | { kind: 'scanning' }
  | { kind: 'choosing_venue'; code: string }
  | { kind: 'picking'; code: string; venueId: string }
  | { kind: 'done'; venueName: string; tableLabel: string; openToChat: boolean };

export default function CheckinScreen() {
  const [step, setStep] = useState<Step>({ kind: 'scanning' });
  const [error, setError] = useState<string | null>(null);

  const open = useAsync(fetchOpenCheckin, []);

  // Nudge the 3-hour auto check-out when this screen opens, so a stale session
  // from yesterday does not block a fresh check-in. Remove once pg_cron runs it.
  useEffect(() => {
    void sweepStaleCheckins().then(() => open.reload());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (open.loading && !open.data) {
    return (
      <Screen>
        <Loading label="Checking if you are already somewhere" />
      </Screen>
    );
  }

  if (open.data) {
    return (
      <CheckedIn
        checkinId={open.data.id}
        venueId={open.data.venue_id}
        tableId={open.data.table_id}
        openToChat={open.data.open_to_chat}
        since={open.data.checked_in_at}
        onChanged={() => void open.reload()}
      />
    );
  }

  if (step.kind === 'done') {
    return (
      <Screen>
        <Title>You are in</Title>
        <Card accent={step.openToChat ? 'berry' : 'sage'} className="gap-3">
          <SectionTitle>
            {step.tableLabel} at {step.venueName}
          </SectionTitle>
          <Body>
            {step.openToChat
              ? 'You are marked open to chat. Someone may say hello, and that is the whole point.'
              : 'Enjoy the quiet. You can switch to open to chat any time.'}
          </Body>
        </Card>
        <Button label="Done" onPress={() => void open.reload()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View className="gap-1">
        <Title>Check in</Title>
        <Body>Scan the code on the counter to claim a table.</Body>
      </View>

      {error ? <ErrorNote error={error} onRetry={() => setError(null)} /> : null}

      {step.kind === 'scanning' ? (
        <ScanStep
          onCode={(code, venueId) => {
            setError(null);
            setStep(venueId ? { kind: 'picking', code, venueId } : { kind: 'choosing_venue', code });
          }}
        />
      ) : null}

      {step.kind === 'choosing_venue' ? (
        <VenueChooser
          onPick={(venueId) => setStep({ kind: 'picking', code: step.code, venueId })}
          onCancel={() => setStep({ kind: 'scanning' })}
        />
      ) : null}

      {step.kind === 'picking' ? (
        <PickTableStep
          code={step.code}
          venueId={step.venueId}
          onCancel={() => setStep({ kind: 'scanning' })}
          onError={setError}
          onDone={(venueName, tableLabel, openToChat) =>
            setStep({ kind: 'done', venueName, tableLabel, openToChat })
          }
        />
      ) : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------- scan -- */

function ScanStep({ onCode }: { onCode: (code: string, venueId: string | null) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [scanned, setScanned] = useState(false);

  // Only one camera preview can be live at a time, so tear it down when this
  // tab is not the visible one.
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      setScanned(false);
      return () => setFocused(false);
    }, []),
  );

  const handleScan = useCallback(
    (data: string) => {
      if (scanned) return; // onBarcodeScanned fires continuously
      const parsed = parseKioskQr(data);
      if (!parsed) return;
      setScanned(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onCode(parsed.code, parsed.venueId);
    },
    [scanned, onCode],
  );

  return (
    <>
      <Card className="gap-3">
        <SectionTitle>Scan the kiosk code</SectionTitle>

        {!permission ? (
          <Loading label="Starting the camera" />
        ) : !permission.granted ? (
          <>
            <Body>
              We need the camera to read the QR code on the counter. It is only ever used for that.
            </Body>
            <Button
              label={permission.canAskAgain ? 'Allow camera' : 'Open settings to allow camera'}
              onPress={() => void requestPermission()}
            />
          </>
        ) : (
          <View className="bg-sunk overflow-hidden rounded-card" style={{ height: 300 }}>
            {focused ? (
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={({ data }) => handleScan(data)}
              />
            ) : null}
          </View>
        )}

        {Platform.OS !== 'web' ? (
          <Caption>
            The camera does not run in a simulator. Use a real phone, or type the code below.
          </Caption>
        ) : null}
      </Card>

      <Card className="gap-3">
        <SectionTitle>Or type the code</SectionTitle>
        <Caption>The 8 characters printed under the QR code on the kiosk.</Caption>
        <TextInput
          value={manual}
          onChangeText={(t) => setManual(t.toUpperCase())}
          placeholder="A1B2C3D4"
          placeholderTextColor="#A1897A"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
          accessibilityLabel="Kiosk code"
          className="bg-cream border-border-warm text-espresso rounded-tile border px-4 py-3 text-center text-xl tracking-[4px]"
          style={{ minHeight: 48 }}
        />
        <Button
          label="Use this code"
          variant="secondary"
          disabled={manual.trim().length !== 8}
          onPress={() => {
            const parsed = parseKioskQr(manual);
            if (parsed) onCode(parsed.code, parsed.venueId);
          }}
        />
      </Card>
    </>
  );
}

/* ------------------------------------------------------------ venue choice -- */

/**
 * Only reached when a code was typed by hand, because a hand-typed code does
 * not carry the venue id the QR payload does. Scanning skips this entirely.
 */
function VenueChooser({
  onPick,
  onCancel,
}: {
  onPick: (venueId: string) => void;
  onCancel: () => void;
}) {
  const venues = useAsync(fetchVenues, []);

  return (
    <Card className="gap-3">
      <SectionTitle>Which place are you at?</SectionTitle>
      <Caption>A typed code does not tell us where you are. Scanning the QR does.</Caption>
      {venues.loading ? <Loading /> : null}
      {venues.error ? <ErrorNote error={venues.error} onRetry={() => void venues.reload()} /> : null}
      <View className="gap-2">
        {(venues.data ?? []).map((venue: Venue) => (
          <Pressable
            key={venue.id}
            onPress={() => onPick(venue.id)}
            accessibilityRole="button"
            accessibilityLabel={venue.name}
            style={{ minHeight: MIN_TAP_TARGET }}
            className="bg-cream border-border-warm rounded-tile justify-center border px-4 active:opacity-80"
          >
            <Body>{venue.name}</Body>
          </Pressable>
        ))}
      </View>
      <Button label="Back to scanning" variant="quiet" onPress={onCancel} />
    </Card>
  );
}

/* ------------------------------------------------------------- pick table -- */

function PickTableStep({
  code,
  venueId,
  onCancel,
  onDone,
  onError,
}: {
  code: string;
  venueId: string;
  onCancel: () => void;
  onDone: (venueName: string, tableLabel: string, openToChat: boolean) => void;
  onError: (message: string) => void;
}) {
  const venue = useAsync(() => fetchVenue(venueId), [venueId]);
  const tables = useAsync(() => fetchTables(venueId), [venueId]);

  const [selected, setSelected] = useState<VenueTable | null>(null);
  const [wantsChat, setWantsChat] = useState(false);
  const [busy, setBusy] = useState(false);

  // Sitting at the chat table IS opting in, so the toggle locks on. The
  // database enforces this too (public.check_in ORs the two), but the UI should
  // not let someone think they can sit there incognito-ish.
  const atChatTable = Boolean(selected?.is_chat_table);
  const openToChat = atChatTable || wantsChat;

  async function confirm() {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await checkIn({ code, tableId: selected.id, openToChat: wantsChat });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone(
        venue.data?.name ?? 'this place',
        selected.is_chat_table ? 'The chat table' : `Table ${selected.label}`,
        result.open_to_chat,
      );
    } catch (e) {
      onError(errorMessage(e));
      // Most likely someone took the table, or the code rotated. Re-read both.
      void tables.reload();
      onCancel();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="gap-4">
      <View className="gap-1">
        <SectionTitle>{venue.data?.name ?? 'Pick a table'}</SectionTitle>
        <Caption>Tap an open table. Taken ones are not selectable.</Caption>
      </View>

      {tables.error ? <ErrorNote error={tables.error} onRetry={() => void tables.reload()} /> : null}
      {tables.loading && !tables.data ? <Loading label="Reading the room" /> : null}

      <TableGridLegend hasChatTable={(tables.data ?? []).some((t) => t.is_chat_table)} />
      <TableGrid
        tables={tables.data ?? []}
        selectedId={selected?.id ?? null}
        onSelect={(table) => {
          if (table.status === 'taken') return;
          setSelected(table);
        }}
      />

      {(tables.data ?? []).some((t) => t.is_chat_table) ? <ChatTableNote /> : null}

      <View className="border-border-warm border-t pt-2">
        <ToggleRow
          label="Open to chat"
          description={
            atChatTable
              ? 'Always on at the chat table — that is what the table is for.'
              : 'Lets the count on this place go up by one. Never shows your name or your table.'
          }
          value={openToChat}
          onChange={(next) => {
            if (atChatTable) return;
            setWantsChat(next);
          }}
        />
        {atChatTable ? <Badge label="Chat table selected" tone="chat" /> : null}
      </View>

      <Button
        label={selected ? 'Check in' : 'Pick a table first'}
        disabled={!selected}
        busy={busy}
        onPress={() => void confirm()}
      />
      <Button label="Cancel" variant="quiet" onPress={onCancel} disabled={busy} />
    </Card>
  );
}

/* ----------------------------------------------------------- checked in ---- */

function CheckedIn({
  checkinId,
  venueId,
  tableId,
  openToChat,
  since,
  onChanged,
}: {
  checkinId: string;
  venueId: string;
  tableId: string | null;
  openToChat: boolean;
  since: string;
  onChanged: () => void;
}) {
  const router = useRouter();
  const venue = useAsync(() => fetchVenue(venueId), [venueId]);
  const tables = useAsync(() => fetchTables(venueId), [venueId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const table = (tables.data ?? []).find((t) => t.id === tableId) ?? null;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View className="gap-1">
        <Title>You are here</Title>
        <Caption>Since {timeOfDay(since)}. We check you out automatically after 3 hours.</Caption>
      </View>

      {error ? <ErrorNote error={error} /> : null}

      <Card accent={table?.is_chat_table ? 'berry' : 'sage'} className="gap-3">
        <SectionTitle>{venue.data?.name ?? 'Checked in'}</SectionTitle>
        <View className="flex-row flex-wrap gap-2">
          {table ? (
            <Badge
              label={table.is_chat_table ? 'Chat table' : `Table ${table.label}`}
              tone={table.is_chat_table ? 'chat' : 'neutral'}
            />
          ) : null}
          {openToChat ? <Badge label="Open to chat" tone="open" /> : null}
        </View>
        <Body>
          {openToChat
            ? 'You are counted as open to chat here. Your name and your table stay private.'
            : 'Nobody is being told you are here. Only the table shows as taken.'}
        </Body>
      </Card>

      <Card className="gap-1">
        <ToggleRow
          label="Open to chat"
          description={
            table?.is_chat_table
              ? 'Always on at the chat table.'
              : "Adds one to this place's open-to-chat count."
          }
          value={openToChat}
          onChange={(next) => {
            if (table?.is_chat_table) return;
            void run(() => setOpenToChat(checkinId, next));
          }}
        />
      </Card>

      <Button
        label="See this place"
        variant="secondary"
        onPress={() => router.push(`/venue/${venueId}`)}
      />
      <Button label="Check out" variant="danger" busy={busy} onPress={() => void run(checkOut)} />
    </Screen>
  );
}
