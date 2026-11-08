import { usePathname, useRouter } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MIN_TAP_TARGET, colors } from '@/lib/theme';

/**
 * The Help button: same place on every screen (top right), one tap away.
 * Hidden only on the Help screen itself and the venue's kiosk display.
 */
export function HelpButton() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  if (pathname === '/help' || pathname.startsWith('/kiosk') || pathname.startsWith('/box')) return null;

  return (
    <Pressable
      onPress={() => router.push('/help')}
      accessibilityRole="button"
      accessibilityLabel="Help"
      accessibilityHint="Call 911, leave now, get staff, or talk to someone"
      style={{
        position: 'absolute',
        top: insets.top + 8,
        right: 12,
        minHeight: MIN_TAP_TARGET - 8,
        minWidth: 72,
        paddingHorizontal: 16,
        borderRadius: 999,
        backgroundColor: colors.brick,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 6,
        elevation: 6,
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Help</Text>
    </Pressable>
  );
}
