import type { LayoutServerLoad } from './$types';

/**
 * Surface the Cloudflare Access JWT (extracted by hooks.server.ts
 * from the CF_Authorization cookie) to the client via page data.
 *
 * The root layout runs SSR even though the (app) group has ssr=false.
 * The JWT is seeded into the page data on first render; the client-side
 * JWT store picks it up and caches it for the lifetime of the session.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    accessJwt: locals.accessJwt,
  };
};
