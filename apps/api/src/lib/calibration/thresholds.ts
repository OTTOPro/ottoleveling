/**
 * Calibration thresholds - single tunable surface.
 *
 * Tests import from this file so adjusting any constant auto-propagates to
 * scenarios without breaking them. Same approach as lib/patterns/thresholds.ts.
 *
 * If the user requests calibration sensitivity changes (e.g., "make ENGAGED
 * trigger at 4 saves not 5"), this is the only file to edit + redeploy.
 */

// ============================================================
// HRV (14-day rolling, last 3 vs prior 11, ±10%)
// ============================================================

export const HRV_BASELINE_WINDOW_DAYS = 14;
export const HRV_RECENT_WINDOW_DAYS = 3;
/** Percentage delta (last vs baseline) that triggers declining/improving (±10%). */
export const HRV_BASELINE_THRESHOLD_PCT = 0.1;

// ============================================================
// Sleep (two-tier severity)
// ============================================================

export const SLEEP_MILD_NIGHT_MIN = 360; // 6h previous-night threshold for MILD
export const SLEEP_MILD_AVG_MIN = 390; // 6.5h 7-day avg threshold for MILD
export const SLEEP_SEVERE_NIGHT_MIN = 300; // 5h previous-night threshold for SEVERE
export const SLEEP_SEVERE_AVG_MIN = 360; // 6h 7-day avg threshold for SEVERE

// ============================================================
// Reading (discrete trichotomy, counted after the show filter)
// ============================================================

export const READING_WINDOW_DAYS = 7;
/**
 * ≤1 saves = drought.
 * Rationale: user has baseline 1-2 ep/wk reading habit. A "0 saves" threshold
 * would rarely fire in practice, making the rule dormant. Relaxing to ≤1 keeps
 * the rule operational while still meaningfully separating low-engagement
 * (0-1) from normal cadence (2-4) and active engagement (5+).
 */
export const READING_DROUGHT_MAX_SAVES = 1; // ≤1 saves over window = drought
export const READING_ENGAGED_MIN_SAVES = 5; // ≥5 NEW saves over window = engaged
// NORMAL = 2..4 inclusive
