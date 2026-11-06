export type Difficulty = 'trivial' | 'easy' | 'medium' | 'hard' | 'epic';
export type PenaltyAction = 'fail' | 'skip';

export const PENALTY_RULES: Record<Difficulty, { fail: number; skip: number }> = {
  trivial: { fail: 0.25, skip: 0.1 },
  easy: { fail: 0.4, skip: 0.2 },
  medium: { fail: 0.5, skip: 0.25 },
  hard: { fail: 0.65, skip: 0.4 },
  epic: { fail: 0.8, skip: 0.5 },
};

export function penaltyAmount(
  xp_value: number,
  difficulty: Difficulty,
  action: PenaltyAction,
): number {
  if (!Number.isInteger(xp_value) || xp_value < 0) {
    throw new RangeError(`xp_value must be a non-negative integer, got ${xp_value}`);
  }
  const rule = PENALTY_RULES[difficulty];
  if (!rule) {
    throw new Error(`Unknown difficulty: ${difficulty}`);
  }
  const pct = action === 'fail' ? rule.fail : rule.skip;
  return -Math.round(xp_value * pct);
}
