import { describe, it, expect } from 'vitest';
import {
  encrypt,
  decrypt,
  generateOAuthState,
  verifyOAuthState,
  isLegacyCiphertext,
} from '../../src/lib/data-sources/encryption';

// 32-zero-byte base64 - deterministic key for tests
const STUB_ENV = {
  ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
} as unknown as { ENCRYPTION_KEY: string };

describe('encrypt / decrypt - Web Crypto AES-GCM-256', () => {
  it('encrypt then decrypt returns the original plaintext', async () => {
    const plaintext = 'my-secret-oauth-access-token';
    const blob = await encrypt(plaintext, STUB_ENV, 'google_health');
    const recovered = await decrypt(blob, STUB_ENV, 'google_health');
    expect(recovered).toBe(plaintext);
  });

  it('encrypt produces a blob in the format v1:base64(iv):base64(ciphertext)', async () => {
    const blob = await encrypt('hello', STUB_ENV, 'google_health');
    expect(blob).toMatch(/^v1:[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/);
    const parts = blob.split(':');
    expect(parts).toHaveLength(3);
    // 12-byte IV: 16 base64 characters
    expect(parts[1]!.length).toBe(16);
    expect(parts[2]!.length).toBeGreaterThan(0);
  });

  it('encrypting the same plaintext twice produces different blobs (IV randomness)', async () => {
    const a = await encrypt('same input', STUB_ENV, 'google_health');
    const b = await encrypt('same input', STUB_ENV, 'google_health');
    expect(a).not.toBe(b);
    expect(await decrypt(a, STUB_ENV, 'google_health')).toBe('same input');
    expect(await decrypt(b, STUB_ENV, 'google_health')).toBe('same input');
  });

  it('decrypt rejects a tampered ciphertext (AES-GCM auth tag)', async () => {
    const blob = await encrypt('original', STUB_ENV, 'google_health');
    const [version, iv, ct] = blob.split(':');
    // Replace the last base64 characters of the ciphertext (and its tag)
    const tampered = `${version}:${iv}:${ct!.slice(0, -4)}AAAA`;
    await expect(decrypt(tampered, STUB_ENV, 'google_health')).rejects.toThrow();
  });

  it('decrypt rejects a blob with the wrong format (missing colon)', async () => {
    await expect(decrypt('not-a-valid-blob', STUB_ENV, 'google_health')).rejects.toThrow();
  });

  it('encrypt + decrypt roundtrip for long plaintext (8KB)', async () => {
    const long = 'x'.repeat(8 * 1024);
    const blob = await encrypt(long, STUB_ENV, 'google_health');
    expect(await decrypt(blob, STUB_ENV, 'google_health')).toBe(long);
  });

  it('encrypt + decrypt roundtrip for unicode strings', async () => {
    const unicode = '🔐 secret: アクセス';
    const blob = await encrypt(unicode, STUB_ENV, 'google_health');
    expect(await decrypt(blob, STUB_ENV, 'google_health')).toBe(unicode);
  });
});

describe('generateOAuthState / verifyOAuthState - HMAC-SHA-256', () => {
  it('generate → verify returns ok=true and the original provider', async () => {
    const state = await generateOAuthState('google_health', STUB_ENV);
    const result = await verifyOAuthState(state, STUB_ENV);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.provider).toBe('google_health');
  });

  it('verify rejects a state with a tampered HMAC', async () => {
    const state = await generateOAuthState('google_health', STUB_ENV);
    const tampered = state.slice(0, -1) + (state.slice(-1) === 'a' ? 'b' : 'a');
    const result = await verifyOAuthState(tampered, STUB_ENV);
    expect(result.ok).toBe(false);
  });

  it('verify rejects a state older than the freshness window (default 10 min)', async () => {
    const oldState = await generateOAuthState('google_health', STUB_ENV);
    // Force "stale": pass a 1-second freshness window so a real-time check
    // 2 seconds later (via setTimeout in real tests) fails. Use a synthetic
    // injected timestamp by validating with maxAgeSeconds=0.
    const result = await verifyOAuthState(oldState, STUB_ENV, 0);
    expect(result.ok).toBe(false);
  });

  it('verify rejects a state with malformed structure', async () => {
    const result = await verifyOAuthState('garbage', STUB_ENV);
    expect(result.ok).toBe(false);
  });

  it('verify rejects an empty state', async () => {
    const result = await verifyOAuthState('', STUB_ENV);
    expect(result.ok).toBe(false);
  });

  it('generated state encodes the provider name (recoverable via verify)', async () => {
    const state = await generateOAuthState('google_health', STUB_ENV);
    const result = await verifyOAuthState(state, STUB_ENV);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.provider).toBe('google_health');
  });
});

describe('encryption format and key separation', () => {
  it('writes the v1 format', async () => {
    const blob = await encrypt('hello', STUB_ENV, 'google_health');
    expect(blob.startsWith('v1:')).toBe(true);
    expect(blob.split(':')).toHaveLength(3);
    expect(isLegacyCiphertext(blob)).toBe(false);
  });

  it('binds the ciphertext to its provider', async () => {
    const blob = await encrypt('token', STUB_ENV, 'google_health');
    await expect(decrypt(blob, STUB_ENV, 'spotify')).rejects.toThrow();
  });

  it('still reads values written before versioning (raw key, no additional data)', async () => {
    const raw = Uint8Array.from(atob(STUB_ENV.ENCRYPTION_KEY), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode('old-token'),
    );
    const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
    const legacy = `${b64(iv)}:${b64(new Uint8Array(ct))}`;
    expect(isLegacyCiphertext(legacy)).toBe(true);
    expect(await decrypt(legacy, STUB_ENV, 'spotify')).toBe('old-token');
  });

  it('does not encrypt with the raw master key any more', async () => {
    const blob = await encrypt('secret', STUB_ENV, 'spotify');
    const [, ivB64, ctB64] = blob.split(':');
    const raw = Uint8Array.from(atob(STUB_ENV.ENCRYPTION_KEY), (c) => c.charCodeAt(0));
    const rawKey = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
      'decrypt',
    ]);
    const bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    await expect(
      crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: bytes(ivB64!), additionalData: new TextEncoder().encode('spotify') },
        rawKey,
        bytes(ctB64!),
      ),
    ).rejects.toThrow();
  });

  it('signs OAuth state with a key that differs from the raw master key', async () => {
    const state = await generateOAuthState('spotify', STUB_ENV);
    const [p, ts, nonce, sig] = state.split(':') as [string, string, string, string];
    const raw = Uint8Array.from(atob(STUB_ENV.ENCRYPTION_KEY), (c) => c.charCodeAt(0));
    const rawHmac = await crypto.subtle.importKey(
      'raw',
      raw,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const rawSig = new Uint8Array(
      await crypto.subtle.sign('HMAC', rawHmac, new TextEncoder().encode(`${p}:${ts}:${nonce}`)),
    );
    const rawHex = Array.from(rawSig, (b) => b.toString(16).padStart(2, '0')).join('');
    expect(sig).not.toBe(rawHex);
  });
});
