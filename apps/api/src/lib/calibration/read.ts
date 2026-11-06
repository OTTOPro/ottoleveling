/**
 * D1 read layer for calibration signals.
 *
 * `buildCalibrationSignals` fans out 4 D1 reads (HRV recent window, HRV baseline
 * window, sleep, filtered episode saves), runs the pure compute helpers, and
 * returns the composite CalibrationSignals snapshot. Returns null only when
 * EVERY signal is empty (no GH AND no Spotify data at all).
 *
 * This function is the single I/O boundary for the calibration module.
 * All compute helpers (computeHrvTrend, computeSleepDeficit, computeReadingTrend)
 * are pure - no D1 reads inside them.
 */

import * as T from './thresholds';
import { computeHrvTrend, computeSleepDeficit, computeReadingTrend } from './compute';
import type { CalibrationSignals } from './types';
import { getExcludedShowUris } from '../data-sources/spotify-show-filters';

/**
 * Builds the CalibrationSignals snapshot for the {CALIBRATION_SIGNALS} placeholder.
 *
 * `today` is the ISO date string (YYYY-MM-DD) for the day BEING GENERATED.
 * All windows look at data BEFORE `today` (exclusive upper bound).
 *
 * Returns `null` when there is no Google Health data AND no Spotify data at all
 * for the relevant windows - strictly "nothing to derive", NOT "data exists but neutral".
 */
export async function buildCalibrationSignals(
  db: D1Database,
  today: string,
): Promise<CalibrationSignals | null> {
  // Fan-out 4 independent D1 reads in parallel.
  const [hrvRecent, hrvBaseline, sleepPrev, sleepAvg, excludedUris] = await Promise.all([
    readHrvAvgInWindow(db, today, T.HRV_RECENT_WINDOW_DAYS),
    readHrvBaselineAvg(db, today, T.HRV_BASELINE_WINDOW_DAYS, T.HRV_RECENT_WINDOW_DAYS),
    readSleepPreviousNight(db, today),
    readSleepSevenDayAvg(db, today),
    getExcludedShowUris(db),
  ]);

  // Episode saves after the user's Spotify show filter.
  const episodeSaves = await readFilteredEpisodeSaves(
    db,
    today,
    T.READING_WINDOW_DAYS,
    excludedUris,
  );

  // Null result only when EVERY signal is genuinely empty (no data at all).
  const allEmpty =
    hrvRecent == null &&
    hrvBaseline == null &&
    sleepPrev == null &&
    sleepAvg == null &&
    episodeSaves === 0;

  if (allEmpty) return null;

  // Run pure compute helpers.
  const hrvStatus = computeHrvTrend({
    recentRmssdAvg: hrvRecent,
    baselineRmssdAvg: hrvBaseline,
  });

  const sleep = computeSleepDeficit({
    previousNightMinutes: sleepPrev,
    sevenDayAvgMinutes: sleepAvg,
  });

  const reading = computeReadingTrend({ episodeSaves7d: episodeSaves });

  const hrvDeltaPct =
    hrvRecent != null && hrvBaseline != null && hrvBaseline > 0
      ? (hrvRecent - hrvBaseline) / hrvBaseline
      : undefined;

  return {
    hrv: hrvStatus,
    sleep,
    reading,
    hrvRecentAvg: hrvRecent ?? undefined,
    hrvBaselineAvg: hrvBaseline ?? undefined,
    hrvDeltaPct,
    sleepPreviousNightMinutes: sleepPrev ?? undefined,
    sleepSevenDayAvgMinutes: sleepAvg ?? undefined,
    episodeSaves7dFiltered: episodeSaves,
  };
}

// ============================================================
// Private D1 read helpers
// ============================================================

/**
 * Returns the AVG of hrv_rmssd in the window [today - daysBack, today).
 * Returns null if there are no rows in the window.
 */
async function readHrvAvgInWindow(
  db: D1Database,
  today: string,
  daysBack: number,
): Promise<number | null> {
  const since = isoMinus(today, daysBack);
  const row = await db
    .prepare(
      `SELECT AVG(value) AS avg_val
         FROM daily_metrics
        WHERE provider = 'google_health'
          AND metric = 'hrv_rmssd'
          AND date >= ?
          AND date < ?`,
    )
    .bind(since, today)
    .first<{ avg_val: number | null }>();
  return row?.avg_val ?? null;
}

/**
 * Returns the AVG of hrv_rmssd in the OLDER chunk of the baseline window:
 * [today - baselineDays, today - recentDays).
 *
 * This isolates the baseline from the recent window so the comparison is
 * between two NON-overlapping periods. Returns null if no rows.
 */
async function readHrvBaselineAvg(
  db: D1Database,
  today: string,
  baselineDays: number,
  recentDays: number,
): Promise<number | null> {
  const oldEnd = isoMinus(today, recentDays); // exclusive upper bound of baseline window
  const oldStart = isoMinus(today, baselineDays); // inclusive lower bound
  const row = await db
    .prepare(
      `SELECT AVG(value) AS avg_val
         FROM daily_metrics
        WHERE provider = 'google_health'
          AND metric = 'hrv_rmssd'
          AND date >= ?
          AND date < ?`,
    )
    .bind(oldStart, oldEnd)
    .first<{ avg_val: number | null }>();
  return row?.avg_val ?? null;
}

/**
 * Returns sleep_minutes for the night before today (yesterday = today - 1).
 * Returns null if no row exists.
 */
async function readSleepPreviousNight(db: D1Database, today: string): Promise<number | null> {
  const yesterday = isoMinus(today, 1);
  const row = await db
    .prepare(
      `SELECT value
         FROM daily_metrics
        WHERE provider = 'google_health'
          AND metric = 'sleep_minutes'
          AND date = ?
        LIMIT 1`,
    )
    .bind(yesterday)
    .first<{ value: number }>();
  return row?.value ?? null;
}

/**
 * Returns the 7-day rolling AVG of sleep_minutes over [today - 7, today).
 * Returns null if no rows.
 */
async function readSleepSevenDayAvg(db: D1Database, today: string): Promise<number | null> {
  const since = isoMinus(today, 7);
  const row = await db
    .prepare(
      `SELECT AVG(value) AS avg_val
         FROM daily_metrics
        WHERE provider = 'google_health'
          AND metric = 'sleep_minutes'
          AND date >= ?
          AND date < ?`,
    )
    .bind(since, today)
    .first<{ avg_val: number | null }>();
  return row?.avg_val ?? null;
}

/**
 * Counts library_save_events with listening_type='episode_save' in the last
 * `days` days before today, excluding shows whose URI is in `excludedUris`.
 *
 * Returns 0 when there are no matching rows or when all rows belong to excluded shows.
 */
async function readFilteredEpisodeSaves(
  db: D1Database,
  today: string,
  days: number,
  excludedUris: Set<string>,
): Promise<number> {
  const since = isoMinus(today, days);

  if (excludedUris.size === 0) {
    // Fast path: no exclusions.
    const row = await db
      .prepare(
        `SELECT COUNT(*) AS cnt
           FROM library_save_events
          WHERE listening_type = 'episode_save'
            AND date >= ?
            AND date < ?`,
      )
      .bind(since, today)
      .first<{ cnt: number }>();
    return row?.cnt ?? 0;
  }

  // Build NOT IN clause for excluded URIs.
  const excluded = Array.from(excludedUris);
  const placeholders = excluded.map(() => '?').join(', ');
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS cnt
         FROM library_save_events
        WHERE listening_type = 'episode_save'
          AND date >= ?
          AND date < ?
          AND (show_or_book_spotify_uri IS NULL
               OR show_or_book_spotify_uri NOT IN (${placeholders}))`,
    )
    .bind(since, today, ...excluded)
    .first<{ cnt: number }>();
  return row?.cnt ?? 0;
}

// ============================================================
// Date arithmetic helper
// ============================================================

/** Returns ISO date `daysBack` days before `isoDate` (UTC-safe). */
function isoMinus(isoDate: string, daysBack: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}
