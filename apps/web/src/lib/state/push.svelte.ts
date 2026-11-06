import {
  getVapidPublicKey,
  subscribePush,
  unsubscribePush,
  getPushStatus,
  sendTestPush,
} from '$lib/api/client';

type Permission = NotificationPermission | 'unsupported';

class PushState {
  permission = $state<Permission>('default');
  subscribed = $state(false);
  endpoint = $state<string | null>(null);
  loading = $state(false);
  error = $state<string | null>(null);
  // Set true for 3s after a successful test push send. The
  // PushNotificationToggle component reads this to show "Test sent." text.
  testConfirmation = $state(false);
  private testConfirmTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Check current permission + existing subscription. Call once on /system mount.
   * SSR-safe.
   */
  async init(): Promise<void> {
    if (typeof window === 'undefined') return;
    if (
      !('Notification' in window) ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) {
      this.permission = 'unsupported';
      return;
    }

    this.permission = Notification.permission;

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        this.endpoint = sub.endpoint;
        // Confirm with server that this endpoint is still registered.
        const status = await getPushStatus(sub.endpoint);
        this.subscribed = !!status.subscribed;
      } else {
        this.subscribed = false;
        this.endpoint = null;
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  async enable(): Promise<void> {
    if (typeof window === 'undefined') return;
    this.loading = true;
    this.error = null;
    try {
      // 0. Pre-flight iOS standalone check. iOS Safari requires the
      // PWA to be installed (Add to Home Screen) before push subscription works.
      // If the user is on iOS in a regular Safari tab, surface a clear message
      // BEFORE attempting to subscribe (otherwise navigator.serviceWorker.ready
      // hangs or pushManager.subscribe throws a confusing error).
      if (isIos() && !isStandalonePwa()) {
        this.error =
          'Notifications require this app to be opened from your home screen. ' +
          'Tap Share → Add to Home Screen in Safari, then reopen OttoLeveling from the icon.';
        return;
      }

      // 1. Request permission. If user denies, surface it.
      const perm = await Notification.requestPermission();
      this.permission = perm;
      if (perm !== 'granted') {
        this.error =
          perm === 'denied'
            ? 'Permission denied. Re-enable in browser settings.'
            : 'Permission not granted.';
        return;
      }

      // 2. Fetch VAPID public key from server.
      const vapidKeyB64 = await getVapidPublicKey();

      // 3. Subscribe via the service worker's PushManager.
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast: TS lib types Uint8Array as Uint8Array<ArrayBufferLike>, but
        // applicationServerKey requires BufferSource (ArrayBufferView<ArrayBuffer>).
        applicationServerKey: urlBase64ToUint8Array(vapidKeyB64) as BufferSource,
      });

      // 4. POST the subscription to the server.
      const subJson = sub.toJSON();
      if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
        throw new Error(
          'Subscription is missing required fields (endpoint / keys.p256dh / keys.auth)',
        );
      }
      await subscribePush({
        endpoint: subJson.endpoint,
        keys: { p256dh: subJson.keys.p256dh, auth: subJson.keys.auth },
      });

      this.subscribed = true;
      this.endpoint = sub.endpoint;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  async disable(): Promise<void> {
    if (typeof window === 'undefined') return;
    this.loading = true;
    this.error = null;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await unsubscribePush(sub.endpoint);
      }
      this.subscribed = false;
      this.endpoint = null;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  /**
   * Fire a test notification to ALL subscriptions (not just
   * the current device). Sets testConfirmation=true for 3 seconds so the
   * UI shows "Test sent. Check your device.".
   */
  async sendTest(type: 'daily' | 'weekly'): Promise<void> {
    if (typeof window === 'undefined') return;
    this.loading = true;
    this.error = null;
    try {
      await sendTestPush(type);
      this.testConfirmation = true;
      if (this.testConfirmTimer != null) clearTimeout(this.testConfirmTimer);
      this.testConfirmTimer = setTimeout(() => {
        this.testConfirmation = false;
        this.testConfirmTimer = null;
      }, 3000);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }
}

/**
 * Best-effort iOS detection. False negatives (spoofed UAs) just don't see
 * the hint - they can still subscribe.
 */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  // /iPad|iPhone|iPod/.test handles classic iOS. iPadOS 13+ reports as Mac;
  // detect via touch-enabled Mac UA as a secondary check.
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  if (navigator.userAgent.includes('Macintosh') && 'ontouchend' in document) return true;
  return false;
}

/**
 * Detects whether the page is running as an installed PWA (Add-to-Home-Screen
 * on iOS, or `display: standalone` on Chrome/Edge). enable() uses this BEFORE
 * the Enable flow to short-circuit on iOS-tab attempts.
 *
 * iOS Safari sets the non-standard `navigator.standalone` boolean when the
 * page was launched from the home screen. Other browsers use the CSS media
 * query `(display-mode: standalone)`.
 */
export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  // iOS Safari home-screen launch - non-standard property.
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  // Other browsers - display-mode media query.
  if (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  ) {
    return true;
  }
  return false;
}

/**
 * Convert a base64url-encoded VAPID public key to the Uint8Array form that
 * PushManager.subscribe expects.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export const pushState = new PushState();
