/**
 * Thin wrapper around the Web Push library. The public surface is
 * `sendWebPush(args): Promise<SendPushResult>` regardless of which underlying
 * implementation is wired (library or custom RFC 8291). Callers depend on
 * this file only.
 *
 * Result semantics:
 * - 410 Gone → result.gone = true; caller deletes the subscription.
 * - 429 / 5xx / 401 → result.ok = false with status + reason; caller logs.
 *
 * Library: @jsr/negrel__webpush (installed via the JSR npm shim; the package
 * is on JSR, not NPM). The library
 * uses globalThis.crypto.subtle - fully Workers-compatible, no node:crypto.
 *
 * VAPID key handling: the library expects a CryptoKeyPair for `vapidKeys`,
 * not raw base64url strings. Our env stores base64url (the standard format
 * `npx web-push generate-vapid-keys` produces). We convert at the boundary
 * via `vapidB64ToJwk` + `webpush.importVapidKeys()`. Sub-ms overhead per call.
 *
 * If the library's API surface ever drifts, fix HERE - keep the public
 * SendPushArgs / SendPushResult shape stable so callers don't ripple.
 */

import * as webpush from '@jsr/negrel__webpush';

export interface SendPushArgs {
  endpoint: string;
  p256dh: string;
  auth: string;
  payload: string; // already-stringified JSON. We don't enforce a schema here; caller does.
  vapid: {
    publicKey: string; // base64url-encoded uncompressed P-256 point (65 bytes)
    privateKey: string; // base64url-encoded 32-byte P-256 scalar
    subject: string; // e.g. 'mailto:you@example.com'
  };
  ttlSeconds?: number; // default 60 - short TTL: if the user-agent is offline, we don't queue stale notifs
}

export type SendPushResult =
  | { ok: true; status: number }
  | { ok: false; status: number; gone: boolean; reason: string };

export async function sendWebPush(args: SendPushArgs): Promise<SendPushResult> {
  try {
    // 1. Convert raw base64url VAPID keys to a pair of JWKs + import as
    //    CryptoKeyPair. The library's importVapidKeys takes ExportedVapidKeys
    //    ({publicKey: JsonWebKey; privateKey: JsonWebKey}) and returns a
    //    CryptoKeyPair (ECDSA P-256 for VAPID JWT signing).
    const exportedVapid = vapidB64ToExported(args.vapid.publicKey, args.vapid.privateKey);
    const vapidKeys = await webpush.importVapidKeys(exportedVapid);

    // 2. Construct the application server (generates a fresh per-call ECDH
    //    keypair internally - that's the encryption keypair, separate from
    //    the VAPID auth keypair).
    const applicationServer = await webpush.ApplicationServer.new({
      contactInformation: args.vapid.subject,
      vapidKeys,
    });

    // 3. Subscribe to the user-agent's push endpoint. (The library's
    //    PushSubscription type has no expirationTime field - only
    //    endpoint + keys.)
    const subscriber = applicationServer.subscribe({
      endpoint: args.endpoint,
      keys: {
        p256dh: args.p256dh,
        auth: args.auth,
      },
    });

    // 4. Push the payload. The library encrypts (AES-128-GCM per RFC 8291)
    //    + signs the VAPID JWT + POSTs to the endpoint. Returns void on
    //    success; throws PushMessageError on HTTP failure. We synthesize
    //    a 201 status to expose to callers (push services return 201
    //    Created on accepted delivery).
    await subscriber.pushTextMessage(args.payload, {
      ttl: args.ttlSeconds ?? 60,
      urgency: webpush.Urgency.Normal,
    });

    return { ok: true, status: 201 };
  } catch (err: unknown) {
    // The library uses PushMessageError for HTTP failures (it exposes
    // .response: Response and .isGone() for the 410 signal). Other errors
    // (crypto/config/network) come through as plain Error instances.
    let status = 0;
    let gone = false;
    if (err && typeof err === 'object') {
      if ('response' in err) {
        const resp = (err as { response: unknown }).response;
        if (
          resp &&
          typeof resp === 'object' &&
          'status' in resp &&
          typeof (resp as { status: unknown }).status === 'number'
        ) {
          status = (resp as { status: number }).status;
        }
      }
      if ('isGone' in err && typeof (err as { isGone: unknown }).isGone === 'function') {
        try {
          gone = (err as { isGone: () => boolean }).isGone() === true;
        } catch {
          /* ignore */
        }
      }
    }
    if (status === 410) gone = true;
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, status, gone, reason };
  }
}

/**
 * Convert raw base64url VAPID keys (the format `npx web-push generate-vapid-keys`
 * outputs) to the `ExportedVapidKeys` shape `webpush.importVapidKeys()` expects
 * (two JWKs: one public, one private - Web Crypto's importKey wants `d` on the
 * private JWK and no `d` on the public JWK).
 *
 * Public key input: 65-byte uncompressed P-256 point as base64url
 *   (byte 0 = 0x04 marker; bytes 1..33 = x; bytes 33..65 = y)
 * Private key input: 32-byte P-256 scalar as base64url (already the JWK `d` value)
 */
function vapidB64ToExported(
  publicKeyB64: string,
  privateKeyB64: string,
): { publicKey: JsonWebKey; privateKey: JsonWebKey } {
  const pub = decodeBase64Url(publicKeyB64);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error(
      `Invalid VAPID public key: expected 65-byte uncompressed P-256 point, got ${pub.length} bytes (byte0=${pub[0]})`,
    );
  }
  const x = encodeBase64Url(pub.slice(1, 33));
  const y = encodeBase64Url(pub.slice(33, 65));
  const publicKey: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x,
    y,
  };
  const privateKey: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x,
    y,
    d: privateKeyB64, // already base64url; JWK `d` keeps that encoding
  };
  return { publicKey, privateKey };
}

function decodeBase64Url(b64url: string): Uint8Array {
  const padding = '='.repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const binStr = atob(b64);
  const out = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) out[i] = binStr.charCodeAt(i);
  return out;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
