/**
 * Client-side store for the Cloudflare Access JWT.
 *
 * The JWT is seeded on first page load from the root +layout.server.ts
 * (which reads it via the server hook from the CF_Authorization cookie).
 * It persists for the client-side session; apiFetch reads it and sends
 * it as the Authorization bearer token.
 *
 * Fix (JWT race): exposes a `ready` Promise that resolves after the first
 * call to `seed()` (from the root layout's $effect.pre). apiFetch awaits
 * this promise before reading the JWT so page-level onMount calls don't
 * race with the layout seeding.
 */

let _jwt: string | null = null;
let _seeded = false;
let _resolveReady: (() => void) | null = null;
// Resolves after the first seed() call regardless of whether jwt is null.
const _ready: Promise<void> = new Promise<void>((resolve) => {
  _resolveReady = resolve;
});

export const accessJwtStore = {
  /**
   * Called from root +layout.svelte ($effect.pre) with the server-supplied
   * JWT. May be called multiple times on navigation; subsequent calls update
   * the JWT but the ready promise stays resolved.
   */
  seed(jwt: string | null): void {
    _jwt = jwt;
    if (!_seeded) {
      _seeded = true;
      _resolveReady?.();
    }
  },

  /** Returns the cached JWT or null if not set / not available. */
  get(): string | null {
    return _jwt;
  },

  /**
   * Awaitable gate used by apiFetch. Resolves after the first seed() call
   * so component onMount fetches don't race with the layout seeding.
   */
  ready(): Promise<void> {
    return _ready;
  },

  /** Clears the stored JWT (e.g., on logout or after a 401 from the Worker). */
  clear(): void {
    _jwt = null;
  },
};
