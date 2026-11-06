import { describe, it, expect } from 'vitest';
import {
  forbiddenPatternsFromProfile,
  forbiddenPatternsFromTemplates,
  matchesPattern,
  tokenize,
  validateQuests,
  type ForbiddenPattern,
} from '../../src/lib/quest-validator';
import { DEFAULT_PLAYER_PROFILE } from '../../src/lib/player';
import { EXAMPLE_PLAYER_PROFILE } from '../fixtures/player-profile';

type Q = { pillar_id: string; title: string; description?: string | null };

const fallback = (pillar: string): Q => ({
  pillar_id: pillar,
  title: `Fallback ${pillar}`,
  description: null,
});

function phrases(patterns: ForbiddenPattern[]): string[] {
  return patterns.map((p) => p.phrase);
}

describe('forbiddenPatternsFromProfile', () => {
  it('reads the Forbidden: list and the (no X) aside from the example profile', () => {
    expect(phrases(forbiddenPatternsFromProfile(EXAMPLE_PLAYER_PROFILE))).toEqual([
      'heavy deadlifts',
      'loaded spinal flexion',
      'high impact plyometrics',
      'crypto',
    ]);
  });

  it('does not read the Prioritize: list', () => {
    const p = phrases(forbiddenPatternsFromProfile(EXAMPLE_PLAYER_PROFILE));
    expect(p).not.toContain('swimming');
    expect(p.some((x) => x.includes('dead bugs'))).toBe(false);
  });

  it('reads the default profile', () => {
    expect(phrases(forbiddenPatternsFromProfile(DEFAULT_PLAYER_PROFILE))).toEqual([
      'maximal lifts',
      'high impact plyometrics',
      'crypto',
    ]);
  });

  it('splits on "and" and semicolons', () => {
    const p = forbiddenPatternsFromProfile('Forbidden: overhead presses; sprints and box jumps.');
    expect(phrases(p)).toEqual(['overhead presses', 'sprints', 'box jumps']);
  });

  it('returns nothing for a profile without constraints', () => {
    expect(forbiddenPatternsFromProfile('Likes running.')).toEqual([]);
  });
});

describe('forbiddenPatternsFromTemplates', () => {
  it('reads metadata.contraindicated and normalizes underscores', () => {
    const p = forbiddenPatternsFromTemplates([
      { id: 4, metadata: '{"contraindicated":["heavy_deadlift","high_impact_plyo"]}' },
      { id: 5, metadata: null },
      { id: 6, metadata: 'not json' },
      { id: 7, metadata: '{"contraindicated":"not-an-array"}' },
    ]);
    expect(phrases(p)).toEqual(['heavy deadlift', 'high impact plyo']);
    expect(p[0]).toMatchObject({ source: 'template', templateId: 4 });
  });
});

describe('matchesPattern', () => {
  const [plyo] = forbiddenPatternsFromTemplates([
    { id: 1, metadata: '{"contraindicated":["high_impact_plyo"]}' },
  ]);

  it('matches consecutive words with prefix matching on long words', () => {
    expect(matchesPattern(tokenize('High-impact plyometric box jumps'), plyo!)).toBe(true);
  });

  it('does not match words out of order or apart', () => {
    expect(matchesPattern(tokenize('plyometric warm-up, high impact avoided'), plyo!)).toBe(false);
  });

  it('matches the singular when the profile lists the plural', () => {
    const [p] = forbiddenPatternsFromProfile('Forbidden: high-impact plyometrics.');
    expect(matchesPattern(tokenize('High impact plyometric circuit'), p!)).toBe(true);
  });

  it('matches plurals through the prefix rule', () => {
    const [p] = forbiddenPatternsFromProfile('Forbidden: heavy deadlift.');
    expect(matchesPattern(tokenize('Heavy deadlifts 5x5'), p!)).toBe(true);
  });

  it('requires exact matches for short words', () => {
    const p: ForbiddenPattern = { phrase: 'run', tokens: ['run'], source: 'profile' };
    expect(matchesPattern(tokenize('Easy run'), p)).toBe(true);
    expect(matchesPattern(tokenize('Runway review'), p)).toBe(false);
  });
});

describe('validateQuests', () => {
  const patterns = forbiddenPatternsFromProfile(EXAMPLE_PLAYER_PROFILE);

  it('keeps quests that match nothing, in order', () => {
    const quests: Q[] = [
      {
        pillar_id: 'body',
        title: 'Core stability circuit',
        description: 'Dead bugs, side planks.',
      },
      { pillar_id: 'mind', title: 'Read 20 pages' },
    ];
    const res = validateQuests(quests, patterns, fallback);
    expect(res.quests).toEqual(quests);
    expect(res.rejected).toEqual([]);
  });

  it('replaces a forbidden quest with the fallback of its pillar', () => {
    const quests: Q[] = [
      { pillar_id: 'body', title: 'Heavy deadlifts 5x5', description: 'Work up to a top set.' },
      { pillar_id: 'mind', title: 'Read 20 pages' },
    ];
    const res = validateQuests(quests, patterns, fallback);
    expect(res.quests.map((q) => q.title)).toEqual(['Fallback body', 'Read 20 pages']);
    expect(res.rejected).toEqual([
      {
        index: 0,
        pillar_id: 'body',
        title: 'Heavy deadlifts 5x5',
        pattern: 'heavy deadlifts',
        source: 'profile',
      },
    ]);
  });

  it('checks the description, not only the title', () => {
    const quests: Q[] = [
      { pillar_id: 'finance', title: 'Portfolio review', description: 'Rebalance into crypto.' },
    ];
    const res = validateQuests(quests, patterns, fallback);
    expect(res.quests[0]!.title).toBe('Fallback finance');
    expect(res.rejected[0]!.pattern).toBe('crypto');
  });

  it('uses a pillar fallback once and drops further rejections in that pillar', () => {
    const quests: Q[] = [
      { pillar_id: 'body', title: 'Heavy deadlifts' },
      { pillar_id: 'body', title: 'Loaded spinal flexion drills' },
    ];
    const res = validateQuests(quests, patterns, fallback);
    expect(res.quests.map((q) => q.title)).toEqual(['Fallback body']);
    expect(res.rejected).toHaveLength(2);
  });
});
