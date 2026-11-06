import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';

const getAgent = () => env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));

async function seedTemplate(rule: object, current = 20, starting = 20): Promise<number> {
  const r = await env.DB.prepare(
    `INSERT INTO quest_templates
       (pillar_id, title, base_metric, current_value, starting_value, progression_rule, schedule, base_xp, difficulty, active, created_by, created_at)
     VALUES ('body', 'tpl', 'reps', ?, ?, ?, 'daily', 30, 'medium', 1, 'manual', '2026-05-01 00:00:00')
     RETURNING id`,
  )
    .bind(current, starting, JSON.stringify(rule))
    .first<{ id: number }>();
  if (!r) throw new Error('seed failed');
  return r.id;
}

async function seedAttempt(
  templateId: number,
  date: string,
  status: 'completed' | 'failed' | 'skipped',
): Promise<void> {
  const q = await env.DB.prepare(
    `INSERT INTO quests (pillar_id, title, xp_value, difficulty, source, template_id, scheduled_for) VALUES ('body','q',30,'medium','system',?,?) RETURNING id`,
  )
    .bind(templateId, date)
    .first<{ id: number }>();
  await env.DB.prepare(`INSERT INTO completions (quest_id, status, xp_awarded) VALUES (?, ?, 30)`)
    .bind(q!.id, status)
    .run();
}

describe('SystemAgent.evaluateTemplateProgression', () => {
  it('linear rule: 14 successes → +5', async () => {
    const id = await seedTemplate({ type: 'linear', step: 5, after_successes: 14 }, 20, 20);
    for (let i = 0; i < 14; i++)
      await seedAttempt(id, `2026-05-${(10 + i).toString().padStart(2, '0')}`, 'completed');

    const agent = getAgent();
    const result = await agent.evaluateTemplateProgression();
    expect(result.adjusted).toBe(1);

    const row = await env.DB.prepare(
      `SELECT current_value, last_progressed_at FROM quest_templates WHERE id = ?`,
    )
      .bind(id)
      .first<{ current_value: number; last_progressed_at: string | null }>();
    expect(row!.current_value).toBe(25);
    expect(row!.last_progressed_at).not.toBeNull();
  });

  it('hybrid rule: 10 attempts at 90% success → +5', async () => {
    const id = await seedTemplate(
      {
        type: 'hybrid',
        min_successes: 10,
        success_threshold: 0.8,
        step: 5,
        regression_threshold: 0.5,
        regression_step: -3,
      },
      20,
      20,
    );
    for (let i = 0; i < 9; i++)
      await seedAttempt(id, `2026-05-${(10 + i).toString().padStart(2, '0')}`, 'completed');
    await seedAttempt(id, '2026-05-19', 'failed');

    const agent = getAgent();
    const result = await agent.evaluateTemplateProgression();
    expect(result.adjusted).toBe(1);
    const row = await env.DB.prepare(`SELECT current_value FROM quest_templates WHERE id = ?`)
      .bind(id)
      .first<{ current_value: number }>();
    expect(row!.current_value).toBe(25);
  });

  it('hybrid rule: 10 attempts at 0% → regress floored at starting_value', async () => {
    const id = await seedTemplate(
      {
        type: 'hybrid',
        min_successes: 10,
        success_threshold: 0.8,
        step: 5,
        regression_threshold: 0.5,
        regression_step: -3,
      },
      21,
      20,
    );
    for (let i = 0; i < 10; i++)
      await seedAttempt(id, `2026-05-${(10 + i).toString().padStart(2, '0')}`, 'failed');

    const agent = getAgent();
    const result = await agent.evaluateTemplateProgression();
    expect(result.adjusted).toBe(1);
    const row = await env.DB.prepare(`SELECT current_value FROM quest_templates WHERE id = ?`)
      .bind(id)
      .first<{ current_value: number }>();
    expect(row!.current_value).toBe(20); // floored
  });

  it('none rule: emits skipped audit entry, no adjustment', async () => {
    const id = await seedTemplate({ type: 'none' }, 20, 20);
    for (let i = 0; i < 30; i++)
      await seedAttempt(id, `2026-05-${(10 + (i % 20)).toString().padStart(2, '0')}`, 'completed');

    const agent = getAgent();
    const result = await agent.evaluateTemplateProgression();
    const entry = result.log.find((e) => e.template_id === id);
    expect(entry).toBeDefined();
    expect(entry!.action).toBe('skipped');
    expect(entry!.reason).toBe('rule_type_none');

    const row = await env.DB.prepare(`SELECT current_value FROM quest_templates WHERE id = ?`)
      .bind(id)
      .first<{ current_value: number }>();
    expect(row!.current_value).toBe(20); // unchanged
  });

  it('linear rule under threshold: emits none audit entry with reason text', async () => {
    const id = await seedTemplate({ type: 'linear', step: 5, after_successes: 14 }, 20, 20);
    for (let i = 0; i < 5; i++)
      await seedAttempt(id, `2026-05-${(10 + i).toString().padStart(2, '0')}`, 'completed');

    const agent = getAgent();
    const result = await agent.evaluateTemplateProgression();
    const entry = result.log.find((e) => e.template_id === id);
    expect(entry!.action).toBe('none');
    expect(entry!.reason).toContain('Linear');
  });

  it('progress entries include from/to fields', async () => {
    const id = await seedTemplate({ type: 'linear', step: 5, after_successes: 14 }, 20, 20);
    for (let i = 0; i < 14; i++)
      await seedAttempt(id, `2026-05-${(10 + i).toString().padStart(2, '0')}`, 'completed');

    const agent = getAgent();
    const result = await agent.evaluateTemplateProgression();
    const entry = result.log.find((e) => e.template_id === id);
    expect(entry).toBeDefined();
    if (entry && entry.action === 'progress') {
      expect(entry.from).toBe(20);
      expect(entry.to).toBe(25);
    } else {
      throw new Error(`expected progress entry, got ${entry?.action ?? 'undefined'}`);
    }
  });
});
