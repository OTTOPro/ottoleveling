import type { PillarId } from '../do/state';

/**
 * Rank tiers: E 0-2, D 3-5, C 6-9, B 10-14, A 15-20,
 * S 21+. Widths grow with the rank because the levelFromXp curve is sqrt-based
 * (level 11 takes much more XP than level 2).
 *
 * Single source of truth - rankFromLevel + titleFromLevel both consult this.
 */
export type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';

interface RankBracket {
  rank: Rank;
  min: number; // inclusive
  max: number; // inclusive (Infinity for S)
}

const RANK_BRACKETS: readonly RankBracket[] = [
  { rank: 'E', min: 0, max: 2 },
  { rank: 'D', min: 3, max: 5 },
  { rank: 'C', min: 6, max: 9 },
  { rank: 'B', min: 10, max: 14 },
  { rank: 'A', min: 15, max: 20 },
  { rank: 'S', min: 21, max: Infinity },
];

/**
 * Per-pillar title strings keyed by (pillarId, rank).
 */
const TITLE_TABLE: Record<PillarId, Record<Rank, string>> = {
  body: {
    E: 'Initiate',
    D: 'Awakened',
    C: 'Iron Body',
    B: 'Hunter',
    A: 'Berserker',
    S: 'Sovereign of Flesh',
  },
  mind: {
    E: 'Novice',
    D: 'Apprentice',
    C: 'Scholar',
    B: 'Sage',
    A: 'Polymath',
    S: 'Sovereign of Mind',
  },
  finance: {
    E: 'Initiate',
    D: 'Saver',
    C: 'Investor',
    B: 'Merchant',
    A: 'Magnate',
    S: 'Sovereign of Wealth',
  },
  projects: {
    E: 'Apprentice',
    D: 'Builder',
    C: 'Engineer',
    B: 'Craftsman',
    A: 'Maker',
    S: 'Sovereign of Creation',
  },
};

/**
 * Composite title strings keyed by rank. Strings are
 * chosen to share NO words with any per-pillar title in TITLE_TABLE, verified
 * by the no-overlap assertion test). The only allowed shared word is
 * "Sovereign" at S-Rank (it's the apex word for all S titles).
 */
const COMPOSITE_TABLE: Record<Rank, string> = {
  E: 'Unranked',
  D: 'Path-Walker',
  C: 'Disciple',
  B: 'Adept',
  A: 'Ascendant',
  S: 'Sovereign of Discipline',
};

/**
 * Composite rank brackets - derived from SUM of 4 pillar levels, not from a
 * single level (so this table is DIFFERENT from RANK_BRACKETS which is per
 * pillar). SUM-derived rather than MAX so the composite rank rewards
 * cross-pillar discipline, not single-pillar specialization. Bracket
 * widths derive from per-pillar bracket sizes × 4 with overlap softening at
 * boundaries.
 */
interface CompositeBracket {
  rank: Rank;
  min: number; // inclusive (sum of levels)
  max: number; // inclusive (Infinity for S)
}

const COMPOSITE_BRACKETS: readonly CompositeBracket[] = [
  { rank: 'E', min: 0, max: 8 },
  { rank: 'D', min: 9, max: 20 },
  { rank: 'C', min: 21, max: 36 },
  { rank: 'B', min: 37, max: 56 },
  { rank: 'A', min: 57, max: 80 },
  { rank: 'S', min: 81, max: Infinity },
];

export interface PillarTitle {
  title: string;
  rank: Rank;
}

export interface CompositeTitle {
  title: string;
  rank: Rank;
}

/**
 * Returns the rank tier for a given level. Negative levels clamp to E.
 * Levels above 21 all map to S.
 */
export function rankFromLevel(level: number): Rank {
  const clamped = Math.max(0, level);
  for (const b of RANK_BRACKETS) {
    if (clamped >= b.min && clamped <= b.max) return b.rank;
  }
  return 'S';
}

/**
 * Returns the per-pillar title string for a given (pillar, level). Internally
 * derives the rank from the level and looks up the matching string in
 * TITLE_TABLE.
 */
export function titleFromLevel(pillarId: PillarId, level: number): string {
  const rank = rankFromLevel(level);
  return TITLE_TABLE[pillarId][rank];
}

/**
 * Composite title formula: SUM of all 4 pillar levels determines the rank via
 * COMPOSITE_BRACKETS (not via per-pillar RANK_BRACKETS - they're different
 * tables). Returns the composite title + the rank letter.
 *
 * Patch the reducer (`sum`) AND COMPOSITE_BRACKETS together if you want
 * MAX-level, AVG-floor, or another formula.
 */
export function compositeTitle(levels: Record<PillarId, number>): CompositeTitle {
  const sum =
    Math.max(0, levels.body) +
    Math.max(0, levels.mind) +
    Math.max(0, levels.finance) +
    Math.max(0, levels.projects);
  const rank = compositeRankFromSum(sum);
  return { title: COMPOSITE_TABLE[rank], rank };
}

/**
 * Lookup helper: maps a composite sum to its rank via COMPOSITE_BRACKETS.
 * Negative sums clamp to E. Exported for testability + reuse if a future
 * surface (e.g., /system [ HUNTER STATUS ]) wants to show the sum→rank
 * progress bar without going through compositeTitle.
 */
export function compositeRankFromSum(sum: number): Rank {
  const clamped = Math.max(0, sum);
  for (const b of COMPOSITE_BRACKETS) {
    if (clamped >= b.min && clamped <= b.max) return b.rank;
  }
  return 'S';
}

/**
 * Progress within the current composite rank bracket.
 * Returns:
 *  - `progress`: 0..1 fraction of the way through the current bracket (clamped).
 *  - `is_max`: true when the player is at S-Rank (max rank - no higher bracket).
 *
 * S-Rank decision B.2-5: renders 100% + "MAX" on the frontend ring.
 */
export function compositeRankProgress(sum: number): { progress: number; is_max: boolean } {
  const clamped = Math.max(0, sum);
  const rank = compositeRankFromSum(clamped);
  if (rank === 'S') return { progress: 1, is_max: true };
  const bracket = COMPOSITE_BRACKETS.find((b) => b.rank === rank);
  if (!bracket || bracket.max === Infinity) return { progress: 1, is_max: true };
  const range = bracket.max - bracket.min;
  if (range <= 0) return { progress: 0, is_max: false };
  const progress = Math.max(0, Math.min(1, (clamped - bracket.min) / range));
  return { progress, is_max: false };
}

/**
 * Renders the {CURRENT_TITLES} placeholder. 4 per-pillar lines (body → mind →
 * finance → projects) + 1 composite line. Each line ≤80 chars. Format:
 *
 *   - body:      Hunter (B-Rank, level 12)
 *   - mind:      Apprentice (D-Rank, level 4)
 *   - finance:   Initiate (E-Rank, level 0)
 *   - projects:  Apprentice (E-Rank, level 1)
 *   - composite: Path-Walker (D-Rank, sum 17 - discipline formula)
 *
 * The composite line surfaces both the rank-letter AND the raw sum so the LLM
 * has visibility into proximity to the next composite bracket (e.g., sum 17
 * is 4 away from C-Rank Disciple at sum 21).
 *
 * Mirrors the {LIFETIME_SNAPSHOT} style for stylistic consistency.
 */
export function formatTitlesSnapshot(levels: Record<PillarId, number>): string {
  const pillars: PillarId[] = ['body', 'mind', 'finance', 'projects'];
  const lines: string[] = [];
  for (const p of pillars) {
    const lvl = levels[p];
    const title = titleFromLevel(p, lvl);
    const rank = rankFromLevel(lvl);
    const pad = (p + ':').padEnd(10);
    lines.push(`- ${pad} ${title} (${rank}-Rank, level ${lvl})`);
  }
  const comp = compositeTitle(levels);
  const sum =
    Math.max(0, levels.body) +
    Math.max(0, levels.mind) +
    Math.max(0, levels.finance) +
    Math.max(0, levels.projects);
  lines.push(`- composite: ${comp.title} (${comp.rank}-Rank, sum ${sum} - discipline formula)`);
  return lines.join('\n');
}
