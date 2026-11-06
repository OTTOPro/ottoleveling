/**
 * Animation feature toggles.
 *
 * Each constant gates a specific animation. Set to `false` to disable
 * without code refactor - useful for fatigue days or if an animation proves
 * intrusive after real-world use. Components read these constants directly
 * and skip the animation when false (no-op, instant state change).
 *
 * If you want to disable ALL animations globally (e.g., for accessibility),
 * prefer the OS-level `prefers-reduced-motion` media query - it auto-syncs
 * across apps. See $lib/state/motion-preferences.svelte.ts.
 */

export const ENABLE_QUEST_STAGGER = true;
export const ENABLE_COMPLETION_CROSSFADE = true;
export const ENABLE_LEVEL_UP_ANIMATION = true;
export const ENABLE_SYSTEM_NOTIFICATION_PULSE = true;
// Reserved for future icon-only animations; no current consumer.
export const ENABLE_PILLAR_ICON_TINTS = true;
