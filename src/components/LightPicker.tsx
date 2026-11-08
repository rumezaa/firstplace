import { Pressable, Text, View } from 'react-native';

import { LIGHT_INFO, type Light } from '@/lib/conversations';
import { colors } from '@/lib/theme';

const SYM: Record<Light, { bg: string; ink: string }> = {
  green: { bg: colors.go, ink: '#FFFFFF' },
  yellow: { bg: colors.ask, ink: colors.askInk },
  red: { bg: colors.stop, ink: '#FFFFFF' },
};

const EXPLAIN: Record<Light, string> = {
  green: 'Anyone can walk over and say hi.',
  yellow: "People can ask to join. You'll see what you have in common, then decide.",
  red: "Nobody will approach. You're just here.",
};

/**
 * iOS-style segmented control for the three lights, 44pt per option, with one
 * explanation line underneath that changes with the choice (design kit v2).
 */
export function LightPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: Light;
  onChange: (l: Light) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      <View
        accessibilityRole="radiogroup"
        style={{ flexDirection: 'row', gap: 2, padding: 3, backgroundColor: colors.sunk, borderRadius: 12 }}
      >
        {(['green', 'yellow', 'red'] as Light[]).map((l) => {
          const on = value === l;
          return (
            <Pressable
              key={l}
              disabled={disabled}
              onPress={() => onChange(l)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled }}
              accessibilityLabel={`${LIGHT_INFO[l].label}: ${LIGHT_INFO[l].meaning}`}
              style={{
                flex: 1,
                height: 44,
                borderRadius: 9,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                backgroundColor: on ? colors.surface : 'transparent',
                shadowColor: '#000',
                shadowOpacity: on ? 0.08 : 0,
                shadowRadius: 3,
                shadowOffset: { width: 0, height: 1 },
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: SYM[l].bg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: SYM[l].ink, fontSize: 12, fontWeight: '800' }}>{LIGHT_INFO[l].symbol}</Text>
              </View>
              <Text style={{ fontSize: 15, fontWeight: '600', color: on ? colors.espresso : colors.mocha }}>
                {LIGHT_INFO[l].label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ fontSize: 13, lineHeight: 18, color: colors.mocha, paddingHorizontal: 4 }}>{EXPLAIN[value]}</Text>
    </View>
  );
}
