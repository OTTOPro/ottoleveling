import { describe, it, expect } from 'vitest';
import * as T from '../../src/lib/calibration/thresholds';

describe('calibration thresholds - ordering invariants', () => {
  it('sentinel: READING_DROUGHT_MAX_SAVES is 1 (not 0)', () => {
    expect(T.READING_DROUGHT_MAX_SAVES).toBe(1);
  });

  it('DROUGHT max < ENGAGED min - NORMAL range non-empty', () => {
    expect(T.READING_DROUGHT_MAX_SAVES).toBeLessThan(T.READING_ENGAGED_MIN_SAVES);
  });

  it('Sleep SEVERE thresholds are stricter than MILD', () => {
    expect(T.SLEEP_SEVERE_NIGHT_MIN).toBeLessThan(T.SLEEP_MILD_NIGHT_MIN);
    expect(T.SLEEP_SEVERE_AVG_MIN).toBeLessThan(T.SLEEP_MILD_AVG_MIN);
  });

  it('HRV window math sensible - recent < baseline', () => {
    expect(T.HRV_RECENT_WINDOW_DAYS).toBeLessThan(T.HRV_BASELINE_WINDOW_DAYS);
    expect(T.HRV_BASELINE_THRESHOLD_PCT).toBeGreaterThan(0);
    expect(T.HRV_BASELINE_THRESHOLD_PCT).toBeLessThan(1);
  });
});
