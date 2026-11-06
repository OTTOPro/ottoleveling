import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import {
  evaluateRule,
  findActionableTemplates,
  autoCompleteEligible,
} from '../../src/lib/auto-complete/evaluate';
import type { AutoCompleteRule } from '../../src/lib/auto-complete/types';

describe('evaluateRule', () => {
  const rule: AutoCompleteRule = {
    type: 'metric_threshold',
    metric: 'steps',
    source: 'google_health',
    threshold: 10000,
    comparison: '>=',
  };

  it('returns true when value >= threshold (>= default)', () => {
    expect(evaluateRule({ ...rule, comparison: undefined }, 10000)).toBe(true);
    expect(evaluateRule({ ...rule, comparison: undefined }, 10001)).toBe(true);
  });

  it('returns false when value < threshold (>= default)', () => {
    expect(evaluateRule({ ...rule, comparison: undefined }, 9999)).toBe(false);
  });

  it('respects explicit > comparison (strict)', () => {
    expect(evaluateRule({ ...rule, comparison: '>' }, 10000)).toBe(false);
    expect(evaluateRule({ ...rule, comparison: '>' }, 10001)).toBe(true);
  });

  it('returns false on NaN value (defensive)', () => {
    expect(evaluateRule(rule, Number.NaN)).toBe(false);
  });
});

describe('findActionableTemplates', () => {
  beforeEach(async () => {
    // Seed: 2 templates. Template A has auto_complete_rule, template B doesn't.
    // Template A has an uncompleted quest scheduled for today.
    // Template B has a quest with a completion already.
    // Clean up test-specific templates (setup-d1.ts only wipes transactional tables,
    // not quest_templates rows inserted by tests).
    await env.DB.prepare(`DELETE FROM quest_templates WHERE id IN (901, 902)`).run();

    const ruleJson = JSON.stringify({
      type: 'metric_threshold',
      metric: 'steps',
      source: 'google_health',
      threshold: 10000,
    });
    await env.DB.prepare(
      `INSERT INTO quest_templates (id, pillar_id, title, base_metric, current_value, starting_value,
         progression_rule, schedule, base_xp, difficulty, created_by, auto_complete_rule)
       VALUES (901, 'body', 'Auto template', 'steps', 10000, 10000,
               '{"type":"none"}', 'daily', 30, 'easy', 'manual', ?)`,
    )
      .bind(ruleJson)
      .run();
    await env.DB.prepare(
      `INSERT INTO quest_templates (id, pillar_id, title, base_metric, current_value, starting_value,
         progression_rule, schedule, base_xp, difficulty, created_by)
       VALUES (902, 'mind', 'Manual template', 'pages', 5, 5,
               '{"type":"none"}', 'daily', 20, 'easy', 'manual')`,
    ).run();
    // Template A quest today (uncompleted)
    await env.DB.prepare(
      `INSERT INTO quests (id, pillar_id, title, xp_value, source, template_id, scheduled_for)
       VALUES (9001, 'body', '10K steps', 30, 'system', 901, '2026-05-31')`,
    ).run();
    // Template B quest today (completed)
    await env.DB.prepare(
      `INSERT INTO quests (id, pillar_id, title, xp_value, source, template_id, scheduled_for)
       VALUES (9002, 'mind', 'Read', 20, 'system', 902, '2026-05-31')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO completions (quest_id, status, xp_awarded) VALUES (9002, 'completed', 20)`,
    ).run();
  });

  it('returns only templates with a non-null rule AND an uncompleted quest in window', async () => {
    const actionable = await findActionableTemplates(env.DB, '2026-05-31');
    expect(actionable).toHaveLength(1);
    expect(actionable[0]!.template.id).toBe(901);
    expect(actionable[0]!.quest.id).toBe(9001);
  });

  it('skips templates whose rule JSON fails Zod parse (defensive - logs + skips)', async () => {
    await env.DB.prepare(
      `UPDATE quest_templates SET auto_complete_rule = '{"type":"nonsense_no_metric"}' WHERE id = 901`,
    ).run();
    const actionable = await findActionableTemplates(env.DB, '2026-05-31');
    expect(actionable).toHaveLength(0);
  });

  it('includes yesterday-quest if uncompleted (1-day lookback)', async () => {
    await env.DB.prepare(`DELETE FROM quests WHERE id = 9001`).run();
    await env.DB.prepare(
      `INSERT INTO quests (id, pillar_id, title, xp_value, source, template_id, scheduled_for)
       VALUES (9003, 'body', '10K steps yesterday', 30, 'system', 901, '2026-05-30')`,
    ).run();
    const actionable = await findActionableTemplates(env.DB, '2026-05-31');
    expect(actionable).toHaveLength(1);
    expect(actionable[0]!.quest.id).toBe(9003);
    expect(actionable[0]!.quest.scheduled_for).toBe('2026-05-30');
  });
});

describe('autoCompleteEligible', () => {
  beforeEach(async () => {
    // Clean up test-specific templates (setup-d1.ts only wipes transactional tables).
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
       VALUES (901, 'body', 'Auto template', 'steps', 10000, 10000,
               '{"type":"none"}', 'daily', 30, 'easy', 'manual', ?)`,
    )
      .bind(ruleJson)
      .run();
    await env.DB.prepare(
      `INSERT INTO quests (id, pillar_id, title, xp_value, source, template_id, scheduled_for)
       VALUES (9001, 'body', '10K steps', 30, 'system', 901, '2026-05-31')`,
    ).run();
  });

  it('returns eligible when matching metric exceeds threshold', async () => {
    await env.DB.prepare(
      `INSERT INTO daily_metrics (date, pillar_id, provider, metric, value)
       VALUES ('2026-05-31', 'body', 'google_health', 'steps', 12000)`,
    ).run();
    const eligible = await autoCompleteEligible(env.DB, '2026-05-31');
    expect(eligible).toHaveLength(1);
    expect(eligible[0]!.quest.id).toBe(9001);
    expect(eligible[0]!.currentMetricValue).toBe(12000);
  });

  it('returns empty when metric value below threshold', async () => {
    await env.DB.prepare(
      `INSERT INTO daily_metrics (date, pillar_id, provider, metric, value)
       VALUES ('2026-05-31', 'body', 'google_health', 'steps', 8000)`,
    ).run();
    const eligible = await autoCompleteEligible(env.DB, '2026-05-31');
    expect(eligible).toHaveLength(0);
  });

  it('returns empty when no matching metric exists', async () => {
    const eligible = await autoCompleteEligible(env.DB, '2026-05-31');
    expect(eligible).toHaveLength(0);
  });
});
