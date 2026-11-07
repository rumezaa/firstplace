import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Checks that .env holds real credentials, not the ones from .env.example.
 *
 * Checking only that the vars are non-empty is not enough: a straight
 * `cp .env.example .env` leaves placeholder strings behind, which are truthy.
 * The app then sails past the setup screen and fails against a hostname that
 * does not resolve, which looks like a broken project rather than a missing
 * step. Returns a message naming the problem, or null when all is well.
 */
function findConfigProblem(): string | null {
  if (!url) return 'EXPO_PUBLIC_SUPABASE_URL is not set in .env.';
  if (!anonKey) return 'EXPO_PUBLIC_SUPABASE_ANON_KEY is not set in .env.';

  // The literal values shipped in .env.example.
  if (url.includes('your-project-ref')) {
    return 'EXPO_PUBLIC_SUPABASE_URL is still the example placeholder. Replace it with your project URL.';
  }
  if (anonKey.includes('your-anon-public-key')) {
    return 'EXPO_PUBLIC_SUPABASE_ANON_KEY is still the example placeholder. Replace it with your anon key.';
  }

  if (!/^https:\/\/.+/.test(url)) {
    return `EXPO_PUBLIC_SUPABASE_URL should start with https:// (got "${url}").`;
  }

  // Deliberately permissive: Supabase issues legacy JWT keys (eyJ...) and
  // newer publishable keys (sb_publishable_...), so only obvious junk is
  // rejected rather than matching one specific format.
  if (anonKey.length < 20) {
    return 'EXPO_PUBLIC_SUPABASE_ANON_KEY looks too short to be a real key.';
  }

  return null;
}

export const supabaseConfigProblem = findConfigProblem();

/** True when .env has real credentials in it. */
export const isSupabaseConfigured = supabaseConfigProblem === null;

if (!isSupabaseConfigured && __DEV__) {
  console.warn(
    `[supabase] ${supabaseConfigProblem} ` +
      'Fill in .env, then restart with `npm run start:clear` — env vars are ' +
      'read at bundle time, so a plain reload will not pick them up.',
  );
}

export const supabase = createClient<Database>(
  url ?? 'http://localhost:54321',
  anonKey ?? 'public-anon-key-placeholder',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // No URL to read on native; the magic-link token is handed over manually
      // by SessionProvider. Leaving this true breaks sign-in on native.
      detectSessionInUrl: false,
    },
  },
);

/**
 * Pulls a message out of whatever Supabase threw.
 *
 * Our RPCs raise plain exceptions with a user-readable message (see the error
 * convention in supabase/migrations/...0400_rpc.sql), so the message is safe to
 * put straight on screen.
 */
export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const e = error as { message?: unknown; error_description?: unknown };
    if (typeof e.message === 'string' && e.message.length > 0) return e.message;
    if (typeof e.error_description === 'string') return e.error_description;
  }
  return fallback;
}

/** The stable token our RPCs put in `hint` so callers can branch on the reason. */
export function errorHint(error: unknown): string | null {
  if (error && typeof error === 'object') {
    const e = error as { hint?: unknown };
    if (typeof e.hint === 'string' && e.hint.length > 0) return e.hint;
  }
  return null;
}
