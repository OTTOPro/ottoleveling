/**
 * Player configuration, read from environment variables.
 *
 * The player's identity and physical constraints are deployment data, not
 * code. They reach the prompts through {PLAYER_NAME}, {PLAYER_PROFILE} and
 * {DAY_JOB_EXCLUSIONS}, and the post-generation validator reads the same
 * profile to build its list of forbidden patterns.
 */

export interface PlayerConfig {
  name: string;
  profile: string;
  dayJobExclusions: string[];
}

export interface PlayerEnv {
  PLAYER_NAME?: string;
  PLAYER_PROFILE?: string;
  DAY_JOB_EXCLUSIONS?: string;
}

export const DEFAULT_PLAYER_NAME = 'Player';

/**
 * Used when PLAYER_PROFILE is unset. Deliberately conservative: with no
 * known constraints, the agent should still avoid maximal or high-impact work.
 */
export const DEFAULT_PLAYER_PROFILE = `No player profile is configured.
Assume an adult with no declared injuries, but stay conservative.
Forbidden: maximal lifts, high-impact plyometrics.
Long-term investing only (no crypto).`;

export function readPlayerConfig(env: PlayerEnv): PlayerConfig {
  const name = env.PLAYER_NAME?.trim() || DEFAULT_PLAYER_NAME;
  const profile = env.PLAYER_PROFILE?.trim() || DEFAULT_PLAYER_PROFILE;
  const dayJobExclusions = (env.DAY_JOB_EXCLUSIONS ?? '')
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return { name, profile, dayJobExclusions };
}

/** Renders the {DAY_JOB_EXCLUSIONS} placeholder: one bullet per excluded domain. */
export function formatDayJobExclusions(exclusions: string[]): string {
  if (exclusions.length === 0) return '- (no day-job domains configured)';
  return exclusions.map((e) => `- ${e}`).join('\n');
}
