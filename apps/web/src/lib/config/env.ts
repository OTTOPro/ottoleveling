/**
 * Public configuration from PUBLIC_* variables (apps/web/.env.local in
 * development, the Pages project's environment variables in production).
 *
 * $env/dynamic/public rather than $env/static/public: a fresh clone without
 * an .env file still type-checks and builds, and a missing value is simply
 * undefined.
 */
import { env } from '$env/dynamic/public';

function str(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

/** True under `vite dev`. */
export const IS_DEV = import.meta.env.DEV;

/** Base URL of the API Worker. Defaults to the local wrangler dev server in development. */
export const API_BASE: string = str(env.PUBLIC_API_BASE) ?? (IS_DEV ? 'http://localhost:8787' : '');

/** Name shown in the Today header. */
export const PLAYER_NAME: string = str(env.PUBLIC_PLAYER_NAME) ?? 'Player';

/**
 * Development-only shared token, sent as x-dev-token when no Cloudflare
 * Access JWT is present. Ignored in production builds.
 */
export const DEV_TOKEN: string | undefined = IS_DEV ? str(env.PUBLIC_DEV_TOKEN) : undefined;
