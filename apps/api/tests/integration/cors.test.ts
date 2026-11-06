import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

describe('CORS preflight', () => {
  it('allows preflight from the configured WEB_ORIGIN without requiring x-dev-token', async () => {
    const res = await SELF.fetch(
      new Request('http://localhost/api/objectives', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://web.example.test',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type, x-dev-token',
        },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://web.example.test');
    const allowHeaders = res.headers.get('access-control-allow-headers') ?? '';
    expect(allowHeaders.toLowerCase()).toContain('x-dev-token');
    expect(allowHeaders.toLowerCase()).toContain('content-type');
    const allowMethods = res.headers.get('access-control-allow-methods') ?? '';
    expect(allowMethods.toUpperCase()).toContain('POST');
    expect(allowMethods.toUpperCase()).toContain('OPTIONS');
  });

  it('allows preflight from localhost dev origin', async () => {
    const res = await SELF.fetch(
      new Request('http://localhost/api/objectives', {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'GET',
        },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  it('does not echo allow-origin for disallowed origins', async () => {
    const res = await SELF.fetch(
      new Request('http://localhost/api/objectives', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://evil.example.com',
          'Access-Control-Request-Method': 'POST',
        },
      }),
    );
    // CORS middleware should NOT echo the disallowed origin.
    expect(res.headers.get('access-control-allow-origin')).not.toBe('https://evil.example.com');
  });

  it('sets allow-origin on actual (non-preflight) GET response', async () => {
    const res = await SELF.fetch(
      new Request('http://localhost/api/objectives', {
        headers: {
          Origin: 'https://web.example.test',
          'x-dev-token': 'integration-test-token-deadbeef',
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://web.example.test');
  });
});
