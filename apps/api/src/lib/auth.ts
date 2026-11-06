import type { MiddlewareHandler } from 'hono';

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export interface DevTokenEnv {
  DEV_TOKEN: string;
}

export function devTokenMiddleware(): MiddlewareHandler<{
  Bindings: DevTokenEnv;
}> {
  return async (c, next) => {
    const provided = c.req.header('x-dev-token');
    const expected = c.env.DEV_TOKEN;
    if (!provided || !expected || !timingSafeEqual(provided, expected)) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    await next();
  };
}
