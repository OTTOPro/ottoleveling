import type { Handle } from '@sveltejs/kit';

/**
 * Read the Cloudflare Access JWT from the CF_Authorization cookie on every
 * server request and inject it into event.locals so the root
 * +layout.server.ts can surface it to the client.
 *
 * CF_Authorization is set by Cloudflare Access when the user visits the
 * Pages app behind Access.
 * It is HttpOnly, so JS cannot read it directly - the server hook is the
 * correct extraction point.
 */
export const handle: Handle = async ({ event, resolve }) => {
  const jwt = event.cookies.get('CF_Authorization') ?? null;
  event.locals.accessJwt = jwt;
  return resolve(event);
};
