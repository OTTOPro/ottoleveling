import { AutoCompleteRuleSchema } from '../../schemas/auto-complete';
import type { AutoCompleteRule } from './types';
import { getExcludedShowUris } from '../data-sources/spotify-show-filters';

/** Numeric truth test. NaN is always false (defensive). */
export function evaluateRule(rule: AutoCompleteRule, value: number): boolean {
  if (Number.isNaN(value)) return false;
  if (rule.type !== 'metric_threshold') return false;
  const comparison = rule.comparison ?? '>=';
  return comparison === '>=' ? value >= rule.threshold : value > rule.threshold;
}

interface TemplateLite {
  id: number;
  pillar_id: string;
  title: string;
  base_xp: number;
  difficulty: string;
  auto_complete_rule: string;
}

interface QuestLite {
  id: number;
  pillar_id: string;
  title: string;
  xp_value: number;
  difficulty: string;
  template_id: number;
  scheduled_for: string;
}

export interface ActionableTemplate {
  template: TemplateLite;
  quest: QuestLite;
  rule: AutoCompleteRule;
}

/**
 * Returns templates that (a) have a non-null auto_complete_rule that parses,
 * AND (b) have an uncompleted quest scheduled for today OR yesterday (the
 * 1-day lookback covers Google Health's 1-day data lag).
 *
 * Defensive: malformed JSON in auto_complete_rule logs a warning and is skipped
 * (not throws). Same row's quest is excluded from the actionable set.
 */
export async function findActionableTemplates(
  db: D1Database,
  today: string,
): Promise<ActionableTemplate[]> {
  const yesterday = new Date(today + 'T00:00:00Z');
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayIso = yesterday.toISOString().slice(0, 10);

  const { results } = await db
    .prepare(
      `SELECT
         t.id              AS t_id,
         t.pillar_id       AS t_pillar_id,
         t.title           AS t_title,
         t.base_xp         AS t_base_xp,
         t.difficulty      AS t_difficulty,
         t.auto_complete_rule AS t_rule,
         q.id              AS q_id,
         q.pillar_id       AS q_pillar_id,
         q.title           AS q_title,
         q.xp_value        AS q_xp_value,
         q.difficulty      AS q_difficulty,
         q.template_id     AS q_template_id,
         q.scheduled_for   AS q_scheduled_for
       FROM quest_templates t
       INNER JOIN quests q ON q.template_id = t.id
       LEFT JOIN completions c ON c.quest_id = q.id
       WHERE t.auto_complete_rule IS NOT NULL
         AND t.active = 1
         AND q.scheduled_for >= ?
         AND q.scheduled_for <= ?
         AND c.id IS NULL`,
    )
    .bind(yesterdayIso, today)
    .all<{
      t_id: number;
      t_pillar_id: string;
      t_title: string;
      t_base_xp: number;
      t_difficulty: string;
      t_rule: string;
      q_id: number;
      q_pillar_id: string;
      q_title: string;
      q_xp_value: number;
      q_difficulty: string;
      q_template_id: number;
      q_scheduled_for: string;
    }>();

  const actionable: ActionableTemplate[] = [];
  for (const r of results) {
    let parsedRule: AutoCompleteRule;
    try {
      const raw: unknown = JSON.parse(r.t_rule);
      const ok = AutoCompleteRuleSchema.safeParse(raw);
      if (!ok.success) {
        console.warn(
          `[findActionableTemplates] template ${r.t_id} has malformed auto_complete_rule, skipping:`,
          ok.error.issues,
        );
        continue;
      }
      parsedRule = ok.data;
    } catch (err) {
      console.warn(
        `[findActionableTemplates] template ${r.t_id} auto_complete_rule JSON.parse failed:`,
        err,
      );
      continue;
    }

    actionable.push({
      template: {
        id: r.t_id,
        pillar_id: r.t_pillar_id,
        title: r.t_title,
        base_xp: r.t_base_xp,
        difficulty: r.t_difficulty,
        auto_complete_rule: r.t_rule,
      },
      quest: {
        id: r.q_id,
        pillar_id: r.q_pillar_id,
        title: r.q_title,
        xp_value: r.q_xp_value,
        difficulty: r.q_difficulty,
        template_id: r.q_template_id,
        scheduled_for: r.q_scheduled_for,
      },
      rule: parsedRule,
    });
  }
  return actionable;
}

export interface EligibleAutoCompletion {
  template: TemplateLite;
  quest: QuestLite;
  rule: AutoCompleteRule;
  currentMetricValue: number;
}

/**
 * Combines findActionableTemplates with a per-rule SELECT on daily_metrics.
 * For each actionable template, reads the metric value for the rule's source
 * + metric + the QUEST'S scheduled_for date (not today's date). Returns only
 * the templates whose metric satisfies the rule.
 */
export async function autoCompleteEligible(
  db: D1Database,
  today: string,
): Promise<EligibleAutoCompletion[]> {
  const actionable = await findActionableTemplates(db, today);
  const eligible: EligibleAutoCompletion[] = [];

  // Fetch excluded show URIs once (lazily) for filtering library_saves_episodes.
  // Empty set fast-path: no filter needed if no shows are excluded.
  let excludedShowUris: Set<string> | null = null;

  for (const a of actionable) {
    if (a.rule.type !== 'metric_threshold') continue;

    let metricValue: number;

    // For library_saves_episodes, derive the count from library_save_events
    // filtered by excluded shows (forward-only: past completions are untouched).
    // Guard: SQLite IN () empty-clause is a syntax error - always check size > 0.
    if (a.rule.metric === 'library_saves_episodes' && a.rule.source === 'spotify') {
      if (excludedShowUris === null) {
        excludedShowUris = await getExcludedShowUris(db);
      }
      if (excludedShowUris.size === 0) {
        // Fast path: no exclusions - use the existing daily_metrics value.
        const row = await db
          .prepare(`SELECT value FROM daily_metrics WHERE date = ? AND provider = ? AND metric = ?`)
          .bind(a.quest.scheduled_for, a.rule.source, a.rule.metric)
          .first<{ value: number }>();
        if (!row) continue;
        metricValue = row.value;
      } else {
        // Filtered path: recount from library_save_events excluding the URIs.
        const placeholders = [...excludedShowUris].map(() => '?').join(',');
        const row = await db
          .prepare(
            `SELECT COUNT(*) AS n FROM library_save_events
             WHERE date = ? AND listening_type = 'episode_save'
               AND show_or_book_spotify_uri NOT IN (${placeholders})`,
          )
          .bind(a.quest.scheduled_for, ...excludedShowUris)
          .first<{ n: number }>();
        metricValue = row?.n ?? 0;
      }
    } else {
      // All other metrics: use the existing daily_metrics read.
      const row = await db
        .prepare(`SELECT value FROM daily_metrics WHERE date = ? AND provider = ? AND metric = ?`)
        .bind(a.quest.scheduled_for, a.rule.source, a.rule.metric)
        .first<{ value: number }>();
      if (!row) continue;
      metricValue = row.value;
    }

    if (!evaluateRule(a.rule, metricValue)) continue;
    eligible.push({ ...a, currentMetricValue: metricValue });
  }
  return eligible;
}
