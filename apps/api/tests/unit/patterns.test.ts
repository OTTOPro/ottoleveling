import { describe, it, expect } from 'vitest';
import { detectPatterns, type PatternInput } from '../../src/lib/patterns';
import {
  CONSISTENCY_STREAK_DAYS,
  LOW_ENGAGEMENT_RATE,
  LOW_ENGAGEMENT_MIN_ASSIGNED,
  SIGNIFICANT_DROP_POINTS,
  LOCK_IN_WEEKS,
  DETECTION_MAX_RESULTS_PER_PASS,
} from '../../src/lib/patterns/thresholds';
import type { PillarId } from '../../src/do/state';

function emptyByPillar(): PatternInput['byPillar'] {
  return {
    body: { assigned: 0, completed: 0, rate: 0, streakCurrent: 0 },
    mind: { assigned: 0, completed: 0, rate: 0, streakCurrent: 0 },
    finance: { assigned: 0, completed: 0, rate: 0, streakCurrent: 0 },
    projects: { assigned: 0, completed: 0, rate: 0, streakCurrent: 0 },
  };
}

const NOW = '2026-05-31T20:00:00.000Z';

describe('detectPatterns - consistency_streak', () => {
  it(`streak < ${CONSISTENCY_STREAK_DAYS} → not detected`, () => {
    const inp: PatternInput = {
      byPillar: {
        ...emptyByPillar(),
        mind: { assigned: 10, completed: 6, rate: 0.6, streakCurrent: CONSISTENCY_STREAK_DAYS - 1 },
      },
      previousByPillar: null,
      focusHistory: [],
      now: NOW,
    };
    expect(detectPatterns(inp).find((p) => p.type === 'consistency_streak')).toBeUndefined();
  });
  it(`streak = ${CONSISTENCY_STREAK_DAYS} → detected, confidence ∈ (0,1)`, () => {
    const inp: PatternInput = {
      byPillar: {
        ...emptyByPillar(),
        mind: { assigned: 10, completed: 7, rate: 0.7, streakCurrent: CONSISTENCY_STREAK_DAYS },
      },
      previousByPillar: null,
      focusHistory: [],
      now: NOW,
    };
    const m = detectPatterns(inp).find((p) => p.type === 'consistency_streak');
    expect(m).toBeDefined();
    expect(m!.confidence).toBeGreaterThan(0);
    expect(m!.confidence).toBeLessThanOrEqual(1);
    expect(m!.description).toContain('mind');
    expect(m!.description).toContain(String(CONSISTENCY_STREAK_DAYS));
  });
});

describe('detectPatterns - low_engagement', () => {
  it(`rate < ${LOW_ENGAGEMENT_RATE} AND assigned ≥ ${LOW_ENGAGEMENT_MIN_ASSIGNED} → detected`, () => {
    const inp: PatternInput = {
      byPillar: {
        ...emptyByPillar(),
        finance: {
          assigned: LOW_ENGAGEMENT_MIN_ASSIGNED + 3,
          completed: 1,
          rate: 0.125,
          streakCurrent: 0,
        },
      },
      previousByPillar: null,
      focusHistory: [],
      now: NOW,
    };
    const m = detectPatterns(inp).find((p) => p.type === 'low_engagement');
    expect(m).toBeDefined();
    expect(m!.description).toContain('finance');
  });
  it(`assigned < ${LOW_ENGAGEMENT_MIN_ASSIGNED} → not detected`, () => {
    const inp: PatternInput = {
      byPillar: {
        ...emptyByPillar(),
        finance: {
          assigned: LOW_ENGAGEMENT_MIN_ASSIGNED - 1,
          completed: 0,
          rate: 0,
          streakCurrent: 0,
        },
      },
      previousByPillar: null,
      focusHistory: [],
      now: NOW,
    };
    expect(detectPatterns(inp).find((p) => p.type === 'low_engagement')).toBeUndefined();
  });
  it(`rate ≥ ${LOW_ENGAGEMENT_RATE} → not detected`, () => {
    const inp: PatternInput = {
      byPillar: {
        ...emptyByPillar(),
        finance: { assigned: 10, completed: 4, rate: LOW_ENGAGEMENT_RATE + 0.05, streakCurrent: 1 },
      },
      previousByPillar: null,
      focusHistory: [],
      now: NOW,
    };
    expect(detectPatterns(inp).find((p) => p.type === 'low_engagement')).toBeUndefined();
  });
});

describe('detectPatterns - regression', () => {
  it(`drop > ${SIGNIFICANT_DROP_POINTS} points → detected`, () => {
    const inp: PatternInput = {
      byPillar: {
        ...emptyByPillar(),
        body: { assigned: 10, completed: 5, rate: 0.5, streakCurrent: 0 },
      },
      previousByPillar: {
        ...emptyByPillar(),
        body: { assigned: 10, completed: 9, rate: 0.9, streakCurrent: 4 },
      },
      focusHistory: [],
      now: NOW,
    };
    const m = detectPatterns(inp).find((p) => p.type === 'regression');
    expect(m).toBeDefined();
    expect(m!.description).toContain('body');
    expect(m!.description).toContain('90');
    expect(m!.description).toContain('50');
  });
  it(`drop ≤ ${SIGNIFICANT_DROP_POINTS} → not detected`, () => {
    const inp: PatternInput = {
      byPillar: {
        ...emptyByPillar(),
        body: { assigned: 10, completed: 7, rate: 0.7, streakCurrent: 2 },
      },
      previousByPillar: {
        ...emptyByPillar(),
        body: { assigned: 10, completed: 9, rate: 0.9, streakCurrent: 4 },
      },
      focusHistory: [],
      now: NOW,
    };
    expect(detectPatterns(inp).find((p) => p.type === 'regression')).toBeUndefined();
  });
  it('no previous bilan → not detected', () => {
    const inp: PatternInput = {
      byPillar: {
        ...emptyByPillar(),
        body: { assigned: 10, completed: 1, rate: 0.1, streakCurrent: 0 },
      },
      previousByPillar: null,
      focusHistory: [],
      now: NOW,
    };
    expect(detectPatterns(inp).find((p) => p.type === 'regression')).toBeUndefined();
  });
});

describe('detectPatterns - focus_lock_in', () => {
  function fh(weeks: PillarId[], anchor = '2026-05-31'): PatternInput['focusHistory'] {
    return weeks.map((pillarId, i) => ({
      pillarId,
      startedAt: new Date(Date.parse(anchor) - (weeks.length - i) * 7 * 86_400_000).toISOString(),
      endedAt: new Date(Date.parse(anchor) - (weeks.length - i - 1) * 7 * 86_400_000).toISOString(),
    }));
  }
  it(`${LOCK_IN_WEEKS} consecutive weeks of same pillar → detected`, () => {
    const inp: PatternInput = {
      byPillar: emptyByPillar(),
      previousByPillar: null,
      focusHistory: fh(new Array<PillarId>(LOCK_IN_WEEKS).fill('body')),
      now: NOW,
    };
    const m = detectPatterns(inp).find((p) => p.type === 'focus_lock_in');
    expect(m).toBeDefined();
    expect(m!.description).toContain('body');
  });
  it(`${LOCK_IN_WEEKS - 1} weeks → not detected`, () => {
    const inp: PatternInput = {
      byPillar: emptyByPillar(),
      previousByPillar: null,
      focusHistory: fh(new Array<PillarId>(LOCK_IN_WEEKS - 1).fill('body')),
      now: NOW,
    };
    expect(detectPatterns(inp).find((p) => p.type === 'focus_lock_in')).toBeUndefined();
  });
  it('broken trailing sequence → not detected', () => {
    const inp: PatternInput = {
      byPillar: emptyByPillar(),
      previousByPillar: null,
      focusHistory: fh(['body', 'body', 'mind', 'body']),
      now: NOW,
    };
    expect(detectPatterns(inp).find((p) => p.type === 'focus_lock_in')).toBeUndefined();
  });
});

describe('detectPatterns - sorting + cap', () => {
  it(`sorted by confidence desc, capped at ${DETECTION_MAX_RESULTS_PER_PASS}`, () => {
    const inp: PatternInput = {
      byPillar: {
        body: { assigned: 20, completed: 20, rate: 1.0, streakCurrent: 30 },
        mind: { assigned: 10, completed: 8, rate: 0.8, streakCurrent: 7 },
        finance: { assigned: 10, completed: 1, rate: 0.1, streakCurrent: 0 },
        projects: { assigned: 10, completed: 1, rate: 0.1, streakCurrent: 0 },
      },
      previousByPillar: {
        body: { assigned: 10, completed: 10, rate: 1.0, streakCurrent: 0 },
        mind: { assigned: 10, completed: 8, rate: 0.8, streakCurrent: 0 },
        finance: { assigned: 10, completed: 9, rate: 0.9, streakCurrent: 4 },
        projects: { assigned: 10, completed: 8, rate: 0.8, streakCurrent: 0 },
      },
      focusHistory: [],
      now: NOW,
    };
    const out = detectPatterns(inp);
    expect(out.length).toBeLessThanOrEqual(DETECTION_MAX_RESULTS_PER_PASS);
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1]!.confidence).toBeGreaterThanOrEqual(out[i]!.confidence);
    }
  });
});
