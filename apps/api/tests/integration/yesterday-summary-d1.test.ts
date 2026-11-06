import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { getYesterdayPillarSummary } from '../../src/lib/yesterday-summary';

describe('getYesterdayPillarSummary', () => {
  beforeEach(async () => {
    await env.DB.prepare(`DELETE FROM completions`).run();
    await env.DB.prepare(`DELETE FROM quests`).run();
  });

  it('counts assigned + completed per pillar for yesterday only', async () => {
    // Today = 2026-05-31, yesterday = 2026-05-30
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for) VALUES (1, 'body', 'q1', 30, 'medium', 'system', '2026-05-30')`,
      ),
      env.DB.prepare(
        `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for) VALUES (2, 'body', 'q2', 30, 'medium', 'system', '2026-05-30')`,
      ),
      env.DB.prepare(
        `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for) VALUES (3, 'mind', 'q3', 20, 'medium', 'system', '2026-05-30')`,
      ),
      env.DB.prepare(
        `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for) VALUES (4, 'body', 'q4-today', 30, 'medium', 'system', '2026-05-31')`,
      ),
      env.DB.prepare(
        `INSERT INTO completions (quest_id, status, xp_awarded) VALUES (1, 'completed', 30)`,
      ),
      env.DB.prepare(
        `INSERT INTO completions (quest_id, status, xp_awarded) VALUES (2, 'failed', 0)`,
      ),
    ]);

    const summary = await getYesterdayPillarSummary(env.DB, '2026-05-31');
    expect(summary.body.assigned).toBe(2);
    expect(summary.body.completed).toBe(1);
    expect(summary.mind.assigned).toBe(1);
    expect(summary.mind.completed).toBe(0);
    expect(summary.finance.assigned).toBe(0);
    expect(summary.finance.completed).toBe(0);
    expect(summary.projects.assigned).toBe(0);
    expect(summary.projects.completed).toBe(0);
  });

  it('returns all-zero counts when no quests existed yesterday', async () => {
    const summary = await getYesterdayPillarSummary(env.DB, '2026-05-31');
    expect(summary.body.assigned).toBe(0);
    expect(summary.body.completed).toBe(0);
    expect(summary.mind.assigned).toBe(0);
    expect(summary.mind.completed).toBe(0);
  });

  it('only counts the previous UTC day, not 2-day-old data', async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for) VALUES (10, 'mind', 'two-day-old', 30, 'medium', 'system', '2026-05-29')`,
      ),
      env.DB.prepare(
        `INSERT INTO completions (quest_id, status, xp_awarded) VALUES (10, 'completed', 30)`,
      ),
    ]);
    const summary = await getYesterdayPillarSummary(env.DB, '2026-05-31');
    // Yesterday = 2026-05-30. The quest is on 2026-05-29 - should NOT count.
    expect(summary.mind.assigned).toBe(0);
  });
});
