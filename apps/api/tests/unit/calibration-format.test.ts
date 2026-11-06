import { describe, it, expect } from 'vitest';
import { formatCalibrationSignals } from '../../src/lib/calibration/format';
import type { CalibrationSignals } from '../../src/lib/calibration/types';

const base: CalibrationSignals = {
  hrv: 'stable',
  sleep: { status: 'none' },
  reading: 'normal',
  hrvRecentAvg: 50,
  hrvBaselineAvg: 50,
  hrvDeltaPct: 0,
  episodeSaves7dFiltered: 3,
};

describe('formatCalibrationSignals - sleep variants (LOCKED)', () => {
  it('SEVERE both acute+chronic', () => {
    const out = formatCalibrationSignals({
      ...base,
      sleep: {
        status: 'severe',
        cause: 'both',
        previousNightMinutes: 270,
        sevenDayAvgMinutes: 345,
      },
    });
    expect(out).toContain('Sleep: SEVERE (acute + chronic, 270 min last night, 345 min avg)');
  });

  it('SEVERE acute only', () => {
    const out = formatCalibrationSignals({
      ...base,
      sleep: { status: 'severe', cause: 'acute', previousNightMinutes: 280 },
    });
    expect(out).toContain('Sleep: SEVERE (acute deficit, 280 min last night)');
  });

  it('SEVERE chronic only', () => {
    const out = formatCalibrationSignals({
      ...base,
      sleep: { status: 'severe', cause: 'chronic', sevenDayAvgMinutes: 350 },
    });
    expect(out).toContain('Sleep: SEVERE (chronic deficit, 350 min 7-day avg)');
  });

  it('MILD both acute+chronic', () => {
    const out = formatCalibrationSignals({
      ...base,
      sleep: {
        status: 'mild',
        cause: 'both',
        previousNightMinutes: 340,
        sevenDayAvgMinutes: 380,
      },
    });
    expect(out).toContain('Sleep: MILD (340 min last night, 380 min avg - cap difficulty)');
  });

  it('MILD acute only', () => {
    const out = formatCalibrationSignals({
      ...base,
      sleep: { status: 'mild', cause: 'acute', previousNightMinutes: 340 },
    });
    expect(out).toContain('Sleep: MILD (acute deficit, 340 min last night - cap difficulty)');
  });

  it('MILD chronic only', () => {
    const out = formatCalibrationSignals({
      ...base,
      sleep: { status: 'mild', cause: 'chronic', sevenDayAvgMinutes: 380 },
    });
    expect(out).toContain('Sleep: MILD (chronic deficit, 380 min avg - cap difficulty)');
  });

  it('NONE', () => {
    const out = formatCalibrationSignals({ ...base, sleep: { status: 'none' } });
    expect(out).toContain('Sleep: NONE');
  });
});

describe('formatCalibrationSignals - PODCAST_LISTENING_SEMANTICS hygiene', () => {
  it('NEVER emits "min today" or "minutes listened"', () => {
    const cases: CalibrationSignals[] = [
      { ...base, reading: 'drought', episodeSaves7dFiltered: 0 },
      { ...base, reading: 'drought', episodeSaves7dFiltered: 1 },
      { ...base, reading: 'engaged', episodeSaves7dFiltered: 7 },
      {
        ...base,
        sleep: {
          status: 'severe',
          cause: 'both',
          previousNightMinutes: 270,
          sevenDayAvgMinutes: 345,
        },
      },
      {
        ...base,
        sleep: { status: 'mild', cause: 'acute', previousNightMinutes: 340 },
      },
      {
        ...base,
        sleep: { status: 'severe', cause: 'chronic', sevenDayAvgMinutes: 350 },
      },
    ];
    for (const c of cases) {
      const out = formatCalibrationSignals(c);
      expect(out).not.toMatch(/\d+\s*min today/i);
      expect(out).not.toMatch(/\d+\s*minutes? listened/i);
    }
  });
});

describe('formatCalibrationSignals - null signals → empty-state', () => {
  it('returns the insufficient-data line', () => {
    expect(formatCalibrationSignals(null)).toContain('insufficient data');
  });
});

describe('formatCalibrationSignals - HRV inline numbers', () => {
  it('renders pct delta when full HRV data present', () => {
    const out = formatCalibrationSignals({
      ...base,
      hrv: 'declining',
      hrvRecentAvg: 44,
      hrvBaselineAvg: 50,
      hrvDeltaPct: -0.12,
    });
    // Accept the full line pattern
    expect(out).toMatch(/HRV: declining.*-12%/);
  });

  it('renders insufficient data annotation when HRV numbers absent', () => {
    const out = formatCalibrationSignals({
      ...base,
      hrv: 'stable',
      hrvRecentAvg: undefined,
      hrvBaselineAvg: undefined,
      hrvDeltaPct: undefined,
    });
    expect(out).toContain('insufficient data');
  });
});

describe('formatCalibrationSignals - reading episode saves count', () => {
  it('renders singular episode save for count=1', () => {
    const out = formatCalibrationSignals({
      ...base,
      reading: 'drought',
      episodeSaves7dFiltered: 1,
    });
    expect(out).toContain('1 episode save last 7d');
    expect(out).not.toContain('1 episode saves');
  });

  it('renders plural episode saves for count>1', () => {
    const out = formatCalibrationSignals({ ...base, reading: 'normal', episodeSaves7dFiltered: 3 });
    expect(out).toContain('3 episode saves last 7d');
  });

  it('renders 0 episode saves for drought with no saves', () => {
    const out = formatCalibrationSignals({
      ...base,
      reading: 'drought',
      episodeSaves7dFiltered: 0,
    });
    expect(out).toContain('0 episode saves last 7d');
    expect(out).toMatch(/Reading: drought/);
  });
});
