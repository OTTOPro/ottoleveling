import type { Context, Next } from 'hono';
import type { Bindings } from '../index';

// JWKS cache (in-memory, per-Worker-instance). 1h TTL; refresh on miss.
interface JwksCacheEntry {
  keys: (JsonWebKey & { kid?: string })[];
  fetched_at: number;
}
let jwksCache: JwksCacheEntry | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchJwks(teamDomain: string): Promise<(JsonWebKey & { kid?: string })[]> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetched_at < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const json = (await res.json()) as { keys: (JsonWebKey & { kid?: string })[] };
  jwksCache = { keys: json.keys, fetched_at: now };
  return json.keys;
}

interface JwtHeader {
  alg: string;
  kid?: string;
  typ?: string;
}
interface JwtPayload {
  aud?: string | string[];
  iss?: string;
  email?: string;
  exp?: number;
  iat?: number;
  sub?: string;
}

function base64UrlDecode(input: string): Uint8Array {
  // base64url → base64
  const padded = input
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(input.length + ((4 - (input.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function parseJwt(token: string): {
  header: JwtHeader;
  payload: JwtPayload;
  signedDataBytes: Uint8Array;
  signature: Uint8Array;
} {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed JWT');
  const [h, p, s] = parts as [string, string, string];
  const header = JSON.parse(bytesToString(base64UrlDecode(h))) as JwtHeader;
  const payload = JSON.parse(bytesToString(base64UrlDecode(p))) as JwtPayload;
  const signedDataBytes = new TextEncoder().encode(`${h}.${p}`);
  const signature = base64UrlDecode(s);
  return { header, payload, signedDataBytes, signature };
}

async function verifyJwtSignature(
  token: string,
  jwks: (JsonWebKey & { kid?: string })[],
): Promise<{ payload: JwtPayload } | null> {
  let parsed: ReturnType<typeof parseJwt>;
  try {
    parsed = parseJwt(token);
  } catch {
    return null;
  }
  if (parsed.header.alg !== 'RS256') return null;
  if (!parsed.header.kid) return null;
  const matchingKey = jwks.find((k) => k.kid === parsed.header.kid);
  if (!matchingKey) return null;
  try {
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      matchingKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      parsed.signature as BufferSource,
      parsed.signedDataBytes as BufferSource,
    );
    return ok ? { payload: parsed.payload } : null;
  } catch {
    return null;
  }
}

export type AccessVerifyResult =
  | { ok: true; auth: 'access_jwt'; email: string }
  | { ok: true; auth: 'dev_token' }
  | { ok: false; reason: string };

/**
 * Verifies an inbound request's auth. Production accepts ONLY Cloudflare
 * Access JWT (Authorization: Bearer <jwt>). The x-dev-token fallback is
 * GATED on env.ENV !== 'production' - active in local dev + integration
 * tests, REJECTED in production. Generic Forbidden on any failure - no
 * detail leakage to the caller.
 *
 * The x-dev-token path is unreachable in production: wrangler.toml sets
 * ENV='production', while the vitest config does not, so the fallback still
 * works in tests.
 *
 * If a future surface needs a non-Access auth path (e.g., GitHub Actions
 * triggering an admin endpoint), prefer signed-payload over a shared
 * bearer. Do NOT remove this env gate without coordinating the change.
 */
export async function verifyAccess(
  c: Context<{ Bindings: Bindings }>,
): Promise<AccessVerifyResult> {
  const env = c.env;
  const authHeader = c.req.header('authorization');
  const devTokenHeader = c.req.header('x-dev-token');

  // Try Access JWT first.
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    try {
      const jwks = await fetchJwks(env.CLOUDFLARE_ACCESS_TEAM_DOMAIN);
      const verify = await verifyJwtSignature(token, jwks);
      if (!verify) return { ok: false, reason: 'jwt_signature' };
      const { payload } = verify;
      // aud claim - string OR string[]
      const audClaim = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
      if (!audClaim.includes(env.CLOUDFLARE_ACCESS_AUD)) {
        return { ok: false, reason: 'jwt_aud' };
      }
      // iss claim
      const expectedIss = `https://${env.CLOUDFLARE_ACCESS_TEAM_DOMAIN}`;
      if (payload.iss !== expectedIss) return { ok: false, reason: 'jwt_iss' };
      // exp claim (Unix seconds)
      const now = Math.floor(Date.now() / 1000);
      if (typeof payload.exp !== 'number' || payload.exp <= now) {
        return { ok: false, reason: 'jwt_expired' };
      }
      // email claim
      if (payload.email !== env.CLOUDFLARE_ACCESS_ALLOWED_EMAIL) {
        return { ok: false, reason: 'jwt_email' };
      }
      return { ok: true, auth: 'access_jwt', email: payload.email };
    } catch (err) {
      console.error('[auth-access] JWT verification error:', err);
      return { ok: false, reason: 'jwt_error' };
    }
  }

  // x-dev-token fallback - GATED on non-production env (test infra only).
  // In production (wrangler.toml ENV='production'), this branch is dead code:
  // the early-return rejects before any constant-time compare runs.
  if (env.ENV === 'production') {
    return { ok: false, reason: 'no_auth' };
  }
  if (devTokenHeader) {
    const expected = env.DEV_TOKEN;
    if (!expected) return { ok: false, reason: 'dev_token_unconfigured' };
    const a = new TextEncoder().encode(devTokenHeader);
    const b = new TextEncoder().encode(expected);
    if (a.length !== b.length) return { ok: false, reason: 'dev_token_mismatch' };
    // Workers don't expose node:crypto.timingSafeEqual; hand-rolled constant-time compare.
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
    if (diff !== 0) return { ok: false, reason: 'dev_token_mismatch' };
    return { ok: true, auth: 'dev_token' };
  }

  return { ok: false, reason: 'no_auth' };
}

/**
 * Hono middleware factory. Returns 403 Forbidden on any auth failure.
 * Logs the auth path on success (visible via wrangler tail) so you can
 * confirm a client (e.g. the installed PWA) is sending the Access JWT and
 * not x-dev-token.
 */
export function accessMiddleware() {
  return async (c: Context<{ Bindings: Bindings }>, next: Next) => {
    const result = await verifyAccess(c);
    if (!result.ok) {
      console.warn(`[auth-access] denied: reason=${result.reason} path=${c.req.path}`);
      return c.text('Forbidden', 403);
    }
    console.log(`[auth-access] allowed: auth=${result.auth} path=${c.req.path}`);
    await next();
  };
}
