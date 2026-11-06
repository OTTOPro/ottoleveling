/**
 * Integration tests for calibration D1 read layer.
 *
 * Tests cover:
 *   1. Returns null when no data at all
 *   2. Returns CalibrationSignals when only HRV data exists
 *   3. Returns CalibrationSignals when only sleep data exists
 *   4. Returns CalibrationSignals when only Spotify episode saves exist
 *   5. HRV declining: 11d baseline @50 + 3d recent @44 → hrv='declining', delta ≈ -12%
 *   6. HRV stable: 14d @50 → hrv='stable', delta ≈ 0%
 *   7. Sleep SEVERE acute (yesterday=270, no avg) → sleep.status='severe', cause='acute'
 *   8. Sleep MILD chronic (yesterday=420, 7d avg=380) → sleep.status='mild', cause='chronic'
 *   9. Reading DROUGHT (0 saves) → reading='drought', episodeSaves7dFiltered=0
 *  10. Reading filtered: 5 episode_saves but 3 for excluded show → episodeSaves7dFiltered=2 → 'normal'
 *  11. Drought boundary: exactly 1 save (not excluded) → 'drought'; exactly 2 saves → 'normal'
 */

import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { buildCalibrationSignals } from '../../src/lib/calibration/read';

const TODAY = '2026-06-01';

/** Helper: insert hrv_rmssd rows into daily_metrics. */
async function seedHrv(values: Array<{ date: string; value: number }>) {
  for (const { date, value } of values) {
    await env.DB.prepare(
      `INSERT INTO daily_metrics (date, provider, metric, value, pillar_id)
       VALUES (?, 'google_health', 'hrv_rmssd', ?, 'body')`,
    )
      .bind(date, value)
      .run();
  }
}

/** Helper: insert sleep_minutes rows into daily_metrics. */
async function seedSleep(values: Array<{ date: string; value: number }>) {
  for (const { date, value } of values) {
    await env.DB.prepare(
      `INSERT INTO daily_metrics (date, provider, metric, value, pillar_id)
       VALUES (?, 'google_health', 'sleep_minutes', ?, 'body')`,
    )
      .bind(date, value)
      .run();
  }
}

/** Helper: insert a library_save_events row. */
async function seedEpisodeSave(date: string, uri: string, title: string = 'Test Show') {
  await env.DB.prepare(
    `INSERT INTO library_save_events
       (date, show_or_book_title, show_or_book_author, show_or_book_spotify_uri, listening_type)
     VALUES (?, ?, NULL, ?, 'episode_save')`,
  )
    .bind(date, title, uri)
    .run();
}

/** Helper: exclude a show URI via spotify_show_filters. */
async function excludeShow(uri: string) {
  await env.DB.prepare(
    `INSERT INTO spotify_show_filters
       (show_spotify_uri, show_name, include_in_mind_learning, contributes_to_pillar,
        user_updated_at, discovered_at)
     VALUES (?, 'Excluded Show', 0, 'mind', datetime('now'), datetime('now'))`,
  )
    .bind(uri)
    .run();
}

/** Build an array of dates going back `count` days before `startExclusive`. */
function datesGoingBack(startExclusive: string, count: number): string[] {
  const result: string[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(startExclusive + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - i);
    result.push(d.toISOString().slice(0, 10));
  }
  return result;
}

describe('buildCalibrationSignals', () => {
  // Setup-d1.ts wipes daily_metrics, library_save_events, and spotify_show_filters
  // in beforeEach, so each test starts with a clean slate.

  it('returns null when no data at all', async () => {
    const result = await buildCalibrationSignals(env.DB, TODAY);
    expect(result).toBeNull();
  });

  it('returns CalibrationSignals (not null) when only HRV data exists', async () => {
    // Seed 11 baseline days + 3 recent days with the same value → stable
    const dates = datesGoingBack(TODAY, 14);
    for (const date of dates) {
      await env.DB.prepare(
        `INSERT INTO daily_metrics (date, provider, metric, value, pillar_id)
         VALUES (?, 'google_health', 'hrv_rmssd', 50, 'body')`,
      )
        .bind(date)
        .run();
    }
    const result = await buildCalibrationSignals(env.DB, TODAY);
    expect(result).not.toBeNull();
    expect(result!.hrv).toBe('stable');
  });

  it('returns CalibrationSignals (not null) when only sleep data exists', async () => {
    // Seed yesterday's sleep (420 min = well above all thresholds → sleep.status='none')
    const yesterday = datesGoingBack(TODAY, 1)[0]!;
    await seedSleep([{ date: yesterday, value: 420 }]);
    const result = await buildCalibrationSignals(env.DB, TODAY);
    expect(result).not.toBeNull();
    expect(result!.sleep.status).toBe('none');
  });

  it('returns CalibrationSignals (not null) when only Spotify episode saves exist', async () => {
    // Seed 3 episode saves within the 7-day window
    const dates = datesGoingBack(TODAY, 3);
    for (const date of dates) {
      await seedEpisodeSave(date, `spotify:show:test${date}`, 'Test Show');
    }
    const result = await buildCalibrationSignals(env.DB, TODAY);
    expect(result).not.toBeNull();
    expect(result!.reading).toBe('normal');
    expect(result!.episodeSaves7dFiltered).toBe(3);
  });

  it('HRV declining: 11d baseline @50 + 3d recent @44 → hrv=declining, delta≈-12%', async () => {
    // Prior 11 days (days 4-14 before today): HRV @50
    const baselineDates = datesGoingBack(TODAY, 14).slice(3); // indices 3..13 = 11 days
    await seedHrv(baselineDates.map((date) => ({ date, value: 50 })));

    // Recent 3 days (days 1-3 before today): HRV @44
    const recentDates = datesGoingBack(TODAY, 3);
    await seedHrv(recentDates.map((date) => ({ date, value: 44 })));

    const result = await buildCalibrationSignals(env.DB, TODAY);
    expect(result).not.toBeNull();
    expect(result!.hrv).toBe('declining');
    expect(result!.hrvRecentAvg).toBeCloseTo(44, 1);
    expect(result!.hrvBaselineAvg).toBeCloseTo(50, 1);
    // delta = (44 - 50) / 50 = -0.12
    expect(result!.hrvDeltaPct).toBeCloseTo(-0.12, 2);
  });

  it('HRV stable: 14d @50 all same → hrv=stable, delta≈0%', async () => {
    const allDates = datesGoingBack(TODAY, 14);
    await seedHrv(allDates.map((date) => ({ date, value: 50 })));

    const result = await buildCalibrationSignals(env.DB, TODAY);
    expect(result).not.toBeNull();
    expect(result!.hrv).toBe('stable');
    // recent avg ≈ baseline avg → delta ≈ 0
    expect(result!.hrvDeltaPct).toBeCloseTo(0, 2);
  });

  it('Sleep SEVERE acute (yesterday=270, avg=420 → not chronic) → sleep.status=severe, cause=acute', async () => {
    // Yesterday: 270 min → acute severe (< SLEEP_SEVERE_NIGHT_MIN=300)
    const yesterday = datesGoingBack(TODAY, 1)[0]!;
    await seedSleep([{ date: yesterday, value: 270 }]);

    // Fill remaining 6 days in the 7-day window with 420 → avg = (270 + 420*6) / 7 ≈ 399
    // 399 > SLEEP_SEVERE_AVG_MIN=360 AND 399 > SLEEP_MILD_AVG_MIN=390 → no chronic flag
    const otherDates = datesGoingBack(TODAY, 7).slice(1); // days 2-7
    await seedSleep(otherDates.map((date) => ({ date, value: 420 })));

    const result = await buildCalibrationSignals(env.DB, TODAY);
    expect(result).not.toBeNull();
    expect(result!.sleep.status).toBe('severe');
    if (result!.sleep.status !== 'none') {
      expect(result!.sleep.cause).toBe('acute');
    }
    expect(result!.sleepPreviousNightMinutes).toBe(270);
  });

  it('Sleep MILD chronic (yesterday=420, 7d avg=380) → sleep.status=mild, cause=chronic', async () => {
    // Yesterday normal (420 ≥ 360 → not acute mild)
    const yesterday = datesGoingBack(TODAY, 1)[0]!;
    await seedSleep([{ date: yesterday, value: 420 }]);

    // Fill remaining 6 days of the window with 360 → avg = (420 + 5*360 + 1*360) / 7 ≈ 368
    // Actually: 420 + 360*6 = 2580 → avg ≈ 368.6; that's < 390 (MILD_AVG_MIN) but > 360 (SEVERE_AVG_MIN)
    const otherDates = datesGoingBack(TODAY, 7).slice(1); // days 2-7
    await seedSleep(otherDates.map((date) => ({ date, value: 360 })));

    const result = await buildCalibrationSignals(env.DB, TODAY);
    expect(result).not.toBeNull();
    expect(result!.sleep.status).toBe('mild');
    if (result!.sleep.status !== 'none') {
      expect(result!.sleep.cause).toBe('chronic');
    }
  });

  it('Reading DROUGHT (0 saves in window) → reading=drought, episodeSaves7dFiltered=0', async () => {
    // Seed only sleep data so result is not null, but no episode saves
    const yesterday = datesGoingBack(TODAY, 1)[0]!;
    await seedSleep([{ date: yesterday, value: 420 }]);

    const result = await buildCalibrationSignals(env.DB, TODAY);
    expect(result).not.toBeNull();
    expect(result!.reading).toBe('drought');
    expect(result!.episodeSaves7dFiltered).toBe(0);
  });

  it('Reading filtered: 5 saves but 3 excluded → episodeSaves7dFiltered=2 → reading=normal', async () => {
    const dates = datesGoingBack(TODAY, 5);

    // 2 saves for included show
    await seedEpisodeSave(dates[0]!, 'spotify:show:included', 'Good Show');
    await seedEpisodeSave(dates[1]!, 'spotify:show:included', 'Good Show');

    // 3 saves for excluded show
    await seedEpisodeSave(dates[2]!, 'spotify:show:excluded', 'Bad Show');
    await seedEpisodeSave(dates[3]!, 'spotify:show:excluded', 'Bad Show');
    await seedEpisodeSave(dates[4]!, 'spotify:show:excluded', 'Bad Show');

    // Mark the show as excluded
    await excludeShow('spotify:show:excluded');

    const result = await buildCalibrationSignals(env.DB, TODAY);
    expect(result).not.toBeNull();
    // 2 saves remain after filtering → 'normal' (>1, <5)
    expect(result!.episodeSaves7dFiltered).toBe(2);
    expect(result!.reading).toBe('normal');
  });

  it('Drought boundary: 1 save (not excluded) → drought; 2 saves → normal', async () => {
    // First: seed exactly 1 save → expect DROUGHT (≤1 = drought)
    const date1 = datesGoingBack(TODAY, 1)[0]!;
    await seedEpisodeSave(date1, 'spotify:show:boundary1', 'Boundary Show');

    const result1 = await buildCalibrationSignals(env.DB, TODAY);
    expect(result1).not.toBeNull();
    expect(result1!.episodeSaves7dFiltered).toBe(1);
    expect(result1!.reading).toBe('drought');

    // Clean up and add one more save → expect NORMAL (2 = normal)
    await env.DB.prepare(`DELETE FROM library_save_events`).run();
    const date2 = datesGoingBack(TODAY, 2)[0]!;
    await seedEpisodeSave(date1, 'spotify:show:boundary1', 'Boundary Show');
    await seedEpisodeSave(date2, 'spotify:show:boundary2', 'Boundary Show 2');

    const result2 = await buildCalibrationSignals(env.DB, TODAY);
    expect(result2).not.toBeNull();
    expect(result2!.episodeSaves7dFiltered).toBe(2);
    expect(result2!.reading).toBe('normal');
  });
});
