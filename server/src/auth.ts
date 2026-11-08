import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { SignJWT, createRemoteJWKSet, jwtVerify } from 'jose';
import { asSystem } from './db.js';
import { env } from './env.js';

export type AuthVars = { userId: string | null; sub: string | null };

const jwks = env.auth0Domain
  ? createRemoteJWKSet(new URL(`https://${env.auth0Domain}/.well-known/jwks.json`))
  : null;
const devKey = new TextEncoder().encode(env.devTokenSecret || 'unused');
const DEV_ISSUER = 'firstplace-dev';

/** Verify a bearer token and return the user's subject, or throw 401. */
async function subjectFromToken(token: string): Promise<{ sub: string; name?: string }> {
  // Dev tokens (from POST /dev/login) are only accepted when dev login is on.
  if (env.devLogin) {
    try {
      const { payload } = await jwtVerify(token, devKey, { issuer: DEV_ISSUER });
      if (payload.sub) return { sub: payload.sub };
    } catch {
      // not a dev token; fall through to Auth0
    }
  }

  if (!jwks) throw new HTTPException(401, { message: 'Auth0 is not configured on the server.' });

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://${env.auth0Domain}/`,
      audience: env.auth0Audience || undefined,
    });
    if (!payload.sub) throw new Error('token has no sub');
    const name = typeof payload.name === 'string' ? payload.name : undefined;
    return { sub: payload.sub, name };
  } catch {
    throw new HTTPException(401, { message: 'Your session has expired. Please sign in again.' });
  }
}

// auth0_sub -> users.id. Users never change id, so caching is safe.
const userIdCache = new Map<string, string>();

/** Find or create the public.users row for an Auth0 subject. */
async function provisionUser(sub: string, name?: string): Promise<string> {
  const cached = userIdCache.get(sub);
  if (cached) return cached;

  const id = await asSystem(async (db) => {
    const found = await db.query<{ id: string }>('select id from public.users where auth0_sub = $1', [sub]);
    if (found.rows[0]) return found.rows[0].id;
    const created = await db.query<{ id: string }>(
      `insert into public.users (auth0_sub, name) values ($1, $2)
       on conflict (auth0_sub) do update set auth0_sub = excluded.auth0_sub
       returning id`,
      [sub, name ?? ''],
    );
    return created.rows[0].id;
  });

  userIdCache.set(sub, id);
  return id;
}

/** Reads the bearer token if present. Anonymous requests pass with userId = null. */
export const optionalAuth = createMiddleware<{ Variables: AuthVars }>(async (c, next) => {
  const header = c.req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    c.set('userId', null);
    c.set('sub', null);
    return next();
  }
  const { sub, name } = await subjectFromToken(header.slice('Bearer '.length));
  c.set('sub', sub);
  c.set('userId', await provisionUser(sub, name));
  return next();
});

/** Same as optionalAuth, but rejects anonymous requests. */
export const requireAuth = createMiddleware<{ Variables: AuthVars }>(async (c, next) => {
  if (!c.get('userId')) throw new HTTPException(401, { message: 'Please sign in first.' });
  return next();
});

/** Issue a dev token for a seeded user. Only reachable when dev login is on. */
export async function issueDevToken(sub: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(DEV_ISSUER)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(devKey);
}
