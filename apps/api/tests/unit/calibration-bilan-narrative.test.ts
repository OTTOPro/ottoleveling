/**
 * Unit tests for formatPerformanceVsPhysiology.
 *
 * Uses the pure `renderPerformanceVsPhysiology` helper (D1-free) so these run
 * in the regular vitest pool without @cloudflare/vitest-pool-workers.
 */

import { describe, it, expect } from 'vitest';
import { renderPerformanceVsPhysiology } from '../../src/lib/calibration/bilan-narrative';
import type { CalibrationSignals } from '../../src/lib/calibration/types';

function makeSignals(overrides: Partial<CalibrationSignals> = {}): CalibrationSignals {
  return {
    hrv: 'stable',
    sleep: { status: 'none' },
    reading: 'normal',
    hrvRecentAvg: 52,
    hrvBaselineAvg: 51,
    hrvDeltaPct: 0.02,
    sleepPreviousNightMinutes: 430,
    sleepSevenDayAvgMinutes: 420,
    episodeSaves7dFiltered: 2,
    ...overrides,
  };
}

describe('renderPerformanceVsPhysiology', () => {
  it('Branch 5 - null signals → insufficient data', () => {
    const out = renderPerformanceVsPhysiology(0.72, null);
    expect(out).toContain('## Performance vs physiology');
    expect(out).toContain('insufficient calibration data');
  });

  it('Branch 1 - aligned positive: rate ≥65%, HRV stable, sleep none', () => {
    const out = renderPerformanceVsPhysiology(
      0.78,
      makeSignals({ hrv: 'stable', sleep: { status: 'none' } }),
    );
    expect(out).toContain('## Performance vs physiology');
    expect(out).toContain('Performance held');
    expect(out).toContain('78%');
    expect(out).toContain('stable HRV');
    expect(out).toContain('adequate sleep');
  });

  it('Branch 1 - aligned positive with improving HRV', () => {
    const out = renderPerformanceVsPhysiology(
      0.9,
      makeSignals({ hrv: 'improving', hrvDeltaPct: 0.15, sleep: { status: 'none' } }),
    );
    expect(out).toContain('Performance held');
    expect(out).toContain('improving HRV');
  });

  it('Branch 2 - unsustainable: rate ≥65%, HRV declining → sustaining on reserves', () => {
    const out = renderPerformanceVsPhysiology(
      0.82,
      makeSignals({
        hrv: 'declining',
        hrvDeltaPct: -0.14,
        sleep: { status: 'none' },
      }),
    );
    expect(out).toContain('## Performance vs physiology');
    expect(out).toContain('sustaining on reserves');
    expect(out).toContain('82%');
    expect(out).toContain('HRV declining');
  });

  it('Branch 2 - unsustainable: rate ≥65%, sleep MILD', () => {
    const out = renderPerformanceVsPhysiology(
      0.7,
      makeSignals({
        hrv: 'stable',
        sleep: {
          status: 'mild',
          cause: 'chronic',
          sevenDayAvgMinutes: 375,
        },
      }),
    );
    expect(out).toContain('sustaining on reserves');
    expect(out).toContain('sleep MILD');
  });

  it('Branch 3 - aligned negative: rate <40%, HRV declining + sleep MILD → recover', () => {
    const out = renderPerformanceVsPhysiology(
      0.38,
      makeSignals({
        hrv: 'declining',
        sleep: { status: 'mild', cause: 'chronic', sevenDayAvgMinutes: 370 },
      }),
    );
    expect(out).toContain('## Performance vs physiology');
    expect(out).toContain('Performance dropped');
    expect(out).toContain('38%');
    expect(out).toContain('recover before next cycle');
  });

  it('Branch 4 - steady-state: rate 52%, HRV stable, sleep none', () => {
    const out = renderPerformanceVsPhysiology(
      0.52,
      makeSignals({ hrv: 'stable', sleep: { status: 'none' } }),
    );
    expect(out).toContain('## Performance vs physiology');
    expect(out).toContain('Steady-state performance');
    expect(out).toContain('52%');
    expect(out).toContain('Physiology nominal');
  });

  it('Branch 4 - steady-state: rate 52%, HRV declining (mixed)', () => {
    const out = renderPerformanceVsPhysiology(
      0.52,
      makeSignals({ hrv: 'declining', sleep: { status: 'none' } }),
    );
    expect(out).toContain('Steady-state performance');
    expect(out).toContain('Physiology under stress');
  });
});
