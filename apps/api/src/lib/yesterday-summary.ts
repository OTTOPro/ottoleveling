/**
 * {YESTERDAY_SUMMARY} placeholder.
 *
 * Compact one-liner format (≤200 chars) covering:
 *   - Per-pillar completed/assigned counts
 *   - Missed quests (capped at 3)
 *   - Check-in pain flag extracted from daily_checkins.notes via keyword regex
 *   - Per-pillar + global streak status (maintained / BROKEN)
 *
 * Streak-status derivation contract (fulfilled by the caller in do/generation-context.ts):
 *   - "maintained" when state.streaks[pillar].lastSuccessDate === yesterday's ISO date
 *   - "BROKEN" when yesterday had assigned > 0 AND completed == 0 for the pillar
 *   - Global follows the same rule applied across all 4 pillars combined
 *
 * This helper is PURE - no D1 calls. The caller fans out D1 reads + passes
 * the structured input. See getYesterdayPillarSummary() for the D1 read.
 *
 * Graceful degradation:
 *   - Missed line: OMITTED entirely when missed list is empty (perfect day).
 *   - Check-in pain: always rendered. "none" when checkinPain is null. If no
 *     check-in row at all, the caller passes null AND the derived context knows
 *     to render "(no check-in yesterday)" - handled via checkinNoRow flag.
 *   - Streak lines: always rendered for all 4 pillars + global.
 */
import type { PillarId } from '../do/state';

export interface PillarCounts {
  assigned: number;
  completed: number;
}

export type PillarSummary = Record<PillarId, PillarCounts>;

export type Severity = 'mild' | 'moderate' | 'severe';
export type PainSide = 'left' | 'right' | 'both';

/**
 * {YESTERDAY_SUMMARY} input shape.
 *
 * Streak status derivation (caller-side, NOT recomputed here):
 *   - "maintained" when state.streaks[pillar].lastSuccessDate equals yesterday's ISO date
 *   - "BROKEN" when yesterday had assigned > 0 AND completed == 0 for the pillar
 *   - Global follows the same rule applied across all 4 pillars combined
 *
 * The format helper trusts the caller's derivation - does NOT re-derive.
 * Missed list is capped at 3 entries here (caller can pre-truncate too).
 */
export interface YesterdaySummaryInput {
  yesterdayIso: string;
  perPillar: { pillar: PillarId; completed: number; assigned: number }[];
  /** Missed quests. Cap of 3 applied by this helper regardless of input length. */
  missed: { pillar: PillarId; questTitle: string }[];
  /**
   * Structured pain info extracted from check-in notes.
   * null means EITHER no pain keyword found OR no check-in row at all.
   * Use checkinRowExists to disambiguate the two null cases.
   */
  checkinPain: { area: string; severity: Severity; side?: PainSide } | null;
  /**
   * Whether a daily_checkins row existed for yesterday.
   * When false and checkinPain is null → render "(no check-in yesterday)".
   * When true and checkinPain is null → render "none".
   */
  checkinRowExists: boolean;
  streaks: {
    perPillar: { pillar: PillarId; days: number; status: 'maintained' | 'BROKEN' }[];
    global: { days: number; status: 'maintained' | 'BROKEN' };
  };
}

const PILLAR_LABEL: Record<PillarId, string> = {
  body: 'Body',
  mind: 'Mind',
  finance: 'Finance',
  projects: 'Projects',
};

/**
 * Extract a pain-flag fragment from check-in notes.
 *
 * daily_checkins has no dedicated pain column (id, date, energy_level, mood,
 * notes, created_at - migrations/0001_initial_schema.sql line 118). We
 * extract via a keyword regex over the free-text notes. Cap the matched
 * fragment at 60 chars so the rendered one-liner stays compact.
 *
 * Matches generic pain and body-area words in English and French: pain,
 * douleur, back, dos, knee, genou, shoulder, épaule, tendon, tendinite.
 * Returns null if no keyword match OR notes is null/empty.
 */
// Letter lookarounds instead of \b: \b is ASCII-only and would miss "épaule",
// and a bare "back" or "dos" would also match "feedback" or "dosage".
export const PAIN_AREA_REGEX =
  /(?<!\p{L})(pains?|douleurs?|back|dos|knees?|genoux?|shoulders?|[ée]paules?|tend[oi]n\p{L}*)(?!\p{L})/iu;

export function extractPainFlag(notes: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(PAIN_AREA_REGEX);
  if (!m || m.index === undefined) return null;
  // Return the surrounding fragment (up to 60 chars starting at the match)
  const start = Math.max(0, m.index);
  const end = Math.min(notes.length, start + 60);
  return notes.slice(start, end).trim();
}

/**
 * D1 read for per-pillar yesterday counts.
 *
 * Returns one PillarCounts per pillar, even when zero quests were assigned
 * (format helper renders all 4 pillars unconditionally). "yesterday" =
 * today - 1 in UTC.
 */
export async function getYesterdayPillarSummary(
  db: D1Database,
  today: string,
): Promise<PillarSummary> {
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  const yIso = d.toISOString().slice(0, 10);

  const { results } = await db
    .prepare(
      `SELECT q.pillar_id,
              COUNT(q.id) AS assigned,
              SUM(CASE WHEN c.status = 'completed' THEN 1 ELSE 0 END) AS completed
       FROM quests q
       LEFT JOIN completions c ON c.quest_id = q.id
       WHERE q.scheduled_for = ?
       GROUP BY q.pillar_id`,
    )
    .bind(yIso)
    .all<{ pillar_id: string; assigned: number; completed: number | null }>();

  const summary: PillarSummary = {
    body: { assigned: 0, completed: 0 },
    mind: { assigned: 0, completed: 0 },
    finance: { assigned: 0, completed: 0 },
    projects: { assigned: 0, completed: 0 },
  };
  for (const r of results) {
    if (r.pillar_id in summary) {
      (summary as Record<string, PillarCounts>)[r.pillar_id] = {
        assigned: r.assigned,
        completed: r.completed ?? 0,
      };
    }
  }
  return summary;
}

/**
 * Render the {YESTERDAY_SUMMARY} placeholder.
 *
 * Multi-line format (target ≤200 chars total):
 *
 *   YESTERDAY (2026-05-30):
 *   - Body 2/3, Mind 1/2, Finance 0/1, Projects 1/1
 *   - Missed: Mind "lecture 30 min", Finance "review expenses"
 *   - Check-in pain: lower back mild
 *   - Streaks: body-streak 12d maintained, global-streak 5d BROKEN
 *
 * The Missed line is OMITTED entirely when
 * the missed list is empty (perfect day) - keeps the payload tighter.
 * Check-in pain line is ALWAYS rendered.
 */
export function formatYesterdaySummary(input: YesterdaySummaryInput): string {
  const { yesterdayIso, perPillar, missed, checkinPain, checkinRowExists, streaks } = input;

  // Line 1 - header
  const header = `YESTERDAY (${yesterdayIso}):`;

  // Line 2 - per-pillar counts
  const countsLine =
    '- ' +
    perPillar.map((p) => `${PILLAR_LABEL[p.pillar]} ${p.completed}/${p.assigned}`).join(', ');

  // Line 3 (optional) - missed list, OMITTED entirely when empty (keeps the payload tight)
  const missedTrimmed = missed.slice(0, 3);
  const missedLine =
    missedTrimmed.length === 0
      ? null
      : '- Missed: ' +
        missedTrimmed.map((m) => `${PILLAR_LABEL[m.pillar]} "${m.questTitle}"`).join(', ');

  // Line 4 - check-in pain (always rendered)
  let painLine: string;
  if (checkinPain) {
    const side = checkinPain.side ? ` (${checkinPain.side})` : '';
    painLine = `- Check-in pain: ${checkinPain.area} ${checkinPain.severity}${side}`;
  } else if (!checkinRowExists) {
    painLine = '- Check-in pain: (no check-in yesterday)';
  } else {
    painLine = '- Check-in pain: none';
  }

  // Line 5 - streaks (per-pillar + global)
  const perPillarStreaks = streaks.perPillar
    .map((s) => `${s.pillar}-streak ${s.days}d ${s.status}`)
    .join(', ');
  const streaksLine = `- Streaks: ${perPillarStreaks}, global-streak ${streaks.global.days}d ${streaks.global.status}`;

  return [header, countsLine, missedLine, painLine, streaksLine]
    .filter((x): x is string => x !== null)
    .join('\n');
}
