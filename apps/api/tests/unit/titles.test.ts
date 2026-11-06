import { describe, it, expect } from 'vitest';
import {
  titleFromLevel,
  rankFromLevel,
  compositeTitle,
  compositeRankFromSum,
  formatTitlesSnapshot,
  type Rank,
} from '../../src/lib/titles';

describe('rankFromLevel', () => {
  it.each<[number, Rank]>([
    [0, 'E'],
    [1, 'E'],
    [2, 'E'],
    [3, 'D'],
    [4, 'D'],
    [5, 'D'],
    [6, 'C'],
    [7, 'C'],
    [9, 'C'],
    [10, 'B'],
    [12, 'B'],
    [14, 'B'],
    [15, 'A'],
    [18, 'A'],
    [20, 'A'],
    [21, 'S'],
    [50, 'S'],
    [999, 'S'],
  ])('level %i → rank %s', (level, rank) => {
    expect(rankFromLevel(level)).toBe(rank);
  });

  it('clamps negative levels to E', () => {
    expect(rankFromLevel(-1)).toBe('E');
    expect(rankFromLevel(-100)).toBe('E');
  });
});

describe('titleFromLevel', () => {
  it.each<[string, number, string]>([
    // body
    ['body', 0, 'Initiate'],
    ['body', 2, 'Initiate'],
    ['body', 3, 'Awakened'],
    ['body', 5, 'Awakened'],
    ['body', 6, 'Iron Body'],
    ['body', 9, 'Iron Body'],
    ['body', 10, 'Hunter'],
    ['body', 14, 'Hunter'],
    ['body', 15, 'Berserker'],
    ['body', 20, 'Berserker'],
    ['body', 21, 'Sovereign of Flesh'],
    ['body', 100, 'Sovereign of Flesh'],
    // mind
    ['mind', 0, 'Novice'],
    ['mind', 3, 'Apprentice'],
    ['mind', 6, 'Scholar'],
    ['mind', 10, 'Sage'],
    ['mind', 15, 'Polymath'],
    ['mind', 21, 'Sovereign of Mind'],
    // finance
    ['finance', 0, 'Initiate'],
    ['finance', 3, 'Saver'],
    ['finance', 6, 'Investor'],
    ['finance', 10, 'Merchant'],
    ['finance', 15, 'Magnate'],
    ['finance', 21, 'Sovereign of Wealth'],
    // projects
    ['projects', 0, 'Apprentice'],
    ['projects', 3, 'Builder'],
    ['projects', 6, 'Engineer'],
    ['projects', 10, 'Craftsman'],
    ['projects', 15, 'Maker'],
    ['projects', 21, 'Sovereign of Creation'],
  ])('%s @ level %i → "%s"', (pillarId, level, title) => {
    expect(titleFromLevel(pillarId as 'body' | 'mind' | 'finance' | 'projects', level)).toBe(title);
  });
});

describe('compositeRankFromSum', () => {
  it.each<[number, Rank]>([
    [0, 'E'],
    [5, 'E'],
    [8, 'E'],
    [9, 'D'],
    [15, 'D'],
    [20, 'D'],
    [21, 'C'],
    [30, 'C'],
    [36, 'C'],
    [37, 'B'],
    [50, 'B'],
    [56, 'B'],
    [57, 'A'],
    [70, 'A'],
    [80, 'A'],
    [81, 'S'],
    [100, 'S'],
    [9999, 'S'],
  ])('sum %i → composite rank %s', (sum, rank) => {
    expect(compositeRankFromSum(sum)).toBe(rank);
  });

  it('clamps negative sum to E', () => {
    expect(compositeRankFromSum(-5)).toBe('E');
  });
});

describe('compositeTitle (SUM-derived discipline formula)', () => {
  it('all zeros → sum 0 → E-Rank Unranked', () => {
    const r = compositeTitle({ body: 0, mind: 0, finance: 0, projects: 0 });
    expect(r.rank).toBe('E');
    expect(r.title).toBe('Unranked');
  });

  it('balanced 5,5,5,5 → sum 20 → D-Rank Path-Walker', () => {
    const r = compositeTitle({ body: 5, mind: 5, finance: 5, projects: 5 });
    expect(r.rank).toBe('D');
    expect(r.title).toBe('Path-Walker');
  });

  it("spike build: body 21 only → sum 21 → C-Rank Disciple (NOT S - discipline isn't single-pillar)", () => {
    const r = compositeTitle({ body: 21, mind: 0, finance: 0, projects: 0 });
    expect(r.rank).toBe('C');
    expect(r.title).toBe('Disciple');
  });

  it('high specialist: body 30 only → sum 30 → C-Rank (still C - sum 30 falls in 21-36)', () => {
    const r = compositeTitle({ body: 30, mind: 0, finance: 0, projects: 0 });
    expect(r.rank).toBe('C');
    expect(r.title).toBe('Disciple');
  });

  it('moderately balanced: 12,4,0,1 → sum 17 → D-Rank Path-Walker', () => {
    const r = compositeTitle({ body: 12, mind: 4, finance: 0, projects: 1 });
    expect(r.rank).toBe('D');
    expect(r.title).toBe('Path-Walker');
  });

  it('strong all-around: 15,15,15,15 → sum 60 → A-Rank Ascendant', () => {
    const r = compositeTitle({ body: 15, mind: 15, finance: 15, projects: 15 });
    expect(r.rank).toBe('A');
    expect(r.title).toBe('Ascendant');
  });

  it('S-Rank composite requires sum ≥ 81 (all-pillar mastery)', () => {
    const r = compositeTitle({ body: 21, mind: 21, finance: 21, projects: 18 });
    expect(r.rank).toBe('S');
    expect(r.title).toBe('Sovereign of Discipline');
  });

  it('S-Rank composite NOT reachable by 3-pillar specialization alone (3×21=63 → A only)', () => {
    const r = compositeTitle({ body: 21, mind: 21, finance: 21, projects: 0 });
    expect(r.rank).toBe('A');
    expect(r.title).toBe('Ascendant');
  });
});

describe('Composite strings vs pillar strings - no vocabulary overlap (anti-drift guard)', () => {
  it('no per-pillar title word appears in a non-S composite title', () => {
    const pillarSamples: Array<{
      pillar: 'body' | 'mind' | 'finance' | 'projects';
      level: number;
    }> = [
      { pillar: 'body', level: 0 },
      { pillar: 'body', level: 3 },
      { pillar: 'body', level: 6 },
      { pillar: 'body', level: 10 },
      { pillar: 'body', level: 15 },
      { pillar: 'body', level: 21 },
      { pillar: 'mind', level: 0 },
      { pillar: 'mind', level: 3 },
      { pillar: 'mind', level: 6 },
      { pillar: 'mind', level: 10 },
      { pillar: 'mind', level: 15 },
      { pillar: 'mind', level: 21 },
      { pillar: 'finance', level: 0 },
      { pillar: 'finance', level: 3 },
      { pillar: 'finance', level: 6 },
      { pillar: 'finance', level: 10 },
      { pillar: 'finance', level: 15 },
      { pillar: 'finance', level: 21 },
      { pillar: 'projects', level: 0 },
      { pillar: 'projects', level: 3 },
      { pillar: 'projects', level: 6 },
      { pillar: 'projects', level: 10 },
      { pillar: 'projects', level: 15 },
      { pillar: 'projects', level: 21 },
    ];
    const pillarWords = new Set<string>();
    for (const s of pillarSamples) {
      for (const word of titleFromLevel(s.pillar, s.level)
        .toLowerCase()
        .split(/[\s-]+/)) {
        pillarWords.add(word);
      }
    }

    const compositeSums: Array<{ sum: number; expectedRank: Rank }> = [
      { sum: 0, expectedRank: 'E' },
      { sum: 15, expectedRank: 'D' },
      { sum: 25, expectedRank: 'C' },
      { sum: 45, expectedRank: 'B' },
      { sum: 60, expectedRank: 'A' },
      { sum: 100, expectedRank: 'S' },
    ];
    for (const s of compositeSums) {
      const title = compositeTitle({ body: s.sum, mind: 0, finance: 0, projects: 0 }).title;
      const words = title.toLowerCase().split(/[\s-]+/);
      const overlaps: string[] = [];
      for (const w of words) {
        if (s.expectedRank === 'S' && w === 'sovereign') continue;
        if (['of', 'the'].includes(w)) continue;
        if (pillarWords.has(w)) overlaps.push(w);
      }
      expect(
        overlaps,
        `composite rank ${s.expectedRank} ("${title}") collides with pillar word(s): ${overlaps.join(', ')}`,
      ).toEqual([]);
    }
  });
});

describe('formatTitlesSnapshot', () => {
  it('renders 4 pillar lines + 1 composite line in fixed order', () => {
    const out = formatTitlesSnapshot({ body: 12, mind: 4, finance: 0, projects: 1 });
    const lines = out.split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain('body:');
    expect(lines[0]).toContain('Hunter');
    expect(lines[0]).toContain('B-Rank');
    expect(lines[0]).toContain('level 12');
    expect(lines[1]).toContain('mind:');
    expect(lines[1]).toContain('Apprentice');
    expect(lines[1]).toContain('D-Rank');
    expect(lines[2]).toContain('finance:');
    expect(lines[2]).toContain('Initiate'); // Patched from "Pauper"
    expect(lines[3]).toContain('projects:');
    expect(lines[3]).toContain('Apprentice'); // Patched from "Initiate"
    expect(lines[4]).toContain('composite:');
    expect(lines[4]).toContain('Path-Walker'); // sum=12+4+0+1=17 → D-Rank
    expect(lines[4]).toContain('D-Rank');
    expect(lines[4]).toContain('sum 17');
    expect(lines[4]).toContain('discipline formula');
  });

  it('all 5 lines fit under 80 chars even with longest title (Sovereign of Creation + S-Rank composite)', () => {
    const out = formatTitlesSnapshot({ body: 21, mind: 21, finance: 21, projects: 21 });
    for (const line of out.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });

  it('composite line surfaces the sum so the LLM has bracket-proximity visibility', () => {
    const out = formatTitlesSnapshot({ body: 8, mind: 0, finance: 0, projects: 0 });
    const compositeLine = out.split('\n')[4];
    expect(compositeLine).toContain('sum 8'); // 1 away from D-Rank threshold (sum 9)
    expect(compositeLine).toContain('E-Rank'); // still E (bracket 0-8)
    expect(compositeLine).toContain('Unranked');
  });
});
