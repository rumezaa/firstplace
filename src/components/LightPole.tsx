import { Text, View } from 'react-native';

import { LIGHT_INFO, type BoxLight } from '@/lib/conversations';

/**
 * The box's light pole, drawn on screen: red top, yellow middle, green bottom.
 * The lit lamp is readable by POSITION and SYMBOL, not colour alone (PRD:
 * about 1 in 12 men have red–green colour blindness).
 */
const LAMPS: { key: 'red' | 'yellow' | 'green'; on: string; off: string }[] = [
  { key: 'red', on: '#C62828', off: '#EADBD8' },
  { key: 'yellow', on: '#F2B705', off: '#F1E8CF' },
  { key: 'green', on: '#2E8B57', off: '#DCE9E1' },
];

export function LightPole({ light, size = 'md' }: { light: BoxLight; size?: 'md' | 'lg' }) {
  const d = size === 'lg' ? 84 : 44;
  const info = LIGHT_INFO[light];
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Light: ${info.label}. ${info.meaning}.`}
      className="items-center gap-2 self-center rounded-card bg-espresso px-3 py-3"
    >
      {LAMPS.map((lamp) => {
        const on = light === lamp.key;
        return (
          <View
            key={lamp.key}
            style={{
              width: d,
              height: d,
              borderRadius: d / 2,
              backgroundColor: on ? lamp.on : lamp.off,
              opacity: on ? 1 : 0.35,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {on ? (
              <Text style={{ color: '#fff', fontSize: d * 0.45, fontWeight: '800' }}>
                {LIGHT_INFO[lamp.key].symbol}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
