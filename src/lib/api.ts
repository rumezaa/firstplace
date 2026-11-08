import Constants from 'expo-constants';

/**
 * Client for the FirstPlace API server (server/ in this repo).
 *
 * Every request goes through the server, which holds all secrets, verifies the
 * login and runs the query as you, so the database's privacy rules apply.
 */

const API_PORT = 8787;

/**
 * Where the API lives.
 *
 * 1. EXPO_PUBLIC_API_URL, when set (production: https://api.<our-domain>).
 * 2. Otherwise in development: the same computer that serves the Expo bundle,
 *    on port 8787. A phone in Expo Go can't reach "localhost" (that's the
 *    phone itself), so we reuse the LAN address Expo already connected to.
 */
function resolveApiUrl(): string | null {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  if (!__DEV__) return null;

  const host = devServerHost();
  return `http://${host || 'localhost'}:${API_PORT}`;
}

/**
 * The address of the computer running Expo, as the phone sees it. Expo Go
 * exposes it in different fields depending on the SDK, so try each:
 * expoConfig.hostUri, expoGoConfig.debuggerHost, then the experience URL
 * ("exp://172.20.10.2:8081"). On the web, the page's own hostname.
 */
function devServerHost(): string | null {
  const c = Constants as unknown as {
    expoConfig?: { hostUri?: string };
    expoGoConfig?: { debuggerHost?: string };
    experienceUrl?: string;
    linkingUri?: string;
  };
  const candidates = [
    c.expoConfig?.hostUri,
    c.expoGoConfig?.debuggerHost,
    c.experienceUrl?.replace(/^[a-z]+:\/\//, ''),
    c.linkingUri?.replace(/^[a-z]+:\/\//, ''),
  ];
  for (const raw of candidates) {
    const host = raw?.split('/')[0]?.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') return host;
  }
  if (typeof window !== 'undefined' && window.location?.hostname) return window.location.hostname;
  return null;
}

export const API_URL = resolveApiUrl();

/** A message naming what's missing, or null when the app can reach an API. */
export const apiConfigProblem: string | null = API_URL
  ? null
  : 'EXPO_PUBLIC_API_URL is not set. Point it at the FirstPlace API server.';

export const isApiConfigured = apiConfigProblem === null;

// ------------------------------------------------------------------ token ---
// The SessionProvider owns sign-in and hands the current token over here, so
// the data helpers in src/lib/* don't need to know about auth.

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Called when the server rejects the token (expired session). */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

// ----------------------------------------------------------------- errors ---

/** An error the server sent back. `message` is safe to show on screen. */
export class ApiError extends Error {
  status: number;
  hint: string | null;
  constructor(message: string, status: number, hint: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.hint = hint;
  }
}

/** A message from whatever was thrown, for showing in the UI. */
export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const e = error as { message?: unknown };
    if (typeof e.message === 'string' && e.message.length > 0) return e.message;
  }
  return fallback;
}

/**
 * The stable token the server puts in `hint` so callers can branch on the
 * reason, e.g. kiosk_code_invalid. See db/migrations/040_rpc.sql.
 */
export function errorHint(error: unknown): string | null {
  return error instanceof ApiError ? error.hint : null;
}

// --------------------------------------------------------------- requests ---

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!API_URL) throw new ApiError(apiConfigProblem ?? 'API not configured.', 0);

  const requestToken = accessToken;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(requestToken ? { Authorization: `Bearer ${requestToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      __DEV__
        ? `Can't reach FirstPlace at ${API_URL}. Check that the API server is running and on the same network.`
        : "Can't reach FirstPlace right now. Check your connection.",
      0,
    );
  }

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    if (res.status === 401 && requestToken && requestToken === accessToken) onUnauthorized?.();
    const err = (data ?? {}) as { error?: string; hint?: string | null };
    throw new ApiError(err.error ?? `Request failed (${res.status}).`, res.status, err.hint ?? null);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
};
