import { describe, it, expect } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';

async function seedArcAndStepQuest(opts: {
  arcCompletedSteps: number;
  arcTotalSteps: number;
  arcId?: number;
  questId?: number;
  questArcStep?: number;
}) {
  const arcId = opts.arcId ?? 1;
  const questId = opts.questId ?? 100;
  await env.DB.prepare(
    `INSERT INTO quest_arcs (id, pillar_id, title, description, total_steps, completed_steps, status, started_at, expected_end, total_xp_reward)
     VALUES (?, 'body', 'Trial of Discipline', 'D', ?, ?, 'active', '2026-05-27T08:00:00Z', '2026-06-03T08:00:00Z', 500)`,
  )
    .bind(arcId, opts.arcTotalSteps, opts.arcCompletedSteps)
    .run();
  await env.DB.prepare(
    `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, arc_id, arc_step, scheduled_for)
     VALUES (?, 'body', 'Hip stability circuit (arc step)', 60, 'medium', 'system', ?, ?, '2026-05-28')`,
  )
    .bind(questId, arcId, opts.questArcStep ?? opts.arcCompletedSteps + 1)
    .run();
  return { arcId, questId };
}

describe('Arc advancement on quest completion', () => {
  it('non-final step: increments completed_steps, status stays active', async () => {
    const { arcId, questId } = await seedArcAndStepQuest({
      arcCompletedSteps: 1,
      arcTotalSteps: 7,
    });
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as {
          recordCompletion: (id: number, a: string, n: string | null) => Promise<unknown>;
        }
      ).recordCompletion(questId, 'complete', null);
    });
    const arc = await env.DB.prepare(`SELECT completed_steps, status FROM quest_arcs WHERE id = ?`)
      .bind(arcId)
      .first<{
        completed_steps: number;
        status: string;
      }>();
    expect(arc?.completed_steps).toBe(2);
    expect(arc?.status).toBe('active');
  });

  it('final step: transitions to completed AND inserts bonus xp_event (source_type=arc_completion)', async () => {
    const { arcId, questId } = await seedArcAndStepQuest({
      arcCompletedSteps: 6,
      arcTotalSteps: 7,
    });
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as {
          recordCompletion: (id: number, a: string, n: string | null) => Promise<unknown>;
        }
      ).recordCompletion(questId, 'complete', null);
    });
    const arc = await env.DB.prepare(
      `SELECT completed_steps, status, completed_at FROM quest_arcs WHERE id = ?`,
    )
      .bind(arcId)
      .first<{
        completed_steps: number;
        status: string;
        completed_at: string | null;
      }>();
    expect(arc?.completed_steps).toBe(7);
    expect(arc?.status).toBe('completed');
    expect(arc?.completed_at).not.toBeNull();
    const bonus = await env.DB.prepare(
      `SELECT amount, source_type, source_id FROM xp_events WHERE source_type = 'arc_completion' AND source_id = ?`,
    )
      .bind(arcId)
      .first<{ amount: number; source_type: string; source_id: number }>();
    expect(bonus?.amount).toBe(500);
    expect(bonus?.source_type).toBe('arc_completion');
  });

  it('failed outcome does NOT advance the arc', async () => {
    const { arcId, questId } = await seedArcAndStepQuest({
      arcCompletedSteps: 2,
      arcTotalSteps: 7,
    });
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as {
          recordCompletion: (id: number, a: string, n: string | null) => Promise<unknown>;
        }
      ).recordCompletion(questId, 'fail', null);
    });
    const arc = await env.DB.prepare(`SELECT completed_steps, status FROM quest_arcs WHERE id = ?`)
      .bind(arcId)
      .first<{
        completed_steps: number;
        status: string;
      }>();
    expect(arc?.completed_steps).toBe(2); // unchanged
    expect(arc?.status).toBe('active');
  });

  it('skipped outcome does NOT advance the arc', async () => {
    const { arcId, questId } = await seedArcAndStepQuest({
      arcCompletedSteps: 2,
      arcTotalSteps: 7,
    });
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as {
          recordCompletion: (id: number, a: string, n: string | null) => Promise<unknown>;
        }
      ).recordCompletion(questId, 'skip', null);
    });
    const arc = await env.DB.prepare(`SELECT completed_steps FROM quest_arcs WHERE id = ?`)
      .bind(arcId)
      .first<{ completed_steps: number }>();
    expect(arc?.completed_steps).toBe(2);
  });

  it('completing a non-arc quest does NOT touch any arc rows', async () => {
    await env.DB.prepare(
      `INSERT INTO quest_arcs (id, pillar_id, title, description, total_steps, completed_steps, status, started_at, expected_end, total_xp_reward)
       VALUES (1, 'body', 'A', 'D', 7, 3, 'active', '2026-05-27T08:00:00Z', '2026-06-03T08:00:00Z', 500)`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for)
       VALUES (200, 'mind', 'Read 1 chapter', 30, 'easy', 'system', '2026-05-28')`,
    ).run();
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as {
          recordCompletion: (id: number, a: string, n: string | null) => Promise<unknown>;
        }
      ).recordCompletion(200, 'complete', null);
    });
    const arc = await env.DB.prepare(`SELECT completed_steps FROM quest_arcs WHERE id = 1`).first<{
      completed_steps: number;
    }>();
    expect(arc?.completed_steps).toBe(3); // unchanged
  });
});
