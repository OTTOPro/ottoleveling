import { describe, it, expect } from 'vitest';
import { updateStreak, yesterdayOf, emptyStreak, type PillarStreak } from '../../src/lib/streak';

describe('yesterdayOf', () => {
  it.each([
    ['2026-05-24', '2026-05-23'],
    ['2026-05-01', '2026-04-30'],
    ['2027-01-01', '2026-12-31'],
    ['2024-03-01', '2024-02-29'], // leap year
    ['2025-03-01', '2025-02-28'], // non-leap
  ])('%s → %s', (today, expected) => {
    expect(yesterdayOf(today)).toBe(expected);
  });
});

describe('updateStreak', () => {
  it('first success ever → current=1, longest=1', () => {
    const next = updateStreak(emptyStreak(), '2026-05-24');
    expect(next).toEqual({ current: 1, longest: 1, lastSuccessDate: '2026-05-24' });
  });

  it('same-day duplicate completion → no change', () => {
    const before: PillarStreak = { current: 3, longest: 5, lastSuccessDate: '2026-05-24' };
    const after = updateStreak(before, '2026-05-24');
    expect(after).toEqual(before);
  });

  it('consecutive day → current+=1, longest may bump', () => {
    const before: PillarStreak = { current: 2, longest: 2, lastSuccessDate: '2026-05-23' };
    const after = updateStreak(before, '2026-05-24');
    expect(after).toEqual({ current: 3, longest: 3, lastSuccessDate: '2026-05-24' });
  });

  it('consecutive day when longest is higher → current bumps, longest preserved', () => {
    const before: PillarStreak = { current: 2, longest: 10, lastSuccessDate: '2026-05-23' };
    const after = updateStreak(before, '2026-05-24');
    expect(after).toEqual({ current: 3, longest: 10, lastSuccessDate: '2026-05-24' });
  });

  it('one-day gap → current resets to 1, longest preserved', () => {
    const before: PillarStreak = { current: 5, longest: 5, lastSuccessDate: '2026-05-22' };
    const after = updateStreak(before, '2026-05-24');
    expect(after).toEqual({ current: 1, longest: 5, lastSuccessDate: '2026-05-24' });
  });

  it('multi-day gap → current resets to 1, longest preserved', () => {
    const before: PillarStreak = { current: 7, longest: 7, lastSuccessDate: '2026-05-15' };
    const after = updateStreak(before, '2026-05-24');
    expect(after).toEqual({ current: 1, longest: 7, lastSuccessDate: '2026-05-24' });
  });

  it('month boundary consecutive → current bumps', () => {
    const before: PillarStreak = { current: 4, longest: 4, lastSuccessDate: '2026-04-30' };
    const after = updateStreak(before, '2026-05-01');
    expect(after).toEqual({ current: 5, longest: 5, lastSuccessDate: '2026-05-01' });
  });

  it('year boundary consecutive → current bumps', () => {
    const before: PillarStreak = { current: 9, longest: 9, lastSuccessDate: '2026-12-31' };
    const after = updateStreak(before, '2027-01-01');
    expect(after).toEqual({ current: 10, longest: 10, lastSuccessDate: '2027-01-01' });
  });
});

describe('emptyStreak', () => {
  it('returns the canonical empty state', () => {
    expect(emptyStreak()).toEqual({ current: 0, longest: 0, lastSuccessDate: null });
  });
});
