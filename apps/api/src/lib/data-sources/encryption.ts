import type { ProviderName } from './types';

/**
 * Decodes a standard base64 string to Uint8Array. Workers globals lack
 * Buffer; atob + Uint8Array is the portable Workers-friendly path.
 */
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function importAesKey(env: { ENCRYPTION_KEY: string }): Promise<CryptoKey> {
  const raw = base64ToBytes(env.ENCRYPTION_KEY);
  if (raw.byteLength !== 32) {
    throw new Error(`ENCRYPTION_KEY must decode to 32 bytes (got ${raw.byteLength})`);
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function importHmacKey(env: { ENCRYPTION_KEY: string }): Promise<CryptoKey> {
  const raw = base64ToBytes(env.ENCRYPTION_KEY);
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

/**
 * AES-GCM-256 encrypt. Returns base64(iv):base64(ciphertext+authtag).
 * IV is 12 random bytes per encryption (NIST GCM recommendation).
 */
export async function encrypt(plaintext: string, env: { ENCRYPTION_KEY: string }): Promise<string> {
  const key = await importAesKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = new TextEncoder().encode(plaintext);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt);
  return `${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(ct))}`;
}

/**
 * AES-GCM-256 decrypt. Throws on tampered ciphertext (auth tag failure)
 * OR malformed input.
 */
export async function decrypt(blob: string, env: { ENCRYPTION_KEY: string }): Promise<string> {
  const parts = blob.split(':');
  if (parts.length !== 2) throw new Error('encrypted blob malformed (expected iv:ciphertext)');
  const iv = base64ToBytes(parts[0]!);
  const ct = base64ToBytes(parts[1]!);
  const key = await importAesKey(env);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

/**
 * Generates a stateless OAuth state parameter:
 *   `${provider}:${timestamp_ms}:${nonce_hex}:${hmac_hex}`
 * HMAC-SHA-256 over the first 3 fields. nonce is 16 random bytes.
 * verifyOAuthState validates HMAC + freshness window.
 */
export async function generateOAuthState(
  provider: ProviderName,
  env: { ENCRYPTION_KEY: string },
): Promise<string> {
  const timestamp = Date.now();
  const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `${provider}:${timestamp}:${nonce}`;
  const key = await importHmacKey(env);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return `${payload}:${bytesToHex(new Uint8Array(sig))}`;
}

export type VerifyOAuthStateResult =
  | { ok: true; provider: ProviderName; timestamp: number }
  | { ok: false; reason: 'malformed' | 'bad_hmac' | 'expired' };

/**
 * Validates a state parameter. Returns {ok:true, provider, timestamp} on success;
 * {ok:false, reason} on any failure. Default freshness window 600 seconds (10 min).
 * Pass maxAgeSeconds=0 to test the expiry path with synthetic time.
 */
export async function verifyOAuthState(
  state: string,
  env: { ENCRYPTION_KEY: string },
  maxAgeSeconds: number = 600,
): Promise<VerifyOAuthStateResult> {
  const parts = state.split(':');
  if (parts.length !== 4) return { ok: false, reason: 'malformed' };
  const [provider, tsStr, nonce, sigHex] = parts as [string, string, string, string];
  if (!provider || !tsStr || !nonce || !sigHex) return { ok: false, reason: 'malformed' };
  const timestamp = Number(tsStr);
  if (!Number.isFinite(timestamp)) return { ok: false, reason: 'malformed' };
  const payload = `${provider}:${timestamp}:${nonce}`;
  const key = await importHmacKey(env);
  const sigBytes = new Uint8Array(sigHex.length / 2);
  for (let i = 0; i < sigBytes.length; i++) {
    sigBytes[i] = parseInt(sigHex.slice(i * 2, i * 2 + 2), 16);
  }
  const ok = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(payload));
  if (!ok) return { ok: false, reason: 'bad_hmac' };
  const ageMs = Date.now() - timestamp;
  // Use >= so maxAgeSeconds=0 actually rejects same-tick states (used by tests
  // to force the expiry path without sleep). With > a state generated in the
  // same JS tick would have ageMs=0 and pass, which violates the "0 means
  // never accept" semantic.
  if (ageMs >= maxAgeSeconds * 1000) return { ok: false, reason: 'expired' };
  // The cast is safe because providers are namespaced + signed; the only way to
  // get a valid HMAC is from generateOAuthState which only accepts ProviderName.
  return { ok: true, provider: provider as ProviderName, timestamp };
}
