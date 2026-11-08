import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Text } from '@/components/Text';
import { Caption, Chip, SectionTitle } from '@/components/ui';
import { colors } from '@/lib/theme';

/**
 * Shows what you picked, quietly. "Edit" opens the suggestions; "Done" closes
 * them. Keeps the profile from being a wall of forty chips.
 *
 * Onboarding passes `alwaysOpen` (every chip tappable, no Edit button) and
 * `allowCustom` ("Add your own"). Chips carry their on/off state for screen
 * readers, so meaning never depends on colour alone.
 */
export function ChipGroup({
  title,
  selected,
  suggestions,
  onToggle,
  alwaysOpen = false,
  allowCustom = false,
}: {
  title?: string;
  selected: string[];
  suggestions: string[];
  onToggle: (value: string) => void;
  alwaysOpen?: boolean;
  allowCustom?: boolean;
}) {
  const [editingState, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const editing = alwaysOpen || editingState;
  const all = Array.from(new Set([...selected, ...suggestions]));
  const shown = editing ? all : selected;

  function addCustom() {
    const v = draft.trim().slice(0, 40);
    if (v && !selected.some((s) => s.toLowerCase() === v.toLowerCase())) onToggle(v);
    setDraft('');
  }

  return (
    <View className="gap-2">
      {title || !alwaysOpen ? (
        <View className="flex-row items-center justify-between">
          {title ? <SectionTitle>{title}</SectionTitle> : <View />}
          {!alwaysOpen ? (
            <Pressable onPress={() => setEditing(!editingState)} accessibilityRole="button" accessibilityLabel={`${editing ? 'Done editing' : 'Edit'} ${title ?? ''}`} hitSlop={12}>
              <Text className="text-clay text-[16px] font-semibold">{editing ? 'Done' : selected.length ? 'Edit' : 'Add'}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {shown.length ? (
        <View className="flex-row flex-wrap gap-2">
          {shown.map((v) => (
            <Chip key={v} label={v} selected={selected.includes(v)} onPress={editing ? () => onToggle(v) : undefined} />
          ))}
        </View>
      ) : (
        <Caption>Nothing yet.</Caption>
      )}
      {editing && allowCustom ? (
        <View className="flex-row items-center gap-2">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={addCustom}
            placeholder="Add your own"
            placeholderTextColor={colors.mocha}
            maxLength={40}
            returnKeyType="done"
            accessibilityLabel={`Add your own${title ? ` to ${title}` : ''}`}
            className="bg-surface border-border-warm text-espresso flex-1 rounded-tile border px-4 text-base"
            style={{ minHeight: 48 }}
          />
          <Pressable onPress={addCustom} accessibilityRole="button" accessibilityLabel="Add" hitSlop={8} style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 }}>
            <Text className="text-clay text-[16px] font-semibold">Add</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
