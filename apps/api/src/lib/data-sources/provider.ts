import type { DailyMetric, ProviderName, TokenSet } from './types';

/**
 * Swappable boundary for external data source integrations. Implemented by
 * GoogleHealthProvider and SpotifyProvider. Production registry uses globalThis.fetch; tests inject stubs.
 */
export interface DataSourceProvider {
  readonly name: ProviderName;

  /**
   * Builds the OAuth authorize URL. The state parameter must already be
   * HMAC-signed by the caller (see encryption.ts generateOAuthState).
   * Returns the authUrl; the caller persists codeVerifier separately
   * (in a short-lived cookie) for the callback to use.
   */
  authorize(args: {
    redirectUri: string;
    state: string;
    codeChallenge: string; // SHA-256(codeVerifier), base64url
  }): { authUrl: string };

  /**
   * Exchanges an authorization code for a TokenSet. Caller must have already
   * verified the state parameter against the freshness window before calling.
   */
  handleCallback(args: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<TokenSet>;

  /**
   * Refreshes an access token. Used when daily sync hits 401. If refresh
   * itself returns 401, caller marks data_sources.status = 'reauth_required'.
   */
  refreshTokens(refreshToken: string): Promise<TokenSet>;

  /**
   * Pulls daily metrics for the given date. Returns DailyMetric[] (already
   * normalized - no raw provider JSON). Throws on hard errors; per-endpoint
   * failures inside the sync are surfaced via a 'partial' status.
   */
  syncDaily(args: {
    date: string; // YYYY-MM-DD UTC
    accessToken: string;
  }): Promise<DailyMetric[]>;
}
