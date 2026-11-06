import type { Bindings } from '../../index';
import { GoogleHealthProvider } from './google-health';
import { SpotifyProvider } from './spotify';
import type { DataSourceProvider } from './provider';
import type { ProviderName } from './types';

/**
 * Factory - maps provider name to a constructed implementation. Production
 * uses globalThis.fetch; tests pass a fetch stub via the optional fetcher
 * argument so unit tests don't hit real APIs.
 */
export function getDataSourceProvider(
  name: ProviderName,
  env: Bindings,
  fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
): DataSourceProvider {
  switch (name) {
    case 'google_health':
      return new GoogleHealthProvider({
        clientId: env.GOOGLE_HEALTH_CLIENT_ID,
        clientSecret: env.GOOGLE_HEALTH_CLIENT_SECRET,
        fetcher,
      });
    case 'spotify':
      return new SpotifyProvider({
        clientId: env.SPOTIFY_CLIENT_ID,
        clientSecret: env.SPOTIFY_CLIENT_SECRET,
        fetcher,
        db: env.DB, // Library-diff requires reading yesterday's snapshot from library_save_events
      });
    default: {
      // Exhaustiveness check - adding a new ProviderName without a case here
      // surfaces as a TypeScript error.
      const _exhaustive: never = name;
      throw new Error(`Unknown data source provider: ${_exhaustive as string}`);
    }
  }
}
