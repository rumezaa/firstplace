import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { api, setAccessToken, setUnauthorizedHandler } from '@/lib/api';
import {
  AUTH0_AUDIENCE,
  AUTH0_AVAILABLE,
  AUTH0_CLIENT_ID,
  AUTH0_DOMAIN,
  AUTH0_REDIRECT_URI,
} from '@/lib/auth0';
import type { UserProfile, UserProfileUpdate } from '@/lib/database.types';

// Lets the Auth0 browser tab hand control back to the app on web.
WebBrowser.maybeCompleteAuthSession();

/** What the app needs to know about the signed-in person. */
export interface Session {
  token: string;
  user: { email: string | null; name: string | null };
  via: 'auth0' | 'demo';
}

interface SessionContextValue {
  session: Session | null;
  profile: UserProfile | null;
  /** True until the stored session has been read from disk. */
  initializing: boolean;

  signInWithAuth0: () => Promise<Auth0Outcome>;
  signInWithDemoAccount: () => Promise<void>;
  signOut: () => Promise<void>;

  refreshProfile: () => Promise<void>;
  updateProfile: (patch: UserProfileUpdate) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);
const STORAGE_KEY = 'firstplace.session.v1';

// ----------------------------------------------------------------- Auth0 ---
// Settings and the redirect URI live in @/lib/auth0, because getting that one
// URI to match the Auth0 dashboard is the whole game. See docs/AUTH0.md.

/** Demo safety net: the server signs you in as the seeded demo user. */
const DEMO_EMAIL = process.env.EXPO_PUBLIC_DEMO_EMAIL?.trim() ?? '';
export const DEMO_ACCOUNT_AVAILABLE = Boolean(DEMO_EMAIL);

interface PreparedAuth {
  discovery: AuthSession.DiscoveryDocument;
  request: AuthSession.AuthRequest;
}

/**
 * How the Auth0 trip ended. `dismissed` covers both "changed my mind" and the
 * Auth0 error page you have to close by hand, which is what a rejected
 * redirect URI looks like from in here: Auth0 never redirects back, so there
 * is no error for us to read.
 */
export type Auth0Outcome = 'signed-in' | 'dismissed';

async function prepareAuth0(): Promise<PreparedAuth> {
  const discovery = await AuthSession.fetchDiscoveryAsync(`https://${AUTH0_DOMAIN}`);
  const request = new AuthSession.AuthRequest({
    clientId: AUTH0_CLIENT_ID,
    redirectUri: AUTH0_REDIRECT_URI,
    scopes: ['openid', 'profile', 'email'],
    usePKCE: true,
    extraParams: { audience: AUTH0_AUDIENCE },
  });
  await request.makeAuthUrlAsync(discovery); // cached on the request; promptAsync reuses it
  return { discovery, request };
}

/**
 * Same thing, warmed up ahead of the tap. The extra `catch` is there because
 * nobody is awaiting this yet: a failed discovery fetch (offline, wrong
 * domain) would otherwise surface as an unhandled rejection. The real error
 * still reaches the caller, because sign-in awaits the same promise.
 */
function preloadAuth0(): Promise<PreparedAuth> {
  const pending = prepareAuth0();
  pending.catch(() => undefined);
  return pending;
}

/** Reads name/email out of an ID token. Display only; the server verifies tokens. */
function claimsFromIdToken(idToken?: string): { email: string | null; name: string | null } {
  try {
    const payload = idToken?.split('.')[1];
    if (!payload) return { email: null, name: null };
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return { email: json.email ?? null, name: json.name ?? json.given_name ?? null };
  } catch {
    return { email: null, name: null };
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [initializing, setInitializing] = useState(true);
  const profileGeneration = useRef(0);

  const applySession = useCallback(async (next: Session | null) => {
    setAccessToken(next?.token ?? null);
    setSession(next);
    profileGeneration.current++;
    setProfile(null);
    try {
      if (next) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      if (__DEV__) console.warn('[auth] could not persist session', e);
    }
  }, []);

  // ------------------------------------------------------- restore session --
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const stored = JSON.parse(raw) as Session;
        setAccessToken(stored.token);
        setSession(stored);
      })
      .catch((e: unknown) => {
        if (__DEV__) console.warn('[auth] could not read the stored session', e);
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // An expired or revoked token: drop back to the sign-in screen.
  useEffect(() => {
    setUnauthorizedHandler(() => void applySession(null));
    return () => setUnauthorizedHandler(null);
  }, [applySession]);

  // ---------------------------------------------------------------- profile --
  const refreshProfile = useCallback(async () => {
    if (!session) return; // signing out clears the profile in applySession
    const generation = profileGeneration.current;
    try {
      const me = await api.get<UserProfile>('/me');
      if (generation !== profileGeneration.current) return;
      // First Auth0 login: the server created a blank profile. Fill in the name.
      if (me && !me.name && session.user.name) {
        const updated = await api.patch<UserProfile>('/me', { name: session.user.name });
        if (generation === profileGeneration.current) setProfile(updated);
        return;
      }
      setProfile(me);
    } catch (e) {
      if (__DEV__) console.warn('[profile] load failed', e);
    }
  }, [session]);

  // Load the profile whenever the session changes. Deferred to a microtask so
  // no state is set synchronously inside the effect.
  useEffect(() => {
    void Promise.resolve().then(refreshProfile);
  }, [refreshProfile]);

  const updateProfile = useCallback(
    async (patch: UserProfileUpdate) => {
      if (!session) throw new Error('Not signed in.');
      const generation = profileGeneration.current;
      // Optimistic: these are toggles and chips, they should feel instant.
      setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
      try {
        const updated = await api.patch<UserProfile>('/me', patch);
        if (generation === profileGeneration.current) setProfile(updated);
      } catch (e) {
        if (generation === profileGeneration.current) await refreshProfile(); // restore only this account
        throw e;
      }
    },
    [session, refreshProfile],
  );

  // ------------------------------------------------------------------ auth ---
  // Build the Auth0 request (discovery + PKCE + URL) BEFORE the tap. Browsers
  // only allow the sign-in popup if it opens right after the click; any await
  // in between (network, hashing) gets it blocked as "not user-initiated".
  const prepared = useRef<Promise<PreparedAuth> | null>(null);
  useEffect(() => {
    if (AUTH0_AVAILABLE) prepared.current = preloadAuth0();
  }, []);

  const signInWithAuth0 = useCallback(async (): Promise<Auth0Outcome> => {
    if (!AUTH0_AVAILABLE) throw new Error('Auth0 is not set up yet. Use the demo account.');

    const { discovery, request } = await (prepared.current ?? prepareAuth0());
    prepared.current = preloadAuth0(); // each request is single-use: ready the next one

    const result = await request.promptAsync(discovery);
    if (result.type === 'cancel' || result.type === 'dismiss') return 'dismissed';
    if (result.type !== 'success') {
      throw new Error(result.type === 'error' ? result.error?.message ?? 'Sign-in failed.' : 'Sign-in failed.');
    }

    const tokens = await AuthSession.exchangeCodeAsync(
      {
        clientId: AUTH0_CLIENT_ID,
        code: result.params.code,
        redirectUri: AUTH0_REDIRECT_URI,
        extraParams: { code_verifier: request.codeVerifier ?? '' },
      },
      discovery,
    );

    await applySession({ token: tokens.accessToken, user: claimsFromIdToken(tokens.idToken), via: 'auth0' });
    return 'signed-in';
  }, [applySession]);

  const signInWithDemoAccount = useCallback(async () => {
    if (!DEMO_EMAIL) throw new Error('Set EXPO_PUBLIC_DEMO_EMAIL in .env.');
    const { token } = await api.post<{ token: string }>('/dev/login', { email: DEMO_EMAIL });
    await applySession({ token, user: { email: DEMO_EMAIL, name: null }, via: 'demo' });
  }, [applySession]);

  const signOut = useCallback(async () => {
    await applySession(null);
  }, [applySession]);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      profile,
      initializing,
      signInWithAuth0,
      signInWithDemoAccount,
      signOut,
      refreshProfile,
      updateProfile,
    }),
    [session, profile, initializing, signInWithAuth0, signInWithDemoAccount, signOut, refreshProfile, updateProfile],
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
