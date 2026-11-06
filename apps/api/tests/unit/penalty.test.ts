import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { penaltyAmount, PENALTY_RULES, type Difficulty } from '../../src/lib/penalty';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

describe('penaltyAmount', () => {
  const cases: Array<[Difficulty, 'fail' | 'skip', number, number]> = [
    // [difficulty, action, xp_value, expected_amount]
    ['trivial', 'fail', 100, -25],
    ['trivial', 'skip', 100, -10],
    ['easy', 'fail', 100, -40],
    ['easy', 'skip', 100, -20],
    ['medium', 'fail', 100, -50],
    ['medium', 'skip', 100, -25],
    ['hard', 'fail', 100, -65],
    ['hard', 'skip', 100, -40],
    ['epic', 'fail', 100, -80],
    ['epic', 'skip', 100, -50],
    // Rounding: 75 * 0.4 = 30
    ['easy', 'fail', 75, -30],
    // Rounding half-up: 33 * 0.65 = 21.45 → round to 21
    ['hard', 'fail', 33, -21],
  ];

  it.each(cases)('%s + %s on xp=%d → %d', (difficulty, action, xp, expected) => {
    expect(penaltyAmount(xp, difficulty, action)).toBe(expected);
  });

  it('rejects negative xp', () => {
    expect(() => penaltyAmount(-1, 'medium', 'fail')).toThrow(RangeError);
  });

  it('rejects unknown difficulty', () => {
    // @ts-expect-error testing runtime guard
    expect(() => penaltyAmount(100, 'bogus', 'fail')).toThrow(Error);
  });
});

describe('PENALTY_RULES mirrors the migration seed', () => {
  it('matches values in migrations/0002_seed_data.sql', () => {
    const seed = readFileSync(
      join(__dirname, '../../../../migrations/0002_seed_data.sql'),
      'utf-8',
    );
    // Guard: if the seed file is moved/renamed/restructured, fail loud
    // instead of silently parsing 0 penalty rows.
    expect(seed).toContain('INSERT INTO penalty_rules');
    // Each row in seed is `('difficulty', fail_pct, skip_pct)` - extract via regex.
    const rowRe = /\('(trivial|easy|medium|hard|epic)',\s*([\d.]+),\s*([\d.]+)\)/g;
    const seedRules: Record<string, { fail: number; skip: number }> = {};
    let match: RegExpExecArray | null;
    while ((match = rowRe.exec(seed)) !== null) {
      const [, diff, fail, skip] = match;
      if (diff && fail && skip) {
        seedRules[diff] = { fail: parseFloat(fail), skip: parseFloat(skip) };
      }
    }
    expect(Object.keys(seedRules).sort()).toEqual(['easy', 'epic', 'hard', 'medium', 'trivial']);
    for (const [diff, expected] of Object.entries(seedRules)) {
      const code = PENALTY_RULES[diff as Difficulty];
      expect(code.fail).toBeCloseTo(expected.fail);
      expect(code.skip).toBeCloseTo(expected.skip);
    }
  });
});
