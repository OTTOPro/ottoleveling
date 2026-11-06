import { describe, it, expect } from 'vitest';
import { streakWithOpportunityCheck, emptyStreak, type PillarStreak } from '../../src/lib/streak';

describe('streakWithOpportunityCheck', () => {
  it('first success ever → current=1, longest=1', () => {
    const next = streakWithOpportunityCheck(emptyStreak(), '2026-05-24', 0);
    expect(next).toEqual({ current: 1, longest: 1, lastSuccessDate: '2026-05-24' });
  });

  it('same-day duplicate completion → no change', () => {
    const before: PillarStreak = { current: 3, longest: 5, lastSuccessDate: '2026-05-24' };
    expect(streakWithOpportunityCheck(before, '2026-05-24', 0)).toEqual(before);
  });

  it('consecutive day, 0 missed opportunities → current+=1', () => {
    const before: PillarStreak = { current: 2, longest: 2, lastSuccessDate: '2026-05-23' };
    expect(streakWithOpportunityCheck(before, '2026-05-24', 0)).toEqual({
      current: 3,
      longest: 3,
      lastSuccessDate: '2026-05-24',
    });
  });

  it('multi-day gap with 0 missed opportunities (neutral days) → current+=1, streak survives', () => {
    const before: PillarStreak = { current: 5, longest: 5, lastSuccessDate: '2026-05-20' };
    // 3 gap days (21, 22, 23) all had zero quests assigned → neutral
    expect(streakWithOpportunityCheck(before, '2026-05-24', 0)).toEqual({
      current: 6,
      longest: 6,
      lastSuccessDate: '2026-05-24',
    });
  });

  it('gap with 1 missed opportunity → current resets to 1, longest preserved', () => {
    const before: PillarStreak = { current: 5, longest: 5, lastSuccessDate: '2026-05-22' };
    expect(streakWithOpportunityCheck(before, '2026-05-24', 1)).toEqual({
      current: 1,
      longest: 5,
      lastSuccessDate: '2026-05-24',
    });
  });

  it('gap with multiple missed opportunities → current resets to 1', () => {
    const before: PillarStreak = { current: 7, longest: 7, lastSuccessDate: '2026-05-15' };
    expect(streakWithOpportunityCheck(before, '2026-05-24', 4)).toEqual({
      current: 1,
      longest: 7,
      lastSuccessDate: '2026-05-24',
    });
  });

  it('longest preserved when current+=1 does not exceed it', () => {
    const before: PillarStreak = { current: 2, longest: 10, lastSuccessDate: '2026-05-23' };
    expect(streakWithOpportunityCheck(before, '2026-05-24', 0)).toEqual({
      current: 3,
      longest: 10,
      lastSuccessDate: '2026-05-24',
    });
  });

  it('first success ever with prior fail-only history (missedOpportunities=1) → still becomes 1', () => {
    // Edge: lastSuccessDate is null but the pillar had failed quests yesterday.
    // First-success branch wins; missedOpportunities ignored when lastSuccessDate is null.
    const next = streakWithOpportunityCheck(emptyStreak(), '2026-05-24', 1);
    expect(next).toEqual({ current: 1, longest: 1, lastSuccessDate: '2026-05-24' });
  });
});
