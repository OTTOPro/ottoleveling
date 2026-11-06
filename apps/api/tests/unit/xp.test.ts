import { describe, it, expect } from 'vitest';
import { levelFromXp, xpToNextLevel } from '../../src/lib/xp';

describe('levelFromXp', () => {
  it.each([
    [0, 0],
    [99, 0],
    [100, 1],
    [399, 1],
    [400, 2],
    [899, 2],
    [900, 3],
    [9999, 9],
    [10000, 10],
    [22500, 15],
  ])('xp=%d → level %d', (xp, level) => {
    expect(levelFromXp(xp)).toBe(level);
  });

  it('rejects negative XP', () => {
    expect(() => levelFromXp(-1)).toThrow(RangeError);
  });

  it('rejects non-integer XP', () => {
    expect(() => levelFromXp(50.5)).toThrow(RangeError);
  });

  it('rejects NaN', () => {
    expect(() => levelFromXp(NaN)).toThrow(RangeError);
  });
});

describe('xpToNextLevel', () => {
  it.each([
    [0, 100],
    [1, 400],
    [2, 900],
    [3, 1600],
    [10, 12100],
  ])('level=%d → next at %d XP', (level, target) => {
    expect(xpToNextLevel(level)).toBe(target);
  });

  it('rejects negative level', () => {
    expect(() => xpToNextLevel(-1)).toThrow(RangeError);
  });

  it('rejects non-integer level', () => {
    expect(() => xpToNextLevel(2.5)).toThrow(RangeError);
  });
});
