import { describe, it, expect } from 'vitest';
import {
  computeConsistencyConfidence,
  computeLowEngagementConfidence,
  computeRegressionConfidence,
  computeFocusLockInConfidence,
} from '../../src/lib/patterns/confidence';

describe('computeConsistencyConfidence', () => {
  it('streak=14, rate=1, assigned=10 → 1.0', () => {
    expect(computeConsistencyConfidence({ streakCurrent: 14, rate: 1, assigned: 10 })).toBeCloseTo(
      1.0,
      5,
    );
  });
  it('streak=7, rate=0.7, assigned=5 → mid', () => {
    const c = computeConsistencyConfidence({ streakCurrent: 7, rate: 0.7, assigned: 5 });
    expect(c).toBeGreaterThan(0.4);
    expect(c).toBeLessThan(0.8);
  });
  it('streak=7, rate=0, assigned=0 → low', () => {
    expect(computeConsistencyConfidence({ streakCurrent: 7, rate: 0, assigned: 0 })).toBeLessThan(
      0.4,
    );
  });
  it('streak=30 caps at 1.0 (no overshoot)', () => {
    expect(
      computeConsistencyConfidence({ streakCurrent: 30, rate: 1, assigned: 20 }),
    ).toBeLessThanOrEqual(1.0);
  });
  it('output always in [0, 1]', () => {
    for (const inp of [
      { streakCurrent: 0, rate: 0, assigned: 0 },
      { streakCurrent: 1000, rate: 1, assigned: 1000 },
      { streakCurrent: -5, rate: -1, assigned: -3 },
    ]) {
      const c = computeConsistencyConfidence(inp);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
});

describe('computeLowEngagementConfidence', () => {
  it('rate=0, assigned=20, prev rate=0.2 → high', () => {
    expect(
      computeLowEngagementConfidence({ rate: 0, assigned: 20, previousRate: 0.2 }),
    ).toBeGreaterThan(0.85);
  });
  it('rate=0.25, assigned=5, prev=null → mid', () => {
    const c = computeLowEngagementConfidence({ rate: 0.25, assigned: 5, previousRate: null });
    expect(c).toBeGreaterThan(0.4);
    expect(c).toBeLessThan(0.8);
  });
  it('persistence bumps confidence - same low rate in prev period adds weight', () => {
    const without = computeLowEngagementConfidence({ rate: 0.2, assigned: 10, previousRate: 0.7 });
    const withPrev = computeLowEngagementConfidence({
      rate: 0.2,
      assigned: 10,
      previousRate: 0.25,
    });
    expect(withPrev).toBeGreaterThan(without);
  });
  it('output always in [0, 1]', () => {
    for (const inp of [
      { rate: 0, assigned: 100, previousRate: 0.1 },
      { rate: 1, assigned: 0, previousRate: null },
    ]) {
      const c = computeLowEngagementConfidence(inp);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
});

describe('computeRegressionConfidence', () => {
  it('50pt drop with assigned=20, prev=0.95 → 1.0', () => {
    expect(
      computeRegressionConfidence({ dropPoints: 50, assigned: 20, previousRate: 0.95 }),
    ).toBeCloseTo(1.0, 5);
  });
  it('25pt drop with assigned=5, prev=0.9 → mid', () => {
    const c = computeRegressionConfidence({ dropPoints: 25, assigned: 5, previousRate: 0.9 });
    expect(c).toBeGreaterThan(0.4);
    expect(c).toBeLessThan(0.8);
  });
  it('higher previous rate → higher confidence (drop is more meaningful)', () => {
    const fromHigh = computeRegressionConfidence({
      dropPoints: 30,
      assigned: 10,
      previousRate: 0.95,
    });
    const fromMid = computeRegressionConfidence({
      dropPoints: 30,
      assigned: 10,
      previousRate: 0.55,
    });
    expect(fromHigh).toBeGreaterThan(fromMid);
  });
});

describe('computeFocusLockInConfidence', () => {
  it('4/4 weeks same → at least 0.55', () => {
    expect(computeFocusLockInConfidence({ consecutiveWeeks: 4, totalWeeks: 4 })).toBeGreaterThan(
      0.55,
    );
  });
  it('6/6 weeks same → 1.0', () => {
    expect(computeFocusLockInConfidence({ consecutiveWeeks: 6, totalWeeks: 6 })).toBeCloseTo(
      1.0,
      5,
    );
  });
  it('4/10 weeks same → mid', () => {
    const c = computeFocusLockInConfidence({ consecutiveWeeks: 4, totalWeeks: 10 });
    expect(c).toBeGreaterThan(0.4);
    expect(c).toBeLessThan(0.8);
  });
  it('totalWeeks=0 → safe 0', () => {
    expect(computeFocusLockInConfidence({ consecutiveWeeks: 0, totalWeeks: 0 })).toBe(0);
  });
});
