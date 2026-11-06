import * as T from './thresholds';
import type { HrvStatus, SleepDeficit, ReadingTrend, SleepCause } from './types';

// ============================================================
// Input shapes
// ============================================================

export interface HrvInput {
  recentRmssdAvg: number | null; // avg of last HRV_RECENT_WINDOW_DAYS days
  baselineRmssdAvg: number | null; // avg of prior window days
}

export interface SleepInput {
  previousNightMinutes: number | null; // null if no data yesterday
  sevenDayAvgMinutes: number | null; // null if window too sparse
}

export interface ReadingInput {
  /** Post-filter count - caller MUST apply getExcludedShowUris before passing. */
  episodeSaves7d: number;
}

// ============================================================
// computeHrvTrend
// ============================================================

/**
 * HRV trend: ±10% deadband around the baseline.
 * - declining: recent < baseline * (1 - HRV_BASELINE_THRESHOLD_PCT)
 * - improving: recent > baseline * (1 + HRV_BASELINE_THRESHOLD_PCT)
 * - stable: otherwise (or insufficient data → 'stable' default per Risk #1)
 */
export function computeHrvTrend(input: HrvInput): HrvStatus {
  const { recentRmssdAvg, baselineRmssdAvg } = input;
  if (recentRmssdAvg == null || baselineRmssdAvg == null) {
    // Risk #1: sparse data - safe default
    return 'stable';
  }
  if (!Number.isFinite(recentRmssdAvg) || !Number.isFinite(baselineRmssdAvg)) return 'stable';
  if (baselineRmssdAvg <= 0) return 'stable';
  const delta = (recentRmssdAvg - baselineRmssdAvg) / baselineRmssdAvg;
  if (delta < -T.HRV_BASELINE_THRESHOLD_PCT) return 'declining';
  if (delta > T.HRV_BASELINE_THRESHOLD_PCT) return 'improving';
  return 'stable';
}

// ============================================================
// computeSleepDeficit
// ============================================================

/**
 * Sleep deficit classification with SEVERE > MILD > NONE precedence
 * AND dominant-cause discrimination (acute / chronic / both).
 *
 * Logic (evaluated in order - first match wins):
 *   1. SEVERE if previousNight < SLEEP_SEVERE_NIGHT_MIN OR sevenDayAvg < SLEEP_SEVERE_AVG_MIN
 *   2. MILD   if NOT SEVERE AND (previousNight < SLEEP_MILD_NIGHT_MIN OR sevenDayAvg < SLEEP_MILD_AVG_MIN)
 *   3. NONE   otherwise
 *
 * The cause field distinguishes which threshold(s) tripped so the format helper
 * can render the correct sentinel-locked wording variant.
 */
export function computeSleepDeficit(input: SleepInput): SleepDeficit {
  const { previousNightMinutes: night, sevenDayAvgMinutes: avg } = input;

  // Determine which thresholds tripped at SEVERE level
  const acuteSevere = night != null && Number.isFinite(night) && night < T.SLEEP_SEVERE_NIGHT_MIN;
  const chronicSevere = avg != null && Number.isFinite(avg) && avg < T.SLEEP_SEVERE_AVG_MIN;

  if (acuteSevere || chronicSevere) {
    let cause: SleepCause;
    if (acuteSevere && chronicSevere) cause = 'both';
    else if (acuteSevere) cause = 'acute';
    else cause = 'chronic';
    return {
      status: 'severe',
      cause,
      ...(night != null ? { previousNightMinutes: night } : {}),
      ...(avg != null ? { sevenDayAvgMinutes: avg } : {}),
    };
  }

  // Determine MILD-level trips
  const acuteMild = night != null && Number.isFinite(night) && night < T.SLEEP_MILD_NIGHT_MIN;
  const chronicMild = avg != null && Number.isFinite(avg) && avg < T.SLEEP_MILD_AVG_MIN;

  if (acuteMild || chronicMild) {
    let cause: SleepCause;
    if (acuteMild && chronicMild) cause = 'both';
    else if (acuteMild) cause = 'acute';
    else cause = 'chronic';
    return {
      status: 'mild',
      cause,
      ...(night != null ? { previousNightMinutes: night } : {}),
      ...(avg != null ? { sevenDayAvgMinutes: avg } : {}),
    };
  }

  return { status: 'none' };
}

// ============================================================
// computeReadingTrend
// ============================================================

/**
 * Reading trend - discrete trichotomy.
 *   drought = saves <= READING_DROUGHT_MAX_SAVES (i.e. 0 or 1)
 *   engaged = saves >= READING_ENGAGED_MIN_SAVES (i.e. 5+)
 *   normal  = otherwise (2-4)
 *
 * The caller is responsible for filtering saves through getExcludedShowUris
 * BEFORE invoking this helper (user-excluded Spotify shows). This
 * helper just sees the post-filter count.
 */
export function computeReadingTrend(input: ReadingInput): ReadingTrend {
  const { episodeSaves7d } = input;
  if (!Number.isFinite(episodeSaves7d) || episodeSaves7d < 0) return 'normal';
  if (episodeSaves7d <= T.READING_DROUGHT_MAX_SAVES) return 'drought';
  if (episodeSaves7d >= T.READING_ENGAGED_MIN_SAVES) return 'engaged';
  return 'normal';
}
