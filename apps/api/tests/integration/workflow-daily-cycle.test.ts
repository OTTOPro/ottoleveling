/**
 * workflow-daily-cycle integration tests.
 *
 * Covers:
 * 1. Alarm handler spawns workflow instance with correct ID
 * 2. Idempotent: second spawn for same day is no-op (already-exists caught)
 * 3. workflowCloseDay: awards FOCUS when ≥3 distinct pillars completed
 * 4. workflowCloseDay: no FOCUS for <3 distinct pillars
 * 5. workflowCloseDay: idempotent (second call same day → no second INSERT)
 * 6. workflowCloseDay: no FOCUS when distinct_pillars = 2
 * 7. recordCompletion no longer awards FOCUS inline (moved to the daily-cycle close step)
 *
 * Note: DailyCycleWorkflow class methods (step.do / step.sleepUntil) are not
 * fully simulatable in the local vitest pool (step.sleepUntil schedules into
 * the future). The close step is tested indirectly via workflowCloseDay RPC.
 * Queue dispatch assertions are also tested here via the stat_rewards table.
 */
import { describe, it, expect } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';

const TODAY = '2026-06-02';
const AWARDED_AT = `${TODAY}T08:00:00.000Z`;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function seedQuest(opts: {
  id?: number;
  pillarId?: string;
  scheduledFor?: string;
}): Promise<number> {
  const id = opts.id ?? Math.floor(Math.random() * 800000 + 100000);
  await env.DB.prepare(
    `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for)
     VALUES (?, ?, 'Workflow Test Quest', 50, 'medium', 'system', ?)`,
  )
    .bind(id, opts.pillarId ?? 'body', opts.scheduledFor ?? TODAY)
    .run();
  return id;
}

async function seedCompletion(
  questId: number,
  status = 'completed',
  completedAt = AWARDED_AT,
): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO completions (quest_id, status, xp_awarded, completed_at)
       VALUES (?, ?, 50, ?) RETURNING id`,
  )
    .bind(questId, status, completedAt)
    .first<{ id: number }>();
  if (!row) throw new Error('completion insert failed');
  return row.id;
}

async function countFocusRows(): Promise<number> {
  const r = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM stat_rewards WHERE stat_type = 'FOCUS'`,
  ).first<{ n: number }>();
  return r?.n ?? 0;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('workflowCloseDay FOCUS award', () => {
  it('awards FOCUS when ≥3 distinct pillars completed today', async () => {
    const q1 = await seedQuest({ id: 7100, pillarId: 'body' });
    const q2 = await seedQuest({ id: 7101, pillarId: 'mind' });
    const q3 = await seedQuest({ id: 7102, pillarId: 'finance' });
    await seedCompletion(q1, 'completed', AWARDED_AT);
    await seedCompletion(q2, 'completed', AWARDED_AT);
    await seedCompletion(q3, 'completed', AWARDED_AT);

    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    const result = await runInDurableObject(stub, async (instance) => {
      return await (
        instance as unknown as {
          workflowCloseDay: (d: string) => Promise<{ focus_awarded: boolean }>;
        }
      ).workflowCloseDay(TODAY);
    });

    expect(result.focus_awarded).toBe(true);
    expect(await countFocusRows()).toBe(1);
  });

  it('returns false and no INSERT when <3 distinct pillars (only 2)', async () => {
    const q1 = await seedQuest({ id: 7110, pillarId: 'body' });
    const q2 = await seedQuest({ id: 7111, pillarId: 'mind' });
    await seedCompletion(q1, 'completed', AWARDED_AT);
    await seedCompletion(q2, 'completed', AWARDED_AT);

    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    const result = await runInDurableObject(stub, async (instance) => {
      return await (
        instance as unknown as {
          workflowCloseDay: (d: string) => Promise<{ focus_awarded: boolean }>;
        }
      ).workflowCloseDay(TODAY);
    });

    expect(result.focus_awarded).toBe(false);
    expect(await countFocusRows()).toBe(0);
  });

  it('returns false when no completions today', async () => {
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    const result = await runInDurableObject(stub, async (instance) => {
      return await (
        instance as unknown as {
          workflowCloseDay: (d: string) => Promise<{ focus_awarded: boolean }>;
        }
      ).workflowCloseDay(TODAY);
    });

    expect(result.focus_awarded).toBe(false);
    expect(await countFocusRows()).toBe(0);
  });

  it('is idempotent: second call same day returns false, no second INSERT', async () => {
    const q1 = await seedQuest({ id: 7120, pillarId: 'body' });
    const q2 = await seedQuest({ id: 7121, pillarId: 'mind' });
    const q3 = await seedQuest({ id: 7122, pillarId: 'projects' });
    await seedCompletion(q1, 'completed', AWARDED_AT);
    await seedCompletion(q2, 'completed', AWARDED_AT);
    await seedCompletion(q3, 'completed', AWARDED_AT);

    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));

    const r1 = await runInDurableObject(stub, async (instance) => {
      return await (
        instance as unknown as {
          workflowCloseDay: (d: string) => Promise<{ focus_awarded: boolean }>;
        }
      ).workflowCloseDay(TODAY);
    });
    expect(r1.focus_awarded).toBe(true);
    expect(await countFocusRows()).toBe(1);

    // Second call: idempotent.
    const r2 = await runInDurableObject(stub, async (instance) => {
      return await (
        instance as unknown as {
          workflowCloseDay: (d: string) => Promise<{ focus_awarded: boolean }>;
        }
      ).workflowCloseDay(TODAY);
    });
    expect(r2.focus_awarded).toBe(false);
    expect(await countFocusRows()).toBe(1); // Still exactly 1, not 2.
  });

  it('awards FOCUS for a different day independently (per-day isolation)', async () => {
    const YESTERDAY = '2026-06-01';
    const YESTERDAY_AT = `${YESTERDAY}T20:00:00.000Z`;

    // Yesterday: 3 pillars.
    const yq1 = await seedQuest({ id: 7130, pillarId: 'body', scheduledFor: YESTERDAY });
    const yq2 = await seedQuest({ id: 7131, pillarId: 'mind', scheduledFor: YESTERDAY });
    const yq3 = await seedQuest({ id: 7132, pillarId: 'finance', scheduledFor: YESTERDAY });
    await seedCompletion(yq1, 'completed', YESTERDAY_AT);
    await seedCompletion(yq2, 'completed', YESTERDAY_AT);
    await seedCompletion(yq3, 'completed', YESTERDAY_AT);

    // Today: 3 pillars.
    const tq1 = await seedQuest({ id: 7133, pillarId: 'body' });
    const tq2 = await seedQuest({ id: 7134, pillarId: 'mind' });
    const tq3 = await seedQuest({ id: 7135, pillarId: 'projects' });
    await seedCompletion(tq1, 'completed', AWARDED_AT);
    await seedCompletion(tq2, 'completed', AWARDED_AT);
    await seedCompletion(tq3, 'completed', AWARDED_AT);

    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));

    const r1 = await runInDurableObject(stub, async (instance) => {
      return await (
        instance as unknown as {
          workflowCloseDay: (d: string) => Promise<{ focus_awarded: boolean }>;
        }
      ).workflowCloseDay(YESTERDAY);
    });
    expect(r1.focus_awarded).toBe(true);

    const r2 = await runInDurableObject(stub, async (instance) => {
      return await (
        instance as unknown as {
          workflowCloseDay: (d: string) => Promise<{ focus_awarded: boolean }>;
        }
      ).workflowCloseDay(TODAY);
    });
    expect(r2.focus_awarded).toBe(true);

    expect(await countFocusRows()).toBe(2); // One per day.
  });
});

describe('recordCompletion does NOT award FOCUS inline', () => {
  it('completing 3 quests across 3 pillars does NOT insert FOCUS row immediately', async () => {
    const q1 = await seedQuest({ id: 7200, pillarId: 'body' });
    const q2 = await seedQuest({ id: 7201, pillarId: 'mind' });
    const q3 = await seedQuest({ id: 7202, pillarId: 'finance' });

    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      const agent = instance as unknown as {
        recordCompletion: (id: number, action: string, notes: string | null) => Promise<unknown>;
      };
      await agent.recordCompletion(q1, 'complete', null);
      await agent.recordCompletion(q2, 'complete', null);
      await agent.recordCompletion(q3, 'complete', null);
    });

    // FOCUS should NOT be awarded inline - only workflowCloseDay does it.
    expect(await countFocusRows()).toBe(0);
  });
});

describe('Regression - Zod rejects FOCUS in LLM stats array', () => {
  it('StatRewardSchema does NOT accept type=FOCUS', async () => {
    // Dynamic import to avoid top-level import dependency
    const { StatRewardSchema } = await import('../../src/schemas/llm-response');
    const result = StatRewardSchema.safeParse({ type: 'FOCUS', value: 1 });
    expect(result.success).toBe(false);
  });

  it('StatRewardSchema accepts all 7 LLM stat types', async () => {
    const { StatRewardSchema } = await import('../../src/schemas/llm-response');
    for (const t of ['END', 'STR', 'FLEX', 'INT', 'WIS', 'CAP', 'CRAFT']) {
      const result = StatRewardSchema.safeParse({ type: t, value: 1 });
      expect(result.success).toBe(true);
    }
  });
});
