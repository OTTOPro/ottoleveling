import {
  CONSISTENCY_STREAK_NORMALIZER,
  SAMPLE_SIZE_NORMALIZER,
  REGRESSION_DROP_NORMALIZER,
  FOCUS_LOCK_IN_NORMALIZER,
} from './thresholds';

/**
 * Per-pattern confidence formulas. All deterministic from precomputed stats -
 * NEVER use LLM-output for confidence. LLMs saturate to ~0.85 for everything
 * and the field becomes useless.
 *
 * Each formula is a weighted sum of normalized [0, 1] components:
 *   - Dominant signal (the signature of the pattern type) carries 0.5-0.7.
 *   - Sample size always contributes (avoids high-confidence on n=2 data).
 *   - Corroborating signal carries 0.1-0.3.
 *
 * All outputs are clamped to [0, 1] so callers never need to clamp.
 */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ---------- consistency_streak ----------

export interface ConsistencyInput {
  streakCurrent: number;
  rate: number; // 0..1
  assigned: number;
}

/**
 * Formula: streak_norm × 0.5 + rate × 0.3 + sample_size_norm × 0.2
 * Dominant: streak length. Rate confirms the streak isn't an artifact of
 * a thin quest schedule. Sample size guards against tiny windows.
 */
export function computeConsistencyConfidence(inp: ConsistencyInput): number {
  const streak = clamp01(inp.streakCurrent / CONSISTENCY_STREAK_NORMALIZER);
  const rate = clamp01(inp.rate);
  const sample = clamp01(inp.assigned / SAMPLE_SIZE_NORMALIZER);
  return clamp01(streak * 0.5 + rate * 0.3 + sample * 0.2);
}

// ---------- low_engagement ----------

export interface LowEngagementInput {
  rate: number; // 0..1, low rate fires this pattern
  assigned: number;
  previousRate: number | null; // null when no previous bilan
}

/**
 * Formula: lowness × 0.6 + sample_size × 0.3 + persistence × 0.1
 * Dominant: how low the rate is (1 - rate). Sample size matters because
 * rate is meaningless at n=1. Persistence = previous period was also low
 * → high; previous was good → low; no previous → neutral 0.5.
 */
export function computeLowEngagementConfidence(inp: LowEngagementInput): number {
  const lowness = clamp01(1 - inp.rate);
  const sample = clamp01(inp.assigned / SAMPLE_SIZE_NORMALIZER);
  const persistence = inp.previousRate == null ? 0.5 : inp.previousRate < 0.3 ? 1.0 : 0.0;
  return clamp01(lowness * 0.6 + sample * 0.3 + persistence * 0.1);
}

// ---------- regression ----------

export interface RegressionInput {
  dropPoints: number; // percentage points (0..100)
  assigned: number;
  previousRate: number; // 0..1
}

/**
 * Formula: drop_magnitude × 0.6 + sample_size × 0.3 + prev_was_high × 0.1
 * Dominant: magnitude of the drop. A regression from 0.95 → 0.65 is more
 * meaningful than from 0.55 → 0.25 (the higher the previous baseline,
 * the more the user "earned" the drop signal).
 */
export function computeRegressionConfidence(inp: RegressionInput): number {
  const drop = clamp01(inp.dropPoints / REGRESSION_DROP_NORMALIZER);
  const sample = clamp01(inp.assigned / SAMPLE_SIZE_NORMALIZER);
  const wasHigh = inp.previousRate >= 0.7 ? 1.0 : 0.5;
  return clamp01(drop * 0.6 + sample * 0.3 + wasHigh * 0.1);
}

// ---------- focus_lock_in ----------

export interface FocusLockInInput {
  consecutiveWeeks: number;
  totalWeeks: number;
}

/**
 * Formula: consecutiveWeeks_norm × 0.7 + same_proportion × 0.3
 * Dominant: trailing run length. Same-pillar proportion across full history
 * adds weight (lock-in over a long history is more notable than over a
 * short one).
 */
export function computeFocusLockInConfidence(inp: FocusLockInInput): number {
  if (inp.totalWeeks <= 0) return 0;
  const consec = clamp01(inp.consecutiveWeeks / FOCUS_LOCK_IN_NORMALIZER);
  const proportion = clamp01(inp.consecutiveWeeks / inp.totalWeeks);
  return clamp01(consec * 0.7 + proportion * 0.3);
}
