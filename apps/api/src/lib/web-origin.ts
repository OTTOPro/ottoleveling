/**
 * Origins allowed by CORS, also used as the redirect target after OAuth.
 * WEB_ORIGIN (comma-separated) is the source of truth. Outside production the
 * local Vite dev server is allowed too, so a fresh clone works without config.
 */
export function allowedWebOrigins(env: { WEB_ORIGIN?: string; ENV: string }): string[] {
  const list = (env.WEB_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (env.ENV !== 'production') list.push('http://localhost:5173');
  return list;
}
