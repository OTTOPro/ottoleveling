import { describe, it, expect } from 'vitest';
import {
  computeHrvTrend,
  computeSleepDeficit,
  computeReadingTrend,
} from '../../src/lib/calibration/compute';
import * as T from '../../src/lib/calibration/thresholds';

// ============================================================
// computeHrvTrend
// ============================================================

describe('computeHrvTrend', () => {
  it('full window stable (recent 50, baseline 50)', () => {
    expect(computeHrvTrend({ recentRmssdAvg: 50, baselineRmssdAvg: 50 })).toBe('stable');
  });

  it('declining 12% (recent 44, baseline 50)', () => {
    // (44 - 50) / 50 = -0.12 → below -0.10 threshold
    expect(computeHrvTrend({ recentRmssdAvg: 44, baselineRmssdAvg: 50 })).toBe('declining');
  });

  it('improving 12% (recent 56, baseline 50)', () => {
    // (56 - 50) / 50 = +0.12 → above +0.10 threshold
    expect(computeHrvTrend({ recentRmssdAvg: 56, baselineRmssdAvg: 50 })).toBe('improving');
  });

  it('declining 8% (within deadband) → stable', () => {
    // (46 - 50) / 50 = -0.08 → within ±10% deadband
    expect(computeHrvTrend({ recentRmssdAvg: 46, baselineRmssdAvg: 50 })).toBe('stable');
  });

  it('partial window (recentRmssdAvg=null) → stable (Risk #1 default)', () => {
    expect(computeHrvTrend({ recentRmssdAvg: null, baselineRmssdAvg: 50 })).toBe('stable');
  });

  it('empty (both null) → stable', () => {
    expect(computeHrvTrend({ recentRmssdAvg: null, baselineRmssdAvg: null })).toBe('stable');
  });

  it('baseline zero → stable (NaN guard)', () => {
    expect(computeHrvTrend({ recentRmssdAvg: 50, baselineRmssdAvg: 0 })).toBe('stable');
  });

  it('non-finite inputs → stable', () => {
    expect(computeHrvTrend({ recentRmssdAvg: NaN, baselineRmssdAvg: 50 })).toBe('stable');
    expect(computeHrvTrend({ recentRmssdAvg: Infinity, baselineRmssdAvg: 50 })).toBe('stable');
  });
});

// ============================================================
// computeSleepDeficit - cause variants
// ============================================================

describe('computeSleepDeficit', () => {
  it('NONE (night=420, avg=440)', () => {
    const r = computeSleepDeficit({ previousNightMinutes: 420, sevenDayAvgMinutes: 440 });
    expect(r.status).toBe('none');
  });

  it('SEVERE acute only (night=280, avg=380)', () => {
    // night 280 < SLEEP_SEVERE_NIGHT_MIN 300 → acute severe
    // avg 380 > SLEEP_SEVERE_AVG_MIN 360 → not chronic severe
    const r = computeSleepDeficit({ previousNightMinutes: 280, sevenDayAvgMinutes: 380 });
    expect(r.status).toBe('severe');
    if (r.status !== 'severe') throw new Error('unreachable');
    expect(r.cause).toBe('acute');
    expect(r.previousNightMinutes).toBe(280);
  });

  it('SEVERE chronic only (night=400, avg=350)', () => {
    // night 400 > SLEEP_SEVERE_NIGHT_MIN 300 → not acute severe
    // avg 350 < SLEEP_SEVERE_AVG_MIN 360 → chronic severe
    const r = computeSleepDeficit({ previousNightMinutes: 400, sevenDayAvgMinutes: 350 });
    expect(r.status).toBe('severe');
    if (r.status !== 'severe') throw new Error('unreachable');
    expect(r.cause).toBe('chronic');
    expect(r.sevenDayAvgMinutes).toBe(350);
  });

  it('SEVERE both (night=270, avg=345)', () => {
    // night 270 < 300 AND avg 345 < 360 → both
    const r = computeSleepDeficit({ previousNightMinutes: 270, sevenDayAvgMinutes: 345 });
    expect(r.status).toBe('severe');
    if (r.status !== 'severe') throw new Error('unreachable');
    expect(r.cause).toBe('both');
    expect(r.previousNightMinutes).toBe(270);
    expect(r.sevenDayAvgMinutes).toBe(345);
  });

  it('MILD acute only (night=340, avg=420)', () => {
    // night 340 < SLEEP_MILD_NIGHT_MIN 360 → acute mild
    // avg 420 > SLEEP_MILD_AVG_MIN 390 → not chronic mild
    const r = computeSleepDeficit({ previousNightMinutes: 340, sevenDayAvgMinutes: 420 });
    expect(r.status).toBe('mild');
    if (r.status !== 'mild') throw new Error('unreachable');
    expect(r.cause).toBe('acute');
    expect(r.previousNightMinutes).toBe(340);
  });

  it('MILD chronic only (night=420, avg=380)', () => {
    // night 420 > SLEEP_MILD_NIGHT_MIN 360 → not acute mild
    // avg 380 < SLEEP_MILD_AVG_MIN 390 → chronic mild
    const r = computeSleepDeficit({ previousNightMinutes: 420, sevenDayAvgMinutes: 380 });
    expect(r.status).toBe('mild');
    if (r.status !== 'mild') throw new Error('unreachable');
    expect(r.cause).toBe('chronic');
    expect(r.sevenDayAvgMinutes).toBe(380);
  });

  it('MILD both (night=340, avg=380)', () => {
    // night 340 < 360 AND avg 380 < 390 → both mild
    const r = computeSleepDeficit({ previousNightMinutes: 340, sevenDayAvgMinutes: 380 });
    expect(r.status).toBe('mild');
    if (r.status !== 'mild') throw new Error('unreachable');
    expect(r.cause).toBe('both');
  });

  it('SEVERE overrides MILD - severe night + mild avg = severe', () => {
    // night 280 < SLEEP_SEVERE_NIGHT_MIN 300 → triggers SEVERE first
    // avg 385 < SLEEP_MILD_AVG_MIN 390 but > SLEEP_SEVERE_AVG_MIN 360 → mild avg only
    // Result: SEVERE (acute only) - SEVERE check runs first
    const r = computeSleepDeficit({ previousNightMinutes: 280, sevenDayAvgMinutes: 385 });
    expect(r.status).toBe('severe');
  });

  it('null inputs → none (no data)', () => {
    const r = computeSleepDeficit({ previousNightMinutes: null, sevenDayAvgMinutes: null });
    expect(r.status).toBe('none');
  });

  it('non-finite night → treated as no data for that threshold', () => {
    // NaN night should not trip thresholds
    const r = computeSleepDeficit({ previousNightMinutes: NaN, sevenDayAvgMinutes: 420 });
    expect(r.status).toBe('none');
  });
});

// ============================================================
// computeReadingTrend - drought boundary tests
// ============================================================

describe('computeReadingTrend', () => {
  it('0 saves → drought', () => {
    expect(computeReadingTrend({ episodeSaves7d: 0 })).toBe('drought');
  });

  it('1 save → drought (boundary - ≤1 = drought)', () => {
    expect(computeReadingTrend({ episodeSaves7d: 1 })).toBe('drought');
  });

  it('2 saves → normal (boundary - must NOT be drought)', () => {
    expect(computeReadingTrend({ episodeSaves7d: 2 })).toBe('normal');
  });

  it('4 saves → normal', () => {
    expect(computeReadingTrend({ episodeSaves7d: 4 })).toBe('normal');
  });

  it('5 saves → engaged (boundary - must NOT be normal)', () => {
    expect(computeReadingTrend({ episodeSaves7d: 5 })).toBe('engaged');
  });

  it('7 saves → engaged', () => {
    expect(computeReadingTrend({ episodeSaves7d: 7 })).toBe('engaged');
  });

  // NaN / negative guards
  it('negative input → normal (guard)', () => {
    expect(computeReadingTrend({ episodeSaves7d: -1 })).toBe('normal');
  });

  it('NaN input → normal (guard)', () => {
    expect(computeReadingTrend({ episodeSaves7d: NaN })).toBe('normal');
  });

  it('very large input → engaged', () => {
    expect(computeReadingTrend({ episodeSaves7d: 999 })).toBe('engaged');
  });

  // Threshold-constant sentinel: tests follow the constants, not magic numbers
  it('READING_DROUGHT_MAX_SAVES threshold boundary', () => {
    expect(computeReadingTrend({ episodeSaves7d: T.READING_DROUGHT_MAX_SAVES })).toBe('drought');
    expect(computeReadingTrend({ episodeSaves7d: T.READING_DROUGHT_MAX_SAVES + 1 })).toBe('normal');
  });

  it('READING_ENGAGED_MIN_SAVES threshold boundary', () => {
    expect(computeReadingTrend({ episodeSaves7d: T.READING_ENGAGED_MIN_SAVES })).toBe('engaged');
    expect(computeReadingTrend({ episodeSaves7d: T.READING_ENGAGED_MIN_SAVES - 1 })).toBe('normal');
  });
});
