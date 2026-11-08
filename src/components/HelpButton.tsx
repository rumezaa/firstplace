import Ionicons from '@expo/vector-icons/Ionicons';
import { usePathname, useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/lib/theme';

/**
 * The Help button: same place on every screen (top right), one tap away.
 * Hidden only on the Help screen itself.
 */
export function HelpButton() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  // Hidden on Help itself and the one-time intro (which has its own Skip).
  if (pathname === '/help' || pathname === '/welcome') return null;

  return (
    <Pressable
      onPress={() => router.push('/help')}
      accessibilityRole="button"
      accessibilityLabel="Help"
      accessibilityHint="Call 911, leave now, get staff, or talk to someone"
      hitSlop={6}
      style={{
        position: 'absolute',
        top: insets.top + 6,
        right: 12,
        height: 44,
        paddingLeft: 10,
        paddingRight: 12,
        borderRadius: 999,
        // Solid, outlined and lifted, so it reads as floating above content
        // that scrolls underneath it on the headerless tab screens.
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.brickSoft,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        zIndex: 10,
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 4,
      }}
    >
      <Ionicons name="help-buoy-outline" size={17} color={colors.brick} />
      <Text style={{ color: colors.brick, fontWeight: '600', fontSize: 15 }}>Help</Text>
    </Pressable>
  );
}
