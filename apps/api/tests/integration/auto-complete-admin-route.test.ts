import { describe, it, expect, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';

const HEADERS = { 'x-dev-token': 'integration-test-token-deadbeef' };

describe('POST /api/admin/auto-complete-now', () => {
  beforeEach(async () => {
    await env.DB.prepare(`DELETE FROM quest_templates WHERE id = 901`).run();
    const today = new Date().toISOString().slice(0, 10);
    const ruleJson = JSON.stringify({
      type: 'metric_threshold',
      metric: 'steps',
      source: 'google_health',
      threshold: 10000,
    });
    await env.DB.prepare(
      `INSERT INTO quest_templates (id, pillar_id, title, base_metric, current_value, starting_value, progression_rule, schedule, base_xp, difficulty, created_by, auto_complete_rule)
       VALUES (901, 'body', 'Auto template', 'steps', 10000, 10000, '{"type":"none"}', 'daily', 30, 'easy', 'manual', ?)`,
    )
      .bind(ruleJson)
      .run();
    await env.DB.prepare(
      `INSERT INTO quests (id, pillar_id, title, xp_value, source, template_id, scheduled_for, difficulty)
       VALUES (9001, 'body', '10K steps', 30, 'system', 901, ?, 'easy')`,
    )
      .bind(today)
      .run();
    await env.DB.prepare(
      `INSERT INTO daily_metrics (date, pillar_id, provider, metric, value) VALUES (?, 'body', 'google_health', 'steps', 12000)`,
    )
      .bind(today)
      .run();
  });

  it('returns 403 without auth', async () => {
    const res = await SELF.fetch('https://x.test/api/admin/auto-complete-now', { method: 'POST' });
    expect(res.status).toBe(403);
  });

  it('completes the eligible quest on first call', async () => {
    const res = await SELF.fetch('https://x.test/api/admin/auto-complete-now', {
      method: 'POST',
      headers: HEADERS,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { attempted: number; completed: number };
    expect(body.attempted).toBe(1);
    expect(body.completed).toBe(1);
    const comp = await env.DB.prepare(
      `SELECT source FROM completions WHERE quest_id = 9001`,
    ).first<{ source: string }>();
    expect(comp?.source).toBe('auto');
  });

  it('is idempotent on second call', async () => {
    await SELF.fetch('https://x.test/api/admin/auto-complete-now', {
      method: 'POST',
      headers: HEADERS,
    });
    const res = await SELF.fetch('https://x.test/api/admin/auto-complete-now', {
      method: 'POST',
      headers: HEADERS,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { attempted: number; completed: number };
    // After first call, the quest is completed. Second call's findActionableTemplates
    // filters it out via the LEFT JOIN ... WHERE c.id IS NULL clause → attempted: 0.
    expect(body.attempted).toBe(0);
    expect(body.completed).toBe(0);
    const { results } = await env.DB.prepare(
      `SELECT id FROM completions WHERE quest_id = 9001`,
    ).all<{ id: number }>();
    expect(results).toHaveLength(1);
  });
});
