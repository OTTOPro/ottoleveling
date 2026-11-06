/**
 * Tracks the user's prefers-reduced-motion OS preference.
 *
 * Reads `window.matchMedia('(prefers-reduced-motion: reduce)').matches` on
 * construction + subscribes to `change` events so runtime preference flips
 * (e.g., user toggles "Reduce motion" in macOS Accessibility) propagate
 * without page reload.
 *
 * SSR-safe: returns `reduced=false` on the server. The `(app)` route group
 * has SSR off but the defensive guard is cheap.
 *
 * Usage in components:
 *   import { motionPreferences } from '$lib/state/motion-preferences.svelte';
 *   // As a duration override (animation still mounts, runs instantly):
 *   in:fly={{ duration: motionPreferences.reduced ? 0 : 350, ... }}
 *   // Or as a class guard:
 *   class:level-up-pulse={leveledUp.has(id) && !motionPreferences.reduced}
 */

class MotionPreferences {
  reduced = $state(false);

  constructor() {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reduced = mq.matches;
    mq.addEventListener('change', (e: MediaQueryListEvent) => {
      this.reduced = e.matches;
    });
  }
}

export const motionPreferences = new MotionPreferences();
