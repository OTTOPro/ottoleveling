import type { ObjectiveRow } from './d1';
import type { PillarId } from '../do/state';

export interface PillarLevel {
  pillarId: PillarId;
  xp: number;
  level: number;
  xpToNext: number;
}

export interface PillarPerformance {
  pillarId: PillarId;
  assigned: number; // quests scheduled in window
  completed: number;
  rate: number; // completed / assigned (0 if assigned=0)
}

export interface TemplateForDay {
  id: number;
  pillarId: PillarId;
  title: string;
  baseMetric: string;
  currentValue: number;
  baseXp: number;
  difficulty: string;
}

export interface CheckinSummary {
  date: string;
  energyLevel: number | null;
  mood: string | null;
  notes: string | null;
}

export async function getActiveObjectives(db: D1Database): Promise<ObjectiveRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM objectives WHERE status = 'active' AND deleted_at IS NULL ORDER BY pillar_id, target_date`,
    )
    .all<ObjectiveRow>();
  return results;
}

export async function getPillarLevels(db: D1Database): Promise<PillarLevel[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id AS pillar_id,
              COALESCE((SELECT SUM(amount) FROM xp_events WHERE pillar_id = p.id), 0) AS xp
       FROM pillars p
       ORDER BY p.id`,
    )
    .all<{ pillar_id: PillarId; xp: number }>();

  return results.map((r) => {
    const xpForLevel = Math.max(0, r.xp);
    const level = Math.floor(Math.sqrt(xpForLevel / 100));
    return {
      pillarId: r.pillar_id,
      xp: r.xp,
      level,
      xpToNext: Math.pow(level + 1, 2) * 100,
    };
  });
}

export async function getRecentPerformance(
  db: D1Database,
  sinceDate: string,
  untilDate: string,
): Promise<PillarPerformance[]> {
  const { results } = await db
    .prepare(
      `SELECT q.pillar_id,
              COUNT(*) AS assigned,
              COALESCE(SUM(CASE WHEN c.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed
       FROM quests q
       LEFT JOIN completions c ON c.quest_id = q.id
       WHERE q.scheduled_for BETWEEN ? AND ?
       GROUP BY q.pillar_id`,
    )
    .bind(sinceDate, untilDate)
    .all<{ pillar_id: PillarId; assigned: number; completed: number }>();

  const byPillar = new Map(
    results.map((r) => [
      r.pillar_id,
      {
        pillarId: r.pillar_id,
        assigned: r.assigned,
        completed: r.completed,
        rate: r.assigned > 0 ? r.completed / r.assigned : 0,
      },
    ]),
  );

  const pillars: PillarId[] = ['body', 'mind', 'finance', 'projects'];
  return pillars.map((p) => byPillar.get(p) ?? { pillarId: p, assigned: 0, completed: 0, rate: 0 });
}

export async function getActiveTemplatesForDay(
  db: D1Database,
  dayOfWeek: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun',
): Promise<TemplateForDay[]> {
  const { results } = await db
    .prepare(
      `SELECT id, pillar_id, title, base_metric, current_value, base_xp, difficulty,
              schedule, schedule_config
       FROM quest_templates
       WHERE active = 1 AND deleted_at IS NULL`,
    )
    .all<{
      id: number;
      pillar_id: PillarId;
      title: string;
      base_metric: string;
      current_value: number;
      base_xp: number;
      difficulty: string;
      schedule: string;
      schedule_config: string | null;
    }>();

  const isWeekday = dayOfWeek !== 'sat' && dayOfWeek !== 'sun';

  return results
    .filter((t) => {
      if (t.schedule === 'daily') return true;
      if (t.schedule === 'weekdays') return isWeekday;
      if (t.schedule === 'weekly' || t.schedule === 'custom') {
        if (!t.schedule_config) return false;
        try {
          const cfg = JSON.parse(t.schedule_config) as { day?: string; days?: string[] };
          if (cfg.day) return cfg.day === dayOfWeek;
          if (Array.isArray(cfg.days)) return cfg.days.includes(dayOfWeek);
          return false;
        } catch {
          return false;
        }
      }
      return false;
    })
    .map((t) => ({
      id: t.id,
      pillarId: t.pillar_id,
      title: t.title,
      baseMetric: t.base_metric,
      currentValue: t.current_value,
      baseXp: t.base_xp,
      difficulty: t.difficulty,
    }));
}

export async function getLatestCheckin(db: D1Database): Promise<CheckinSummary | null> {
  const row = await db
    .prepare(
      `SELECT date, energy_level, mood, notes FROM daily_checkins ORDER BY date DESC LIMIT 1`,
    )
    .first<{
      date: string;
      energy_level: number | null;
      mood: string | null;
      notes: string | null;
    }>();
  if (!row) return null;
  return {
    date: row.date,
    energyLevel: row.energy_level,
    mood: row.mood,
    notes: row.notes,
  };
}

/**
 * Count quests assigned to a pillar in a date range with NO successful
 * completion. Used by the DO's recordCompletion to feed the opportunity-aware
 * streak logic (lib/streak.ts streakWithOpportunityCheck).
 */
export async function countMissedOpportunities(
  db: D1Database,
  pillarId: PillarId,
  sinceExclusive: string,
  untilExclusive: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM quests q
       LEFT JOIN completions c ON c.quest_id = q.id
       WHERE q.pillar_id = ?
         AND q.scheduled_for > ?
         AND q.scheduled_for < ?
         AND (c.id IS NULL OR c.status != 'completed')`,
    )
    .bind(pillarId, sinceExclusive, untilExclusive)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

