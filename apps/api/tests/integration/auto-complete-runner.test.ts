import { describe, it, expect, beforeEach } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import {
  autoCompleteQuest,
  runAutoCompleteAfterSync,
  runAutoCompleteAfterGeneration,
} from '../../src/lib/auto-complete/runner';
import type { SystemAgentState } from '../../src/do/state';

function emptyState(): SystemAgentState {
  return {
    context: {
      userBio: '',
      activePillars: ['body', 'mind', 'finance', 'projects'],
    },
    currentFocus: null,
    patterns: [],
    streaks: {
      body: { current: 0, longest: 0, lastSuccessDate: null },
      mind: { current: 0, longest: 0, lastSuccessDate: null },
      finance: { current: 0, longest: 0, lastSuccessDate: null },
      projects: { current: 0, longest: 0, lastSuccessDate: null },
    },
    counters: {
      llmCallsToday: 0,
      llmCallsTodayResetAt: '2026-05-31T00:00:00.000Z',
    },
    scheduledEvents: [],
    recentUnlocks: [],
    recentAutoCompletions: [],
    activeArcCount: 0,
  } as SystemAgentState;
}

// ============================================================================
// Block 1: autoCompleteQuest - direct helper
// ============================================================================
describe('autoCompleteQuest', () => {
  beforeEach(async () => {
    await env.DB.prepare(`DELETE FROM quest_templates WHERE id IN (901, 902)`).run();
    await env.DB.prepare(
      `INSERT INTO quest_templates (id, pillar_id, title, base_metric, current_value, starting_value,
         progression_rule, schedule, base_xp, difficulty, created_by, auto_complete_rule)
       VALUES (901, 'body', 'Steps quest', 'steps', 10000, 10000,
               '{"type":"none"}', 'daily', 30, 'easy', 'manual',
               '{"type":"metric_threshold","metric":"steps","source":"google_health","threshold":10000}')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO quests (id, pillar_id, title, xp_value, source, template_id, scheduled_for)
       VALUES (9001, 'body', '10K steps', 30, 'system', 901, '2026-05-31')`,
    ).run();
  });

  it('inserts completion source=auto + xp_event, pushes onto state', async () => {
    const state = emptyState();
    const rule = {
      type: 'metric_threshold' as const,
      metric: 'steps',
      source: 'google_health' as const,
      threshold: 10000,
    };

    const result = await autoCompleteQuest(env.DB, env.KV, state, {
      quest: {
        id: 9001,
        pillar_id: 'body',
        title: '10K steps',
        xp_value: 30,
        difficulty: 'easy',
        template_id: 901,
        scheduled_for: '2026-05-31',
      },
      rule,
      metricValue: 12000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok result');
    expect(result.quest_id).toBe(9001);
    expect(typeof result.completion_id).toBe('number');

    // D1 checks
    const comp = await env.DB.prepare(
      `SELECT status, xp_awarded, source FROM completions WHERE quest_id = 9001`,
    ).first<{ status: string; xp_awarded: number; source: string }>();
    expect(comp?.status).toBe('completed');
    expect(comp?.xp_awarded).toBe(30);
    expect(comp?.source).toBe('auto');

    const xpEvent = await env.DB.prepare(
      `SELECT amount, source_type FROM xp_events WHERE source_id = 9001`,
    ).first<{ amount: number; source_type: string }>();
    expect(xpEvent?.amount).toBe(30);
    expect(xpEvent?.source_type).toBe('quest_completed');

    // State mutation
    expect(state.recentAutoCompletions).toHaveLength(1);
    expect(state.recentAutoCompletions[0]!.quest_id).toBe(9001);
    expect(state.recentAutoCompletions[0]!.metric_value).toBe(12000);
    expect(state.recentAutoCompletions[0]!.pillar_id).toBe('body');
  });

  it('returns already_completed when quest has an existing completion (idempotency)', async () => {
    await env.DB.prepare(
      `INSERT INTO completions (quest_id, status, xp_awarded, source) VALUES (9001, 'completed', 30, 'auto')`,
    ).run();

    const state = emptyState();
    const rule = {
      type: 'metric_threshold' as const,
      metric: 'steps',
      source: 'google_health' as const,
      threshold: 10000,
    };

    const result = await autoCompleteQuest(env.DB, env.KV, state, {
      quest: {
        id: 9001,
        pillar_id: 'body',
        title: '10K steps',
        xp_value: 30,
        difficulty: 'easy',
        template_id: 901,
        scheduled_for: '2026-05-31',
      },
      rule,
      metricValue: 12000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected not-ok result');
    expect(result.reason).toBe('already_completed');
    // State is NOT mutated
    expect(state.recentAutoCompletions).toHaveLength(0);
    // No duplicate row
    const count = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM completions WHERE quest_id = 9001`,
    ).first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it('returns already_completed when quest was completed with source=manual (manual-wins guard)', async () => {
    await env.DB.prepare(
      `INSERT INTO completions (quest_id, status, xp_awarded, source) VALUES (9001, 'completed', 30, 'manual')`,
    ).run();

    const state = emptyState();
    const rule = {
      type: 'metric_threshold' as const,
      metric: 'steps',
      source: 'google_health' as const,
      threshold: 10000,
    };

    const result = await autoCompleteQuest(env.DB, env.KV, state, {
      quest: {
        id: 9001,
        pillar_id: 'body',
        title: '10K steps',
        xp_value: 30,
        difficulty: 'easy',
        template_id: 901,
        scheduled_for: '2026-05-31',
      },
      rule,
      metricValue: 12000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected not-ok result');
    expect(result.reason).toBe('already_completed');
    // Source is still 'manual' - not overwritten
    const comp = await env.DB.prepare(
      `SELECT source FROM completions WHERE quest_id = 9001`,
    ).first<{ source: string }>();
    expect(comp?.source).toBe('manual');
    expect(state.recentAutoCompletions).toHaveLength(0);
  });
});

// ============================================================================
// Block 2: runAutoCompleteAfterSync - idempotency via runner
// ============================================================================
describe('runAutoCompleteAfterSync - idempotency', () => {
  beforeEach(async () => {
    await env.DB.prepare(`DELETE FROM quest_templates WHERE id = 901`).run();
    const ruleJson = JSON.stringify({
      type: 'metric_threshold',
      metric: 'steps',
      source: 'google_health',
      threshold: 10000,
    });
    await env.DB.prepare(
      `INSERT INTO quest_templates (id, pillar_id, title, base_metric, current_value, starting_value,
         progression_rule, schedule, base_xp, difficulty, created_by, auto_complete_rule)
       VALUES (901, 'body', 'Steps quest', 'steps', 10000, 10000,
               '{"type":"none"}', 'daily', 30, 'easy', 'manual', ?)`,
    )
      .bind(ruleJson)
      .run();
    await env.DB.prepare(
      `INSERT INTO quests (id, pillar_id, title, xp_value, source, template_id, scheduled_for)
       VALUES (9001, 'body', '10K steps', 30, 'system', 901, '2026-05-31')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO daily_metrics (date, pillar_id, provider, metric, value)
       VALUES ('2026-05-31', 'body', 'google_health', 'steps', 12000)`,
    ).run();
  });

  it('second runner invocation on already-auto-completed quest is a no-op (no INSERT, no XP)', async () => {
    const state = emptyState();

    const result1 = await runAutoCompleteAfterSync(env.DB, env.KV, state, '2026-05-31');
    expect(result1.completed).toBe(1);
    expect(result1.skipped).toBe(0);

    // Count rows after first run
    const compCount1 = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM completions WHERE quest_id = 9001`,
    ).first<{ n: number }>();
    expect(compCount1?.n).toBe(1);

    const xpCount1 = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM xp_events WHERE source_id = 9001`,
    ).first<{ n: number }>();
    expect(xpCount1?.n).toBe(1);

    // Second invocation - quest already completed, must be silent no-op.
    // findActionableTemplates uses LEFT JOIN + c.id IS NULL filter, so the
    // already-completed quest is excluded from eligible list entirely.
    const result2 = await runAutoCompleteAfterSync(env.DB, env.KV, state, '2026-05-31');
    expect(result2.completed).toBe(0);
    expect(result2.attempted).toBe(0); // eligible list is empty - quest already completed

    // Counts unchanged
    const compCount2 = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM completions WHERE quest_id = 9001`,
    ).first<{ n: number }>();
    expect(compCount2?.n).toBe(1);

    const xpCount2 = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM xp_events WHERE source_id = 9001`,
    ).first<{ n: number }>();
    expect(xpCount2?.n).toBe(1);
  });
});

// ============================================================================
// Block 3: runAutoCompleteAfterGeneration - no actionable templates = no-op
// ============================================================================
describe('runAutoCompleteAfterGeneration', () => {
  it('no actionable templates → returns attempted=0, completed=0, skipped=0', async () => {
    // No quest_templates with auto_complete_rule seeded - global setup-d1 reference
    // templates have no auto_complete_rule column value.
    const state = emptyState();
    const result = await runAutoCompleteAfterGeneration(env.DB, env.KV, state, '2026-05-31');
    expect(result.attempted).toBe(0);
    expect(result.completed).toBe(0);
    expect(result.skipped).toBe(0);
    // State not mutated
    expect(state.recentAutoCompletions).toHaveLength(0);
  });
});

// ============================================================================
// Block 4: idempotency and manual-wins cases - via runInDurableObject
// ============================================================================
describe('runAutoCompleteAfterSync - idempotency and manual-wins cases', () => {
  // Helpers generate unique IDs to avoid PK collisions across test runs
  function makeIds() {
    const tplId = Math.floor(Math.random() * 1_000_000) + 100_000;
    const questId = Math.floor(Math.random() * 1_000_000) + 200_000;
    return { tplId, questId };
  }

  async function seedTemplateWithRule(tplId: number): Promise<void> {
    await env.DB.prepare(`DELETE FROM quest_templates WHERE id = ?`).bind(tplId).run();
    const ruleJson = JSON.stringify({
      type: 'metric_threshold',
      metric: 'steps',
      source: 'google_health',
      threshold: 10000,
    });
    await env.DB.prepare(
      `INSERT INTO quest_templates (id, pillar_id, title, base_metric, current_value, starting_value,
         progression_rule, schedule, base_xp, difficulty, created_by, auto_complete_rule)
       VALUES (?, 'body', 'Steps quest', 'steps', 10000, 10000,
               '{"type":"none"}', 'daily', 30, 'easy', 'manual', ?)`,
    )
      .bind(tplId, ruleJson)
      .run();
  }

  async function seedQuestForToday(questId: number, tplId: number): Promise<void> {
    await env.DB.prepare(
      `INSERT INTO quests (id, pillar_id, title, xp_value, source, template_id, scheduled_for)
       VALUES (?, 'body', '10K steps', 30, 'system', ?, '2026-05-31')`,
    )
      .bind(questId, tplId)
      .run();
    await env.DB.prepare(
      `INSERT INTO daily_metrics (date, pillar_id, provider, metric, value)
       VALUES ('2026-05-31', 'body', 'google_health', 'steps', 15000)`,
    ).run();
  }

  it('idempotent - second call with already-auto-completed quest is a no-op (no INSERT, no XP, no state push)', async () => {
    const { tplId, questId } = makeIds();
    await seedTemplateWithRule(tplId);
    await seedQuestForToday(questId, tplId);

    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));

    // First call - should complete
    await runInDurableObject(stub, async (_instance, ctx) => {
      const state =
        (await ctx.storage.get<SystemAgentState>('state')) ??
        ({
          context: { userBio: '', activePillars: ['body', 'mind', 'finance', 'projects'] as const },
          currentFocus: null,
          patterns: [],
          streaks: {
            body: { current: 0, longest: 0, lastSuccessDate: null },
            mind: { current: 0, longest: 0, lastSuccessDate: null },
            finance: { current: 0, longest: 0, lastSuccessDate: null },
            projects: { current: 0, longest: 0, lastSuccessDate: null },
          },
          counters: { llmCallsToday: 0, llmCallsTodayResetAt: new Date(0).toISOString() },
          scheduledEvents: [],
          recentUnlocks: [],
          recentAutoCompletions: [],
          activeArcCount: 0,
        } as SystemAgentState);

      await runAutoCompleteAfterSync(env.DB, env.KV, state, '2026-05-31');
      await ctx.storage.put('state', state);
    });

    const compCount1 = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM completions WHERE quest_id = ?`,
    )
      .bind(questId)
      .first<{ n: number }>();
    expect(compCount1?.n).toBe(1);

    const xpCount1 = await env.DB.prepare(`SELECT COUNT(*) as n FROM xp_events WHERE source_id = ?`)
      .bind(questId)
      .first<{ n: number }>();
    expect(xpCount1?.n).toBe(1);

    // Second call - MUST be no-op
    await runInDurableObject(stub, async (_instance, ctx) => {
      const state = (await ctx.storage.get<SystemAgentState>('state'))!;
      const prevLen = state.recentAutoCompletions.length;

      await runAutoCompleteAfterSync(env.DB, env.KV, state, '2026-05-31');

      // State must not have grown
      expect(state.recentAutoCompletions.length).toBe(prevLen);
      await ctx.storage.put('state', state);
    });

    // Counts must remain unchanged
    const compCount2 = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM completions WHERE quest_id = ?`,
    )
      .bind(questId)
      .first<{ n: number }>();
    expect(compCount2?.n).toBe(1);

    const xpCount2 = await env.DB.prepare(`SELECT COUNT(*) as n FROM xp_events WHERE source_id = ?`)
      .bind(questId)
      .first<{ n: number }>();
    expect(xpCount2?.n).toBe(1);
  });

  it('manual-wins - quest already completed with source=manual is NOT re-completed as auto', async () => {
    const { tplId, questId } = makeIds();
    await seedTemplateWithRule(tplId);
    await seedQuestForToday(questId, tplId);

    // Pre-insert a manual completion
    await env.DB.prepare(
      `INSERT INTO completions (quest_id, status, xp_awarded, source) VALUES (?, 'completed', 30, 'manual')`,
    )
      .bind(questId)
      .run();

    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));

    let stateAutoCompletionsLen = -1;

    await runInDurableObject(stub, async (_instance, ctx) => {
      const state =
        (await ctx.storage.get<SystemAgentState>('state')) ??
        ({
          context: { userBio: '', activePillars: ['body', 'mind', 'finance', 'projects'] as const },
          currentFocus: null,
          patterns: [],
          streaks: {
            body: { current: 0, longest: 0, lastSuccessDate: null },
            mind: { current: 0, longest: 0, lastSuccessDate: null },
            finance: { current: 0, longest: 0, lastSuccessDate: null },
            projects: { current: 0, longest: 0, lastSuccessDate: null },
          },
          counters: { llmCallsToday: 0, llmCallsTodayResetAt: new Date(0).toISOString() },
          scheduledEvents: [],
          recentUnlocks: [],
          recentAutoCompletions: [],
          activeArcCount: 0,
        } as SystemAgentState);

      await runAutoCompleteAfterSync(env.DB, env.KV, state, '2026-05-31');
      stateAutoCompletionsLen = state.recentAutoCompletions.length;
      await ctx.storage.put('state', state);
    });

    // No new completion rows - only the original manual one
    const compCount = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM completions WHERE quest_id = ?`,
    )
      .bind(questId)
      .first<{ n: number }>();
    expect(compCount?.n).toBe(1);

    // Source stays 'manual'
    const comp = await env.DB.prepare(`SELECT source FROM completions WHERE quest_id = ?`)
      .bind(questId)
      .first<{ source: string }>();
    expect(comp?.source).toBe('manual');

    // No new xp_events from the auto path
    const xpCount = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM xp_events WHERE source_id = ? AND description LIKE 'Quest auto-completed%'`,
    )
      .bind(questId)
      .first<{ n: number }>();
    expect(xpCount?.n).toBe(0);

    // State was not pushed with a new auto-completion
    expect(stateAutoCompletionsLen).toBe(0);
  });
});
