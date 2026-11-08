import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';

import { useSession } from '@/providers/SessionProvider';
import { colors } from '@/lib/theme';

export default function TabsLayout() {
  const { session } = useSession();

  // The gate for every tab. Deeper routes (venue, kiosk, dashboard) are reached
  // from inside the tabs, so this covers them too.
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.cream },
        headerTintColor: colors.espresso,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.clay,
        tabBarInactiveTintColor: '#7C8185',
        tabBarStyle: {
          backgroundColor: 'rgba(250,250,248,0.96)',
          borderTopColor: colors.border,
          height: 83,
          paddingTop: 7,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500' },
        tabBarItemStyle: { paddingVertical: 4 },
        sceneStyle: { backgroundColor: colors.cream },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Explore',
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'map' : 'map-outline'} size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="checkin"
        options={{
          title: 'Table',
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'radio-button-on' : 'radio-button-off'} size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="connections"
        options={{
          title: 'People',
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'You',
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color as string} />
          ),
        }}
      />
    </Tabs>
  );
}
