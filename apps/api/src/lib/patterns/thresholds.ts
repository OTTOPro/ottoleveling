/**
 * Empirical thresholds for pattern detection + lifecycle policy.
 *
 * IMPORTANT: these values are first-pass guesses. After 4-6 weeks of real
 * usage, tune based on observed patterns (under-firing → lower thresholds;
 * noise → raise). Keep changes here so tuning is a single-file edit.
 *
 * Tests import these constants (NOT hardcoded numbers) so a threshold change
 * doesn't silently invalidate test scenarios - the test still hits the same
 * boundary case relative to the constant.
 */

// ----- Detection thresholds -----
export const CONSISTENCY_STREAK_DAYS = 7; // minimum streak to fire consistency
export const LOW_ENGAGEMENT_RATE = 0.3; // rate strictly below this fires low_engagement
export const LOW_ENGAGEMENT_MIN_ASSIGNED = 5; // require >= N quests to avoid noise on small samples
export const SIGNIFICANT_DROP_POINTS = 25; // rate drop strictly above N percentage points
export const LOCK_IN_WEEKS = 4; // require >= N consecutive periods same focus pillar

// ----- Confidence formula scaling constants -----
export const CONSISTENCY_STREAK_NORMALIZER = 14; // streak / N → 0..1
export const SAMPLE_SIZE_NORMALIZER = 10; // assigned / N → 0..1
export const REGRESSION_DROP_NORMALIZER = 50; // dropPoints / N → 0..1
export const FOCUS_LOCK_IN_NORMALIZER = 6; // consecutiveWeeks / N → 0..1

// ----- Lifecycle policy (prunePatterns) -----
export const PATTERN_TTL_DAYS = 60; // drop patterns older than N days
export const PATTERN_MIN_CONFIDENCE = 0.5; // drop patterns below this confidence
export const PATTERN_MAX_COUNT = 15; // absolute cap on simultaneous patterns

// ----- Per-pass cap before lifecycle merge -----
export const DETECTION_MAX_RESULTS_PER_PASS = 5;
