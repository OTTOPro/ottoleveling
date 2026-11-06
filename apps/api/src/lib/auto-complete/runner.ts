import { autoCompleteEligible } from './evaluate';
import { pushRecentAutoCompletions } from '../../do/state';
import type { SystemAgentState } from '../../do/state';
import type { AutoCompleteRule, AutoCompletion, AutoCompletionResult } from './types';
import { invalidateTodayCache } from '../cache';

interface AutoCompleteQuestArgs {
  quest: {
    id: number;
    pillar_id: string;
    title: string;
    xp_value: number;
    difficulty: string;
    template_id: number;
    scheduled_for: string;
  };
  rule: AutoCompleteRule;
  metricValue: number;
}

/**
 * Internal helper - atomic D1 batch (INSERT completions with source='auto' +
 * INSERT xp_events), defensive idempotency SELECT, KV cache invalidation,
 * push onto state.recentAutoCompletions.
 *
 * Side effects intentionally OMITTED (vs. recordCompletion):
 *   - streak update
 *   - achievement evaluation
 *   - arc-step advancement
 * These are deliberate - auto-completion is soft automation; promoting it to
 * the full primary-action footprint is possible later if usage demands.
 */
export async function autoCompleteQuest(
  db: D1Database,
  kv: KVNamespace,
  state: SystemAgentState,
  args: AutoCompleteQuestArgs,
): Promise<AutoCompletionResult> {
  const { quest, rule, metricValue } = args;

  // Defensive pre-check - covers BOTH refinement-1 cases (idempotency +
  // manual-wins): any existing completion for this quest (regardless of source)
  // means we bail without batch attempt.
  const existing = await db
    .prepare(`SELECT id FROM completions WHERE quest_id = ?`)
    .bind(quest.id)
    .first<{ id: number }>();
  if (existing) {
    return { ok: false, quest_id: quest.id, reason: 'already_completed' };
  }

  const description = `Quest auto-completed: ${quest.title}`;
  const batchResults = await db.batch([
    db
      .prepare(
        `INSERT INTO completions (quest_id, status, xp_awarded, source) VALUES (?, 'completed', ?, 'auto') RETURNING id`,
      )
      .bind(quest.id, quest.xp_value),
    db
      .prepare(
        `INSERT INTO xp_events (pillar_id, amount, source_type, source_id, description)
         VALUES (?, ?, 'quest_completed', ?, ?)`,
      )
      .bind(quest.pillar_id, quest.xp_value, quest.id, description),
  ]);

  const compRow = batchResults[0]?.results?.[0] as { id: number } | undefined;
  if (!compRow) {
    return { ok: false, quest_id: quest.id, reason: 'insert_failed' };
  }

  await invalidateTodayCache(kv, quest.scheduled_for);

  const completion: AutoCompletion = {
    id: crypto.randomUUID(),
    quest_id: quest.id,
    quest_title: quest.title,
    pillar_id: quest.pillar_id as AutoCompletion['pillar_id'],
    rule,
    metric_value: metricValue,
    fired_at: new Date().toISOString(),
  };
  pushRecentAutoCompletions(state, [completion]);

  return { ok: true, completion_id: compRow.id, quest_id: quest.id };
}

export interface AutoCompleteRunResult {
  attempted: number;
  completed: number;
  skipped: number;
}

async function runAutoComplete(
  db: D1Database,
  kv: KVNamespace,
  state: SystemAgentState,
  today: string,
): Promise<AutoCompleteRunResult> {
  // Forward-fill the FIFO field defensively - older persisted state may lack it.
  state.recentAutoCompletions = state.recentAutoCompletions ?? [];

  const eligible = await autoCompleteEligible(db, today);
  let completed = 0;
  let skipped = 0;
  for (const e of eligible) {
    const result = await autoCompleteQuest(db, kv, state, {
      quest: e.quest,
      rule: e.rule,
      metricValue: e.currentMetricValue,
    });
    if (result.ok) completed++;
    else skipped++;
  }
  return { attempted: eligible.length, completed, skipped };
}

/** Post-sync firing point (metrics arrived after the quest was created). */
export async function runAutoCompleteAfterSync(
  db: D1Database,
  kv: KVNamespace,
  state: SystemAgentState,
  today: string,
): Promise<AutoCompleteRunResult> {
  return runAutoComplete(db, kv, state, today);
}

/** Post-generation firing point (quest created after the metrics arrived). */
export async function runAutoCompleteAfterGeneration(
  db: D1Database,
  kv: KVNamespace,
  state: SystemAgentState,
  today: string,
): Promise<AutoCompleteRunResult> {
  return runAutoComplete(db, kv, state, today);
}
