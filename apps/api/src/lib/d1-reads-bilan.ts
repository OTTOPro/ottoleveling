import type { PillarId } from '../do/state';

export interface GlobalStats {
  total_xp: number;
  total_quests: number;
  completed: number;
  failed: number;
  skipped: number;
  completion_rate: number; // 0..1
}

export interface PillarStats {
  xp: number;
  completed: number;
  failed: number;
  skipped: number;
  assigned: number; // completed + failed + skipped + (unresolved)
  rate: number; // completed / max(assigned, 1)
}

export interface ObjectiveProgressRow {
  id: number;
  title: string;
  progress_pct: number; // 0..1; uses current_value / target_value when both present
  delta_in_period: number; // XP-derived approximation: completions in period for that objective
}

export interface TemplateProgressionRow {
  template_id: number;
  title: string;
  current_value: number;
  last_progressed_at: string | null;
  adjustments_in_period: number; // count of last_progressed_at events within window
}

export interface CheckinsSummary {
  count: number;
  avg_energy: number | null;
  recent_moods: string[];
}

export interface FocusHistoryEntry {
  pillarId: PillarId;
  horizon: string;
  startedAt: string;
  endedAt: string | null;
}

/**
 * Derived physiology aggregate for the bilan period.
 * Powered by daily_metrics rows for hrv_rmssd + sleep_minutes in [periodStart, periodEnd].
 * Null fields indicate no data for that metric in the window.
 */
export interface PhysiologyState {
  hrv_baseline_avg: number | null; // avg hrv_rmssd over the FULL period (null if no rows)
  hrv_period_avg: number | null; // same field - alias for clarity in callers
  hrv_delta_pct: number | null; // (period last-3d avg - prior avg) / prior avg; null if insufficient data
  sleep_period_avg_min: number | null; // avg sleep_minutes over the period (null if no rows)
  worst_sleep_night_min: number | null; // MIN sleep_minutes in the period (null if no rows)
}

export interface BilanStatsInput {
  global: GlobalStats;
  byPillar: Record<PillarId, PillarStats>;
  streaks: Record<PillarId, { current: number; longest_in_period: number }>;
  objectivesProgress: ObjectiveProgressRow[];
  templatesProgress: TemplateProgressionRow[];
  checkinsSummary: CheckinsSummary;
  /** Physiology aggregate for the period. All fields nullable. */
  physiologyState: PhysiologyState;
}

const PILLARS: PillarId[] = ['body', 'mind', 'finance', 'projects'];

function emptyPillarStats(): PillarStats {
  return { xp: 0, completed: 0, failed: 0, skipped: 0, assigned: 0, rate: 0 };
}

export async function getBilanStats(
  db: D1Database,
  periodStart: string,
  periodEnd: string,
): Promise<BilanStatsInput> {
  // ---- Per-pillar quest counts within window ----
  const { results: pillarRows } = await db
    .prepare(
      `SELECT q.pillar_id,
              SUM(CASE WHEN c.status = 'completed' THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN c.status = 'failed'    THEN 1 ELSE 0 END) AS failed,
              SUM(CASE WHEN c.status = 'skipped'   THEN 1 ELSE 0 END) AS skipped,
              COUNT(*) AS assigned
       FROM quests q
       LEFT JOIN completions c ON c.quest_id = q.id
       WHERE q.scheduled_for BETWEEN ? AND ?
       GROUP BY q.pillar_id`,
    )
    .bind(periodStart, periodEnd)
    .all<{
      pillar_id: PillarId;
      completed: number;
      failed: number;
      skipped: number;
      assigned: number;
    }>();

  // ---- Per-pillar XP within window ----
  const { results: xpRows } = await db
    .prepare(
      `SELECT pillar_id, COALESCE(SUM(amount), 0) AS xp
       FROM xp_events
       WHERE date(occurred_at) BETWEEN ? AND ?
       GROUP BY pillar_id`,
    )
    .bind(periodStart, periodEnd)
    .all<{ pillar_id: PillarId; xp: number }>();

  const byPillar: Record<PillarId, PillarStats> = {
    body: emptyPillarStats(),
    mind: emptyPillarStats(),
    finance: emptyPillarStats(),
    projects: emptyPillarStats(),
  };
  for (const r of pillarRows) {
    const s = byPillar[r.pillar_id];
    s.completed = r.completed ?? 0;
    s.failed = r.failed ?? 0;
    s.skipped = r.skipped ?? 0;
    s.assigned = r.assigned ?? 0;
    s.rate = s.assigned > 0 ? s.completed / s.assigned : 0;
  }
  for (const r of xpRows) byPillar[r.pillar_id].xp = r.xp ?? 0;

  // ---- Global totals (sum from byPillar) ----
  const global: GlobalStats = {
    total_xp: 0,
    total_quests: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    completion_rate: 0,
  };
  for (const p of PILLARS) {
    const s = byPillar[p];
    global.total_xp += s.xp;
    global.total_quests += s.assigned;
    global.completed += s.completed;
    global.failed += s.failed;
    global.skipped += s.skipped;
  }
  global.completion_rate = global.total_quests > 0 ? global.completed / global.total_quests : 0;

  // ---- Streaks: from DO state at end of period. The caller passes the DO state
  // separately. d1-reads-bilan computes "longest_in_period" via D1 scan. ----
  const streaks: Record<PillarId, { current: number; longest_in_period: number }> = {
    body: { current: 0, longest_in_period: 0 },
    mind: { current: 0, longest_in_period: 0 },
    finance: { current: 0, longest_in_period: 0 },
    projects: { current: 0, longest_in_period: 0 },
  };
  for (const p of PILLARS) {
    streaks[p].longest_in_period = await longestSuccessStreakInWindow(
      db,
      p,
      periodStart,
      periodEnd,
    );
  }

  // ---- Objectives progress ----
  const { results: objRows } = await db
    .prepare(
      `SELECT o.id, o.title, o.current_value, o.target_value
       FROM objectives o
       WHERE o.status = 'active'`,
    )
    .all<{
      id: number;
      title: string;
      current_value: number | null;
      target_value: number | null;
    }>();

  const objectivesProgress: ObjectiveProgressRow[] = [];
  for (const o of objRows) {
    const progress_pct =
      o.target_value && o.target_value > 0 && o.current_value != null
        ? Math.min(1, o.current_value / o.target_value)
        : 0;
    const deltaRow = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM quests q
         INNER JOIN completions c ON c.quest_id = q.id AND c.status = 'completed'
         WHERE q.objective_id = ? AND q.scheduled_for BETWEEN ? AND ?`,
      )
      .bind(o.id, periodStart, periodEnd)
      .first<{ n: number }>();
    objectivesProgress.push({
      id: o.id,
      title: o.title,
      progress_pct,
      delta_in_period: deltaRow?.n ?? 0,
    });
  }

  // ---- Templates progression adjustments in window ----
  const { results: tplRows } = await db
    .prepare(
      `SELECT id, title, current_value, last_progressed_at
       FROM quest_templates
       WHERE active = 1
       ORDER BY id`,
    )
    .all<{ id: number; title: string; current_value: number; last_progressed_at: string | null }>();

  const templatesProgress: TemplateProgressionRow[] = tplRows.map((t) => {
    const adjusted =
      t.last_progressed_at &&
      t.last_progressed_at.slice(0, 10) >= periodStart &&
      t.last_progressed_at.slice(0, 10) <= periodEnd
        ? 1
        : 0;
    return {
      template_id: t.id,
      title: t.title,
      current_value: t.current_value,
      last_progressed_at: t.last_progressed_at,
      adjustments_in_period: adjusted,
    };
  });

  // ---- Check-ins summary ----
  const { results: checkinRows } = await db
    .prepare(
      `SELECT date, energy_level, mood
       FROM daily_checkins
       WHERE date BETWEEN ? AND ?
       ORDER BY date DESC`,
    )
    .bind(periodStart, periodEnd)
    .all<{ date: string; energy_level: number | null; mood: string | null }>();

  const energies = checkinRows.map((r) => r.energy_level).filter((e): e is number => e != null);
  const checkinsSummary: CheckinsSummary = {
    count: checkinRows.length,
    avg_energy: energies.length > 0 ? energies.reduce((a, b) => a + b, 0) / energies.length : null,
    recent_moods: checkinRows
      .slice(0, 5)
      .map((r) => r.mood)
      .filter((m): m is string => !!m),
  };

  // ---- physiology aggregate for the period ----
  const physiologyState = await getPhysiologyState(db, periodStart, periodEnd);

  return {
    global,
    byPillar,
    streaks,
    objectivesProgress,
    templatesProgress,
    checkinsSummary,
    physiologyState,
  };
}

/**
 * Aggregate hrv_rmssd + sleep_minutes over the bilan period.
 *
 * hrv_baseline_avg / hrv_period_avg: both are the full-period avg of hrv_rmssd.
 * hrv_delta_pct: (last-3-day avg - prior avg) / prior avg (null if <4 rows).
 * sleep_period_avg_min: avg sleep_minutes in the period.
 * worst_sleep_night_min: MIN sleep_minutes (the worst night in the period).
 *
 * All fields are null when no daily_metrics rows exist for the period.
 * D1 failure is caught by the caller (getBilanStats - this is a non-blocking helper).
 */
async function getPhysiologyState(
  db: D1Database,
  periodStart: string,
  periodEnd: string,
): Promise<PhysiologyState> {
  const [hrvRows, sleepRows] = await Promise.all([
    db
      .prepare(
        `SELECT AVG(value) AS avg_val, COUNT(*) AS cnt
           FROM daily_metrics
          WHERE provider = 'google_health'
            AND metric = 'hrv_rmssd'
            AND date >= ? AND date <= ?`,
      )
      .bind(periodStart, periodEnd)
      .first<{ avg_val: number | null; cnt: number }>(),
    db
      .prepare(
        `SELECT AVG(value) AS avg_val, MIN(value) AS min_val, COUNT(*) AS cnt
           FROM daily_metrics
          WHERE provider = 'google_health'
            AND metric = 'sleep_minutes'
            AND date >= ? AND date <= ?`,
      )
      .bind(periodStart, periodEnd)
      .first<{ avg_val: number | null; min_val: number | null; cnt: number }>(),
  ]);

  const hrvAvg = (hrvRows?.cnt ?? 0) > 0 ? (hrvRows?.avg_val ?? null) : null;
  const sleepAvg = (sleepRows?.cnt ?? 0) > 0 ? (sleepRows?.avg_val ?? null) : null;
  const worstNight = (sleepRows?.cnt ?? 0) > 0 ? (sleepRows?.min_val ?? null) : null;

  // hrv_delta_pct: requires at least 4 rows (last 3 vs at least 1 prior). Compute
  // separately only when enough rows exist. If period < 4 rows, omit delta.
  let hrvDeltaPct: number | null = null;
  if ((hrvRows?.cnt ?? 0) >= 4 && hrvAvg != null) {
    // "last 3" vs "prior" = the rest of the period.
    const recentRow = await db
      .prepare(
        `SELECT AVG(value) AS recent_avg
           FROM (
             SELECT value FROM daily_metrics
              WHERE provider = 'google_health'
                AND metric = 'hrv_rmssd'
                AND date >= ? AND date <= ?
              ORDER BY date DESC
              LIMIT 3
           )`,
      )
      .bind(periodStart, periodEnd)
      .first<{ recent_avg: number | null }>();
    const priorRow = await db
      .prepare(
        `SELECT AVG(value) AS prior_avg
           FROM (
             SELECT value FROM daily_metrics
              WHERE provider = 'google_health'
                AND metric = 'hrv_rmssd'
                AND date >= ? AND date <= ?
              ORDER BY date ASC
              LIMIT -1 OFFSET 3
           )`,
      )
      .bind(periodStart, periodEnd)
      .first<{ prior_avg: number | null }>();

    const recent = recentRow?.recent_avg ?? null;
    const prior = priorRow?.prior_avg ?? null;
    if (recent != null && prior != null && prior > 0) {
      hrvDeltaPct = (recent - prior) / prior;
    }
  }

  return {
    hrv_baseline_avg: hrvAvg,
    hrv_period_avg: hrvAvg,
    hrv_delta_pct: hrvDeltaPct,
    sleep_period_avg_min: sleepAvg,
    worst_sleep_night_min: worstNight,
  };
}

/**
 * Walks date by date through [start, end] for a given pillar. A day "succeeds"
 * if there's at least one completion with status='completed' for a quest in
 * that pillar scheduled on that date. Computes the longest run of consecutive
 * successful days fully contained in the window.
 */
async function longestSuccessStreakInWindow(
  db: D1Database,
  pillarId: PillarId,
  periodStart: string,
  periodEnd: string,
): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT q.scheduled_for AS d
       FROM quests q
       INNER JOIN completions c ON c.quest_id = q.id AND c.status = 'completed'
       WHERE q.pillar_id = ? AND q.scheduled_for BETWEEN ? AND ?
       ORDER BY q.scheduled_for`,
    )
    .bind(pillarId, periodStart, periodEnd)
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

export async function getFocusHistoryInPeriod(
  db: D1Database,
  periodStart: string,
  periodEnd: string,
): Promise<FocusHistoryEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT pillar_id, horizon, started_at, ended_at
       FROM focus_periods
       WHERE date(started_at) <= ?
         AND (ended_at IS NULL OR date(ended_at) >= ?)
       ORDER BY started_at`,
    )
    .bind(periodEnd, periodStart)
    .all<{ pillar_id: PillarId; horizon: string; started_at: string; ended_at: string | null }>();

  return results.map((r) => ({
    pillarId: r.pillar_id,
    horizon: r.horizon,
    startedAt: r.started_at,
    endedAt: r.ended_at,
  }));
}

export interface PreviousBilanRef {
  id: number;
  period_type: 'weekly' | 'monthly' | 'yearly';
  period_start: string;
  period_end: string;
  stats: BilanStatsInput;
}

export async function getPreviousBilan(
  db: D1Database,
  periodType: 'weekly' | 'monthly' | 'yearly',
  periodStart: string,
): Promise<PreviousBilanRef | null> {
  const row = await db
    .prepare(
      `SELECT id, period_type, period_start, period_end, stats
       FROM bilans
       WHERE period_type = ? AND period_start < ?
       ORDER BY period_start DESC LIMIT 1`,
    )
    .bind(periodType, periodStart)
    .first<{
      id: number;
      period_type: 'weekly' | 'monthly' | 'yearly';
      period_start: string;
      period_end: string;
      stats: string;
    }>();
  if (!row) return null;
  let parsed: BilanStatsInput;
  try {
    parsed = JSON.parse(row.stats) as BilanStatsInput;
  } catch {
    return null;
  }
  return {
    id: row.id,
    period_type: row.period_type,
    period_start: row.period_start,
    period_end: row.period_end,
    stats: parsed,
  };
}

/**
 * Counts completions per template in a window. Used by
 * SystemAgent.evaluateTemplateProgression to feed evaluateProgression.
 */
export async function countTemplateAttemptsSince(
  db: D1Database,
  templateId: number,
  sinceInclusive: string,
): Promise<{ total: number; successful: number }> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN c.status = 'completed' THEN 1 ELSE 0 END) AS successful
       FROM quests q
       LEFT JOIN completions c ON c.quest_id = q.id
       WHERE q.template_id = ? AND q.scheduled_for >= ?`,
    )
    .bind(templateId, sinceInclusive)
    .first<{ total: number; successful: number | null }>();
  return { total: row?.total ?? 0, successful: row?.successful ?? 0 };
}
