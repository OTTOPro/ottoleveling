import { Hono } from 'hono';
import type { Bindings } from '../index';
import { getDataSourceProvider } from '../lib/data-sources/registry';
import { encrypt, generateOAuthState, verifyOAuthState } from '../lib/data-sources/encryption';
import { getDataSourceStatus } from '../lib/data-sources/d1-reads';
import { getCurrentLibrarySaves } from '../lib/data-sources/library-save-events';
import type { ProviderName } from '../lib/data-sources/types';
import { getAgent } from '../lib/agent';
import { allowedWebOrigins } from '../lib/web-origin';

/**
 * /api/data-sources/* routes split into TWO sub-routers:
 *
 *   - `dataSourcesPublicRouter` - mounted BEFORE the global
 *     `app.use('/api/*', devTokenMiddleware())`. Carries the OAuth flow
 *     (authorize + callback) because Google's 302 redirect back to /callback
 *     cannot carry our custom `x-dev-token` header.
 *
 *   - `dataSourcesAuthedRouter` - mounted AFTER the global middleware so it
 *     inherits dev-token auth naturally. Carries status / sync / disconnect.
 *
 * Both routers mount at `/api/data-sources`. Hono picks the first matching
 * handler in mount order; the public router only registers paths that don't
 * collide with the authed router (`/:provider/authorize`, `/:provider/callback`
 * vs `/status`, `/:provider/sync`, `/:provider`).
 */
export const dataSourcesPublicRouter = new Hono<{ Bindings: Bindings }>();
export const dataSourcesAuthedRouter = new Hono<{ Bindings: Bindings }>();

// ============================================================================
// PUBLIC sub-router (no dev-token required)
// ============================================================================

/**
 * GET /:provider/authorize - generates the OAuth authorize URL + PKCE
 * code_verifier, persists the code_verifier in a short-lived signed cookie,
 * then 302-redirects to the provider's consent screen.
 *
 * Auth NOT required (public - the user triggers this from the /system UI
 * which is itself behind dev-token, but the redirect URL must be hit from
 * the browser without the token header).
 *
 * SECURITY: state parameter HMAC-signed via ENCRYPTION_KEY (10-min freshness).
 */
dataSourcesPublicRouter.get('/:provider/authorize', async (c) => {
  const provider = c.req.param('provider') as ProviderName;
  if (provider !== 'google_health' && provider !== 'spotify')
    return c.json({ error: 'unknown_provider' }, 400);

  // PKCE code_verifier: 32 random bytes, base64url-encoded.
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const codeVerifier = base64UrlEncode(verifierBytes);
  // code_challenge: SHA-256(verifier), base64url.
  const challengeBytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(codeVerifier),
  );
  const codeChallenge = base64UrlEncode(new Uint8Array(challengeBytes));

  const state = await generateOAuthState(provider, c.env);
  const providerImpl = getDataSourceProvider(provider, c.env);
  const { authUrl } = providerImpl.authorize({
    redirectUri: redirectUriFor(provider, c.env),
    state,
    codeChallenge,
  });

  // Persist code_verifier in a short-lived cookie. Path-restricted to the
  // callback route, HttpOnly, Secure, SameSite=Lax (OAuth callback comes
  // from the provider's domain via 302).
  c.header(
    'set-cookie',
    `oauth_cv_${provider}=${codeVerifier}; Path=/api/data-sources/${provider}/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
  );
  return c.redirect(authUrl, 302);
});

/**
 * GET /:provider/callback?code=...&state=... - exchanges code for tokens,
 * encrypts + persists. Auth NOT required (the provider redirects here
 * without our auth header).
 *
 * SECURITY: state parameter validated (HMAC + freshness); code_verifier
 * read from the cookie set in /authorize.
 */
dataSourcesPublicRouter.get('/:provider/callback', async (c) => {
  const provider = c.req.param('provider') as ProviderName;
  if (provider !== 'google_health' && provider !== 'spotify')
    return c.json({ error: 'unknown_provider' }, 400);

  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) return c.json({ error: 'missing_code_or_state' }, 400);

  const verified = await verifyOAuthState(state, c.env);
  if (!verified.ok) return c.json({ error: 'invalid_state', reason: verified.reason }, 400);
  if (verified.provider !== provider) return c.json({ error: 'provider_mismatch' }, 400);

  const cookieHeader = c.req.header('cookie') ?? '';
  const cookieMatch = cookieHeader.match(new RegExp(`oauth_cv_${provider}=([^;]+)`));
  if (!cookieMatch) return c.json({ error: 'missing_code_verifier_cookie' }, 400);
  const codeVerifier = cookieMatch[1]!;

  const providerImpl = getDataSourceProvider(provider, c.env);
  try {
    const tokens = await providerImpl.handleCallback({
      code,
      codeVerifier,
      redirectUri: redirectUriFor(provider, c.env),
    });
    const accessEncrypted = await encrypt(tokens.access_token, c.env);
    const refreshEncrypted = await encrypt(tokens.refresh_token, c.env);
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO data_source_tokens (provider, access_token_encrypted, refresh_token_encrypted, expires_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(provider) DO UPDATE SET
           access_token_encrypted = excluded.access_token_encrypted,
           refresh_token_encrypted = excluded.refresh_token_encrypted,
           expires_at = excluded.expires_at,
           updated_at = datetime('now')`,
      ).bind(provider, accessEncrypted, refreshEncrypted, tokens.expires_at),
      c.env.DB.prepare(
        `UPDATE data_sources SET status = 'connected', error_message = NULL WHERE provider = ?`,
      ).bind(provider),
    ]);

    // Clear the code_verifier cookie.
    c.header(
      'set-cookie',
      `oauth_cv_${provider}=; Path=/api/data-sources/${provider}/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    );

    // Redirect back to the web app's /system page so the user sees success.
    // The first WEB_ORIGIN entry is the canonical web app URL.
    const webBase = allowedWebOrigins(c.env)[0];
    if (!webBase) {
      return c.json({ ok: true, connected: provider, note: 'WEB_ORIGIN is not set' });
    }
    return c.redirect(`${webBase}/system?connected=${provider}`, 302);
  } catch (err) {
    console.error('[callback] token exchange failed:', err);
    return c.json(
      { error: 'token_exchange_failed', message: err instanceof Error ? err.message : 'unknown' },
      500,
    );
  }
});

// ============================================================================
// AUTHED sub-router (dev-token enforced by upstream global middleware)
// ============================================================================

/**
 * GET /status - list all data sources with connection status. Auth via the
 * global devTokenMiddleware (mounted at /api/*).
 */
dataSourcesAuthedRouter.get('/status', async (c) => {
  const rows = await getDataSourceStatus(c.env.DB);
  return c.json({ data_sources: rows });
});

/**
 * POST /:provider/sync - manual sync trigger. Dev-token auth (via global
 * middleware). Optional ?date=YYYY-MM-DD for backfilling a specific date;
 * defaults to yesterday UTC (via SystemAgent.syncDataSource).
 */
dataSourcesAuthedRouter.post('/:provider/sync', async (c) => {
  const provider = c.req.param('provider') as ProviderName;
  if (provider !== 'google_health' && provider !== 'spotify')
    return c.json({ error: 'unknown_provider' }, 400);
  const date = c.req.query('date');
  const agent = getAgent(c.env);
  const result = await agent.syncDataSource(provider, date);
  return c.json(result);
});

/**
 * GET /current-listening - list podcast/audiobook library-save events from the
 * last 14 days, with save count per entry and most-recent-save date.
 *
 * NOTE: Despite the route name, this returns SAVE activity, NOT listening time.
 * Spotify exposes no podcast/audiobook play history, so save activity is the
 * best available signal. The route name is kept for client-side stability;
 * the "saved ≠ listened" disclaimers in the format helper + [ READING ] UI
 * subtitle make the semantics explicit.
 *
 * Used by:
 *   - /system [ READING ] UI card
 */
dataSourcesAuthedRouter.get('/current-listening', async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const items = await getCurrentLibrarySaves(c.env.DB, today, 14);
  return c.json({ items });
});

/**
 * DELETE /:provider - disconnect. Hard-deletes the token row, marks status
 * disconnected. Historical daily_metrics rows are preserved by design (the
 * user's metric history survives disconnect/reconnect cycles).
 */
dataSourcesAuthedRouter.delete('/:provider', async (c) => {
  const provider = c.req.param('provider') as ProviderName;
  if (provider !== 'google_health' && provider !== 'spotify')
    return c.json({ error: 'unknown_provider' }, 400);
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM data_source_tokens WHERE provider = ?`).bind(provider),
    c.env.DB.prepare(
      `UPDATE data_sources SET status = 'disconnected', error_message = NULL WHERE provider = ?`,
    ).bind(provider),
  ]);
  return c.json({ ok: true });
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * redirectUriFor - returns the OAuth callback URL for the given provider.
 * Exhaustiveness-checked: adding a new provider type will cause a TypeScript
 * error here if the corresponding env var is not wired.
 */
function redirectUriFor(provider: ProviderName, env: Bindings): string {
  switch (provider) {
    case 'google_health':
      return env.GOOGLE_HEALTH_REDIRECT_URI;
    case 'spotify':
      return env.SPOTIFY_REDIRECT_URI;
    default: {
      const _exhaustive: never = provider;
      throw new Error(`No redirect URI configured for provider: ${_exhaustive as string}`);
    }
  }
}

/**
 * RFC 4648 §5 - base64url (URL-safe base64 without padding). Used for the
 * PKCE code_verifier + code_challenge. Workers globals lack Buffer; the
 * String.fromCharCode + btoa path is the portable Workers-friendly path.
 */
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
