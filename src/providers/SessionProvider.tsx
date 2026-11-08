import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { api, setAccessToken, setUnauthorizedHandler } from '@/lib/api';
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

  signInWithAuth0: () => Promise<void>;
  signInWithDemoAccount: () => Promise<void>;
  signOut: () => Promise<void>;

  refreshProfile: () => Promise<void>;
  /** Pass a function to build on the latest profile (e.g. toggling a chip). */
  updateProfile: (patch: UserProfileUpdate | ((current: UserProfile) => UserProfileUpdate)) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);
const STORAGE_KEY = 'firstplace.session.v1';

// ----------------------------------------------------------------- Auth0 ---
const AUTH0_DOMAIN = process.env.EXPO_PUBLIC_AUTH0_DOMAIN?.trim() ?? '';
const AUTH0_CLIENT_ID = process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID?.trim() ?? '';
const AUTH0_AUDIENCE = process.env.EXPO_PUBLIC_AUTH0_AUDIENCE?.trim() ?? '';

export const AUTH0_AVAILABLE = Boolean(AUTH0_DOMAIN && AUTH0_CLIENT_ID && AUTH0_AUDIENCE);

/** The URL Auth0 sends you back to. Add it under Allowed Callback URLs. */
export const AUTH0_REDIRECT_URI = AuthSession.makeRedirectUri({ scheme: 'firstplace' });

/** Demo safety net: the server signs you in as the seeded demo user. */
const DEMO_EMAIL = process.env.EXPO_PUBLIC_DEMO_EMAIL?.trim() ?? '';
export const DEMO_ACCOUNT_AVAILABLE = Boolean(DEMO_EMAIL);

interface PreparedAuth {
  discovery: AuthSession.DiscoveryDocument;
  request: AuthSession.AuthRequest;
}

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

  const applySession = useCallback(async (next: Session | null) => {
    setAccessToken(next?.token ?? null);
    setSession(next);
    if (!next) setProfile(null);
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
    try {
      const me = await api.get<UserProfile>('/me');
      // First Auth0 login: the server created a blank profile. Fill in the name.
      if (me && !me.name && session.user.name) {
        setProfile(await api.patch<UserProfile>('/me', { name: session.user.name }));
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

  // The newest profile, including optimistic edits not yet rendered. Lets a
  // second quick tap build on the first instead of on a stale render.
  const profileRef = useRef<UserProfile | null>(null);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);
  const saveSeq = useRef(0);

  const updateProfile = useCallback(
    async (patch: UserProfileUpdate | ((current: UserProfile) => UserProfileUpdate)) => {
      if (!session) throw new Error('Not signed in.');
      const current = profileRef.current;
      const resolved = typeof patch === 'function' ? (current ? patch(current) : {}) : patch;
      // Optimistic: these are toggles and chips, they should feel instant.
      if (current) {
        profileRef.current = { ...current, ...resolved };
        setProfile(profileRef.current);
      }
      const seq = ++saveSeq.current;
      try {
        const saved = await api.patch<UserProfile>('/me', resolved);
        // An older save finishing late must not undo a newer tap.
        if (seq === saveSeq.current) setProfile(saved);
      } catch (e) {
        if (seq === saveSeq.current) await refreshProfile(); // put the real value back
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
    if (AUTH0_AVAILABLE) prepared.current = prepareAuth0();
  }, []);

  const signInWithAuth0 = useCallback(async () => {
    if (!AUTH0_AVAILABLE) throw new Error('Auth0 is not set up yet. Use the demo account.');

    const { discovery, request } = await (prepared.current ?? prepareAuth0());
    prepared.current = prepareAuth0(); // each request is single-use: ready the next one

    const result = await request.promptAsync(discovery);
    if (result.type === 'cancel' || result.type === 'dismiss') return;
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
