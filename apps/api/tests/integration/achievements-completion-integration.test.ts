import { describe, it, expect } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import type { SystemAgentState } from '../../src/do/state';

type RecordCompletionFn = (
  questId: number,
  action: 'complete' | 'fail' | 'skip',
  notes: string | null,
  todayOverride?: string,
) => Promise<{ ok: boolean }>;

type GetStateFn = () => Promise<SystemAgentState>;

describe('recordCompletion → evaluateOnCompletion integration', () => {
  it('fires body_first_step on first body completion + appends to DO state.recentUnlocks', async () => {
    await env.DB.prepare(
      `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for)
       VALUES (10, 'body', 'first body', 50, 'medium', 'manual', '2026-05-15')`,
    ).run();

    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (instance as unknown as { recordCompletion: RecordCompletionFn }).recordCompletion(
        10,
        'complete',
        null,
      );
    });

    const row = await env.DB.prepare(
      `SELECT unlocked_at FROM achievements WHERE id = 'body_first_step'`,
    ).first<{ unlocked_at: string | null }>();
    expect(row?.unlocked_at).not.toBeNull();

    await runInDurableObject(stub, async (instance) => {
      const state = await (instance as unknown as { getState: GetStateFn }).getState();
      expect(state.recentUnlocks.map((u) => u.id)).toContain('body_first_step');
    });
  });

  it('does NOT re-fire body_first_step on second body completion (idempotent)', async () => {
    await env.DB.prepare(
      `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for)
       VALUES (11, 'body', 'first', 50, 'medium', 'manual', '2026-05-15'),
              (12, 'body', 'second', 50, 'medium', 'manual', '2026-05-16')`,
    ).run();

    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      const agent = instance as unknown as {
        recordCompletion: RecordCompletionFn;
        getState: GetStateFn;
      };
      await agent.recordCompletion(11, 'complete', null);
      const state1 = await agent.getState();
      const firstCallCount = state1.recentUnlocks.filter((u) => u.id === 'body_first_step').length;
      await agent.recordCompletion(12, 'complete', null);
      const state2 = await agent.getState();
      const secondCallCount = state2.recentUnlocks.filter((u) => u.id === 'body_first_step').length;
      expect(secondCallCount).toBe(firstCallCount);
    });
  });

  it('a corrupted trigger_config does NOT void the completion', async () => {
    await env.DB.prepare(
      `UPDATE achievements SET trigger_config = 'not-json' WHERE id = 'body_first_step'`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for)
       VALUES (13, 'body', 'q', 50, 'medium', 'manual', '2026-05-15')`,
    ).run();

    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      const result = await (
        instance as unknown as { recordCompletion: RecordCompletionFn }
      ).recordCompletion(13, 'complete', null);
      expect(result.ok).toBe(true);
    });
  });
});
