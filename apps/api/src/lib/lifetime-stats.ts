import type { PillarId } from '../do/state';
import { levelFromXp } from './xp';

/**
 * Aggregated lifetime totals for a single pillar. Materialized by
 * recomputeLifetimeStats() at the end of every successful daily generation,
 * and on demand via POST /api/admin/recompute-lifetime. Read by generateDaily
 * at the start of each invocation to inject into the {LIFETIME_SNAPSHOT}
 * placeholder for the next day's prompt baseline.
 *
 * Skipped quests are NOT counted in total_completed or total_failed - only
 * status='completed' and status='failed' rows. Matches the streak math in
 * lib/streak.ts which also ignores skips.
 *
 * highest_level is derived from total_xp via levelFromXp; it does NOT track
 * a historical peak across an XP regression (penalties subtract small
 * fractions but the aggregate stays monotonic for engaged users).
 */
export interface LifetimeStatsRow {
  pillar_id: PillarId;
  total_xp: number;
  total_completed: number;
  total_failed: number;
  longest_streak: number;
  highest_level: number;
  first_quest_at: string | null;
  last_updated_at: string | null;
}

const PILLARS: readonly PillarId[] = ['body', 'mind', 'finance', 'projects'] as const;

/**
 * Renders the 4-row lifetime snapshot for {LIFETIME_SNAPSHOT}. Fixed pillar
 * order (body → mind → finance → projects), one line per pillar, max 80
 * chars per line. NULL first_quest_at → "-". total_xp ≥ 100000 → compact
 * "Nk" suffix so longer-history rows stay within the 80-char cap.
 *
 * Compact labels (xp / done / fail / streak / lvl / first) keep heavy rows
 * comfortably under the cap - verbose labels (total_xp / completed / failed
 * / longest_streak / peak_lvl / since) overflowed even on zero rows.
 */
export function formatLifetimeSnapshot(rows: LifetimeStatsRow[]): string {
  const byPillar = new Map(rows.map((r) => [r.pillar_id, r]));
  const lines: string[] = [];

  for (const p of PILLARS) {
    const r = byPillar.get(p) ?? {
      pillar_id: p,
      total_xp: 0,
      total_completed: 0,
      total_failed: 0,
      longest_streak: 0,
      highest_level: 0,
      first_quest_at: null,
      last_updated_at: null,
    };
    const pad = (p + ':').padEnd(9);
    const xp = r.total_xp >= 100000 ? `${Math.floor(r.total_xp / 1000)}k` : String(r.total_xp);
    const first = r.first_quest_at ? r.first_quest_at.slice(0, 10) : '-';
    lines.push(
      `- ${pad} xp ${xp}, done ${r.total_completed}, fail ${r.total_failed}, streak ${r.longest_streak}d, lvl ${r.highest_level}, first ${first}`,
    );
  }
  return lines.join('\n');
}

/**
 * Reads all 4 lifetime rows from D1. Returns them in pillar PK order
 * (alphabetical: body, finance, mind, projects). Callers that need the
 * canonical pillar order (body → mind → finance → projects) should sort or
 * use formatLifetimeSnapshot which re-orders internally.
 */
export async function getLifetimeStats(db: D1Database): Promise<LifetimeStatsRow[]> {
  const { results } = await db
    .prepare(
      `SELECT pillar_id, total_xp, total_completed, total_failed,
              longest_streak, highest_level, first_quest_at, last_updated_at
       FROM lifetime_stats
       ORDER BY pillar_id`,
    )
    .all<LifetimeStatsRow>();
  return results;
}

/**
 * Recomputes lifetime_stats for all 4 pillars from xp_events + completions +
 * quests (sources of truth) and UPSERTs the rows. Idempotent + deterministic:
 * same input data + same call always produce the same row state (except
 * last_updated_at, which is set to datetime('now') server-side).
 *
 * Step semantics per pillar:
 *  - total_xp:        SUM(xp_events.amount) WHERE pillar_id = ?
 *  - total_completed: COUNT(*) FROM completions c JOIN quests q ON c.quest_id = q.id
 *                     WHERE q.pillar_id = ? AND c.status = 'completed'
 *  - total_failed:    same as above but c.status = 'failed'
 *  - longest_streak:  consecutive-day walk over distinct completed-quest dates
 *  - highest_level:   levelFromXp(max(0, total_xp))
 *  - first_quest_at:  MIN(quests.scheduled_for) WHERE quests.pillar_id = ?
 *
 * Returns the post-update rows (re-read) for caller convenience.
 */
export async function recomputeLifetimeStats(db: D1Database): Promise<LifetimeStatsRow[]> {
  for (const p of PILLARS) {
    const [xpRow, completedRow, failedRow, firstRow] = await Promise.all([
      db
        .prepare(`SELECT COALESCE(SUM(amount), 0) AS xp FROM xp_events WHERE pillar_id = ?`)
        .bind(p)
        .first<{ xp: number }>(),
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM completions c
         JOIN quests q ON c.quest_id = q.id
         WHERE q.pillar_id = ? AND c.status = 'completed'`,
        )
        .bind(p)
        .first<{ n: number }>(),
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM completions c
         JOIN quests q ON c.quest_id = q.id
         WHERE q.pillar_id = ? AND c.status = 'failed'`,
        )
        .bind(p)
        .first<{ n: number }>(),
      db
        .prepare(`SELECT MIN(scheduled_for) AS d FROM quests WHERE pillar_id = ?`)
        .bind(p)
        .first<{ d: string | null }>(),
    ]);

    const total_xp = xpRow?.xp ?? 0;
    const total_completed = completedRow?.n ?? 0;
    const total_failed = failedRow?.n ?? 0;
    const first_quest_at = firstRow?.d ?? null;
    const highest_level = levelFromXp(Math.max(0, total_xp));
    const longest_streak = await longestSuccessStreakAllTime(db, p);

    await db
      .prepare(
        `INSERT INTO lifetime_stats
           (pillar_id, total_xp, total_completed, total_failed,
            longest_streak, highest_level, first_quest_at, last_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(pillar_id) DO UPDATE SET
           total_xp        = excluded.total_xp,
           total_completed = excluded.total_completed,
           total_failed    = excluded.total_failed,
           longest_streak  = excluded.longest_streak,
           highest_level   = excluded.highest_level,
           first_quest_at  = excluded.first_quest_at,
           last_updated_at = excluded.last_updated_at`,
      )
      .bind(
        p,
        total_xp,
        total_completed,
        total_failed,
        longest_streak,
        highest_level,
        first_quest_at,
      )
      .run();
  }
  return getLifetimeStats(db);
}

/**
 * Consecutive-day walk over distinct "successful" days for a pillar across
 * full history. A day is successful if at least one quests row for that
 * pillar+scheduled_for has a completions row with status='completed'.
 * Identical algorithm to d1-reads-bilan.longestSuccessStreakInWindow but
 * unbounded.
 */
async function longestSuccessStreakAllTime(db: D1Database, pillarId: PillarId): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT q.scheduled_for AS d
       FROM quests q
       INNER JOIN completions c ON c.quest_id = q.id AND c.status = 'completed'
       WHERE q.pillar_id = ?
       ORDER BY q.scheduled_for`,
    )
    .bind(pillarId)
    .all<{ d: string }>();

  if (results.length === 0) return 0;

  let longest = 1;
  let current = 1;
  for (let i = 1; i < results.length; i++) {
    const prev = new Date(results[i - 1]!.d + 'T00:00:00Z').getTime();
    const cur = new Date(results[i]!.d + 'T00:00:00Z').getTime();
    if (cur - prev === 86_400_000) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }
  return longest;
}
