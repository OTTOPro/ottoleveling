import type { ProviderName } from './types';

/**
 * Token encryption and OAuth state signing.
 *
 * ENCRYPTION_KEY (32 random bytes, base64) is never used directly. HKDF-SHA-256
 * derives two independent sub-keys from it: one for AES-GCM token encryption,
 * one for the HMAC that signs OAuth `state` values. A weakness in one use can
 * then not leak into the other.
 *
 * Stored format: `v1:<base64 iv>:<base64 ciphertext+tag>`. The provider name
 * is bound to the ciphertext as AES-GCM additional data, so a token copied to
 * another provider's row fails to decrypt. Values written before versioning
 * (`<iv>:<ciphertext>`, raw key, no additional data) are still readable, so
 * existing connections keep working; they are rewritten in the new format the
 * next time the tokens are refreshed.
 */

const FORMAT_V1 = 'v1';
const HKDF_SALT = new TextEncoder().encode('ottoleveling');
const INFO_AES = 'token-encryption-v1';
const INFO_HMAC = 'oauth-state-v1';

type KeyEnv = { ENCRYPTION_KEY: string };

/**
 * Decodes a standard base64 string. Workers have no Buffer; atob plus a
 * Uint8Array is the portable path.
 */
function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
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

function rawMasterKey(env: KeyEnv): Uint8Array<ArrayBuffer> {
  const raw = base64ToBytes(env.ENCRYPTION_KEY);
  if (raw.byteLength !== 32) {
    throw new Error(`ENCRYPTION_KEY must decode to 32 bytes (got ${raw.byteLength})`);
  }
  return raw;
}

async function deriveKey(
  env: KeyEnv,
  info: string,
  algorithm: { name: string; length: number; hash?: string },
  usages: string[],
): Promise<CryptoKey> {
  const master = await crypto.subtle.importKey('raw', rawMasterKey(env), 'HKDF', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: new TextEncoder().encode(info) },
    master,
    algorithm,
    false,
    usages,
  );
}

function aesKey(env: KeyEnv): Promise<CryptoKey> {
  return deriveKey(env, INFO_AES, { name: 'AES-GCM', length: 256 }, ['encrypt', 'decrypt']);
}

function hmacKey(env: KeyEnv): Promise<CryptoKey> {
  return deriveKey(env, INFO_HMAC, { name: 'HMAC', hash: 'SHA-256', length: 256 }, [
    'sign',
    'verify',
  ]);
}

/** Pre-versioning key: the raw master key, imported as-is. Decrypt only. */
function legacyAesKey(env: KeyEnv): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', rawMasterKey(env), { name: 'AES-GCM' }, false, ['decrypt']);
}

/**
 * AES-GCM-256 encrypt, bound to `provider`. A fresh 12-byte IV per call
 * (the NIST recommendation for GCM).
 */
export async function encrypt(
  plaintext: string,
  env: KeyEnv,
  provider: ProviderName,
): Promise<string> {
  const key = await aesKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(provider) },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${FORMAT_V1}:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(ct))}`;
}

/**
 * Decrypts a stored value for `provider`. Throws if the ciphertext was
 * tampered with, belongs to another provider, or is malformed.
 */
export async function decrypt(blob: string, env: KeyEnv, provider: ProviderName): Promise<string> {
  const parts = blob.split(':');
  if (parts.length === 3 && parts[0] === FORMAT_V1) {
    const pt = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64ToBytes(parts[1]!),
        additionalData: new TextEncoder().encode(provider),
      },
      await aesKey(env),
      base64ToBytes(parts[2]!),
    );
    return new TextDecoder().decode(pt);
  }
  if (parts.length === 2) {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(parts[0]!) },
      await legacyAesKey(env),
      base64ToBytes(parts[1]!),
    );
    return new TextDecoder().decode(pt);
  }
  throw new Error('encrypted value malformed (expected v1:iv:ciphertext)');
}

/** True when a stored value predates the v1 format and should be rewritten. */
export function isLegacyCiphertext(blob: string): boolean {
  return !blob.startsWith(`${FORMAT_V1}:`);
}

/**
 * Generates a stateless OAuth state parameter:
 *   `${provider}:${timestamp_ms}:${nonce_hex}:${hmac_hex}`
 * HMAC-SHA-256 over the first three fields with the derived HMAC sub-key.
 * The nonce is 16 random bytes.
 */
export async function generateOAuthState(provider: ProviderName, env: KeyEnv): Promise<string> {
  const timestamp = Date.now();
  const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `${provider}:${timestamp}:${nonce}`;
  const sig = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(env),
    new TextEncoder().encode(payload),
  );
  return `${payload}:${bytesToHex(new Uint8Array(sig))}`;
}

export type VerifyOAuthStateResult =
  | { ok: true; provider: ProviderName; timestamp: number }
  | { ok: false; reason: 'malformed' | 'bad_hmac' | 'expired' };

/**
 * Validates a state parameter: HMAC first (constant time, via
 * crypto.subtle.verify), then freshness. Default window 600 seconds.
 * maxAgeSeconds=0 rejects everything, which tests use to reach the expiry path.
 */
export async function verifyOAuthState(
  state: string,
  env: KeyEnv,
  maxAgeSeconds: number = 600,
): Promise<VerifyOAuthStateResult> {
  const parts = state.split(':');
  if (parts.length !== 4) return { ok: false, reason: 'malformed' };
  const [provider, tsStr, nonce, sigHex] = parts as [string, string, string, string];
  if (!provider || !tsStr || !nonce || !sigHex) return { ok: false, reason: 'malformed' };
  const timestamp = Number(tsStr);
  if (!Number.isFinite(timestamp)) return { ok: false, reason: 'malformed' };
  if (!/^[0-9a-f]+$/i.test(sigHex) || sigHex.length % 2 !== 0)
    return { ok: false, reason: 'malformed' };
  const payload = `${provider}:${timestamp}:${nonce}`;
  const sigBytes = new Uint8Array(sigHex.length / 2);
  for (let i = 0; i < sigBytes.length; i++) {
    sigBytes[i] = parseInt(sigHex.slice(i * 2, i * 2 + 2), 16);
  }
  const ok = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(env),
    sigBytes,
    new TextEncoder().encode(payload),
  );
  if (!ok) return { ok: false, reason: 'bad_hmac' };
  if (Date.now() - timestamp >= maxAgeSeconds * 1000) return { ok: false, reason: 'expired' };
  // Only generateOAuthState can produce a valid HMAC, and it only accepts a
  // ProviderName, so the cast is safe.
  return { ok: true, provider: provider as ProviderName, timestamp };
}
