import { View } from 'react-native';
import { Text } from '@/components/Text';

import { APP_NAME } from '@/lib/branding';
import { colors } from '@/lib/theme';

/**
 * The FirstPlace mark: the box itself, three lamps with the bottom one lit
 * green ("open to talk"). Same proportions as the app icon (design kit v2).
 */
export function AppIcon({ size = 32 }: { size?: number }) {
  const dot = Math.round(size * 0.175);
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.2237,
        backgroundColor: colors.espresso,
        alignItems: 'center',
        justifyContent: 'center',
        gap: Math.max(2, Math.round(size * 0.06)),
      }}
    >
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: i === 2 ? colors.go : '#34383A' }}
        />
      ))}
    </View>
  );
}

/** Icon + wordmark lockup. */
export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={APP_NAME}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
    >
      <AppIcon size={Math.round(size * 1.6)} />
      <Text style={{ fontSize: size, fontWeight: '700', letterSpacing: -0.6, color: colors.espresso }}>{APP_NAME}</Text>
    </View>
  );
}
