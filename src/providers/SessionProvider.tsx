import * as Linking from 'expo-linking';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

import type { UserProfile, UserProfileUpdate } from '@/lib/database.types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

interface SessionContextValue {
  session: Session | null;
  profile: UserProfile | null;
  /** True until the stored session has been read from disk. */
  initializing: boolean;
  /** Email we last sent a code to, so the sign-in screen can show step 2. */
  pendingEmail: string | null;

  sendMagicLink: (email: string) => Promise<void>;
  verifyEmailCode: (code: string) => Promise<void>;
  signInWithDemoAccount: () => Promise<void>;
  signOut: () => Promise<void>;

  refreshProfile: () => Promise<void>;
  updateProfile: (patch: UserProfileUpdate) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * The redirect a magic link comes back to.
 *
 * In Expo Go this is an exp:// URL that changes with your LAN address, so it
 * has to be added to Supabase > Authentication > URL Configuration >
 * Redirect URLs each time it changes. That is why the sign-in screen also
 * offers the 6-digit code, which needs no redirect configuration at all, and
 * why the demo account button exists.
 */
const redirectTo = Linking.createURL('/');

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const userId = session?.user.id ?? null;
  const loadedProfileFor = useRef<string | null>(null);

  // ---------------------------------------------------------------- session --
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setInitializing(false);
      return;
    }

    let cancelled = false;

    // .catch matters: if this rejects (unreachable project, no network, DNS
    // failure) and initializing is never cleared, the app sits on the splash
    // spinner forever with no clue why. Failing to a signed-out state at least
    // reaches the sign-in screen, which can report the error.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setSession(data.session);
      })
      .catch((e: unknown) => {
        if (__DEV__) {
          console.warn('[auth] could not read the stored session', e);
        }
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setProfile(null);
        loadedProfileFor.current = null;
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Magic links open the app with a token in the URL. On native there is no
  // page load for supabase-js to inspect, so hand it over ourselves.
  const incomingUrl = Linking.useURL();
  useEffect(() => {
    if (!incomingUrl) return;

    const { queryParams } = Linking.parse(incomingUrl);
    const tokenHash = queryParams?.token_hash;
    if (typeof tokenHash !== 'string') return;

    const type = typeof queryParams?.type === 'string' ? queryParams.type : 'magiclink';
    supabase.auth
      .verifyOtp({ token_hash: tokenHash, type: type as 'magiclink' })
      .then(({ error }) => {
        if (error && __DEV__) console.warn('[auth] magic link verify failed', error.message);
      });
  }, [incomingUrl]);

  // ---------------------------------------------------------------- profile --
  const refreshProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      if (__DEV__) console.warn('[profile] load failed', error.message);
      return;
    }

    if (data) {
      setProfile(data);
      return;
    }

    // The on_auth_user_created trigger normally makes this row. If the trigger
    // is missing (migrations not applied yet) create it so the app still works.
    const { data: created, error: insertError } = await supabase
      .from('users')
      .insert({ id: userId, name: '' })
      .select()
      .maybeSingle();

    if (insertError) {
      if (__DEV__) console.warn('[profile] could not create row', insertError.message);
      return;
    }
    setProfile(created ?? null);
  }, [userId]);

  useEffect(() => {
    if (!userId || loadedProfileFor.current === userId) return;
    loadedProfileFor.current = userId;
    void refreshProfile();
  }, [userId, refreshProfile]);

  const updateProfile = useCallback(
    async (patch: UserProfileUpdate) => {
      if (!userId) throw new Error('Not signed in.');

      // Optimistic: these are toggles and chips, they should feel instant.
      setProfile((prev) => (prev ? { ...prev, ...patch } : prev));

      const { data, error } = await supabase
        .from('users')
        .update(patch)
        .eq('id', userId)
        .select()
        .maybeSingle();

      if (error) {
        await refreshProfile(); // put the real value back
        throw error;
      }
      if (data) setProfile(data);
    },
    [userId, refreshProfile],
  );

  // ------------------------------------------------------------------ auth ---
  const sendMagicLink = useCallback(async (email: string) => {
    const address = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
    });
    if (error) throw error;
    setPendingEmail(address);
  }, []);

  const verifyEmailCode = useCallback(
    async (code: string) => {
      if (!pendingEmail) throw new Error('Enter your email first.');
      const { error } = await supabase.auth.verifyOtp({
        email: pendingEmail,
        token: code.trim(),
        type: 'email',
      });
      if (error) throw error;
      setPendingEmail(null);
    },
    [pendingEmail],
  );

  const signInWithDemoAccount = useCallback(async () => {
    const email = process.env.EXPO_PUBLIC_DEMO_EMAIL;
    const password = process.env.EXPO_PUBLIC_DEMO_PASSWORD;
    if (!email || !password) {
      throw new Error('Set EXPO_PUBLIC_DEMO_EMAIL and EXPO_PUBLIC_DEMO_PASSWORD in .env.');
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setPendingEmail(null);
  }, []);

  // TODO(auth): Google sign-in. expo-web-browser is already installed; the
  // shape is supabase.auth.signInWithOAuth({ provider: 'google', options: {
  // redirectTo, skipBrowserRedirect: true } }) then openAuthSessionAsync with
  // the returned url, then exchangeCodeForSession on the code it comes back
  // with. Needs a Google OAuth client and the redirect added in Supabase.

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      profile,
      initializing,
      pendingEmail,
      sendMagicLink,
      verifyEmailCode,
      signInWithDemoAccount,
      signOut,
      refreshProfile,
      updateProfile,
    }),
    [
      session,
      profile,
      initializing,
      pendingEmail,
      sendMagicLink,
      verifyEmailCode,
      signInWithDemoAccount,
      signOut,
      refreshProfile,
      updateProfile,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>.');
  return ctx;
}

/** True when there is a signed-in user. */
export function useIsSignedIn(): boolean {
  return Boolean(useSession().session);
}

export const DEMO_ACCOUNT_AVAILABLE = Boolean(
  process.env.EXPO_PUBLIC_DEMO_EMAIL && process.env.EXPO_PUBLIC_DEMO_PASSWORD,
);
