import * as Haptics from 'expo-haptics';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { fetchConversation } from '@/lib/conversations';
import { useSession } from '@/providers/SessionProvider';

/**
 * The seated person's "someone said hi". While you're signed in, this checks
 * every 3 seconds whether a NEW conversation has started for you; when one
 * has, the phone buzzes and the conversation opens, whatever screen you're on.
 *
 * Each conversation is announced once: if you then step away (Help, the map),
 * you're never dragged back. Only in the foreground, so it costs nothing in
 * the background.
 */
const EVERY_MS = 3_000;

export function ConversationWatcher() {
  const { session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const announced = useRef<Set<string>>(new Set());
  const where = useRef(pathname);
  useEffect(() => {
    where.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!session) return;
    let stopped = false;
    let first = true;

    async function check() {
      if (stopped || AppState.currentState !== 'active') return;
      const c = await fetchConversation().catch(() => null);
      if (stopped || !c || c.ended_at) return;
      if (announced.current.has(c.id)) return;
      announced.current.add(c.id);
      // A conversation that was already running when the app opened isn't news.
      if (first && where.current === '/conversation') return;
      if (where.current === '/conversation') return;
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push('/conversation');
    }

    void check().finally(() => {
      first = false;
    });
    const t = setInterval(() => void check(), EVERY_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [session, router]);

  return null;
}
