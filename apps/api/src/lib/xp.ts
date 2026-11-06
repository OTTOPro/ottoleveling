function assertNonNegativeInt(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
  }
}

export function levelFromXp(xp: number): number {
  assertNonNegativeInt(xp, 'xp');
  return Math.floor(Math.sqrt(xp / 100));
}

export function xpToNextLevel(currentLevel: number): number {
  assertNonNegativeInt(currentLevel, 'currentLevel');
  return Math.pow(currentLevel + 1, 2) * 100;
}
