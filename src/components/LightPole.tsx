import { Text, View } from 'react-native';

import { LIGHT_INFO, type BoxLight } from '@/lib/conversations';
import { colors } from '@/lib/theme';

/**
 * The box's light pole: red top, yellow middle, green bottom. The lit lamp is
 * readable by POSITION and SYMBOL, not colour alone. Flat colours, no glow
 * (design kit v2).
 */
const LAMPS: { key: 'red' | 'yellow' | 'green'; on: string; ink: string }[] = [
  { key: 'red', on: colors.stop, ink: '#FFFFFF' },
  { key: 'yellow', on: colors.ask, ink: colors.askInk },
  { key: 'green', on: colors.go, ink: '#FFFFFF' },
];

const SIZES = {
  sm: { d: 14, gap: 4, pad: 5, radius: 12, symbols: false },
  md: { d: 44, gap: 8, pad: 10, radius: 24, symbols: true },
  lg: { d: 72, gap: 12, pad: 14, radius: 34, symbols: true },
} as const;

export function LightPole({ light, size = 'md' }: { light: BoxLight; size?: keyof typeof SIZES }) {
  const s = SIZES[size];
  const info = LIGHT_INFO[light];
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Light: ${info.label}. ${info.meaning}.`}
      style={{ gap: s.gap, padding: s.pad, borderRadius: s.radius, backgroundColor: colors.pole }}
    >
      {LAMPS.map((lamp) => {
        const on = light === lamp.key;
        return (
          <View
            key={lamp.key}
            style={{
              width: s.d,
              height: s.d,
              borderRadius: s.d / 2,
              backgroundColor: on ? lamp.on : colors.lampOff,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {on && s.symbols ? (
              <Text style={{ color: lamp.ink, fontSize: s.d * 0.42, fontWeight: '800' }}>
                {LIGHT_INFO[lamp.key].symbol}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
