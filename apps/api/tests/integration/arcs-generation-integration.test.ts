import { describe, it, expect } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import { MockProvider } from '../../src/lib/llm/mock';
import {
  CANONICAL_GENERATION_WITH_ARC_PROPOSAL_FIXTURE,
  CANONICAL_GENERATION_WITH_ARC_CONTINUATION_FIXTURE,
} from '../fixtures/llm-fixture';

describe('Arcs in daily generation', () => {
  it('persists the LLM proposed_arc when concurrency check passes', async () => {
    MockProvider.setFixture(CANONICAL_GENERATION_WITH_ARC_PROPOSAL_FIXTURE);
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as { generateDaily: (d?: string) => Promise<unknown> }
      ).generateDaily('2026-05-28');
    });
    const { results } = await env.DB.prepare(`SELECT * FROM quest_arcs WHERE status='active'`).all<{
      id: number;
      pillar_id: string;
      title: string;
      total_steps: number;
    }>();
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe('Trial of Discipline');
    expect(results[0]!.pillar_id).toBe('body');
    expect(results[0]!.total_steps).toBe(7);
  });

  it('rejects the proposal (logs only) when total cap is reached, other quests still INSERT', async () => {
    // Seed 5 active arcs to hit the total cap.
    for (let i = 1; i <= 5; i++) {
      await env.DB.prepare(
        `INSERT INTO quest_arcs (pillar_id, title, description, total_steps, completed_steps, status, started_at, expected_end, total_xp_reward)
         VALUES ('mind', 'A', 'D', 7, 0, 'active', '2026-05-20T08:00:00Z', '2026-06-10T08:00:00Z', 500)`,
      ).run();
    }
    MockProvider.setFixture(CANONICAL_GENERATION_WITH_ARC_PROPOSAL_FIXTURE);
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as { generateDaily: (d?: string) => Promise<unknown> }
      ).generateDaily('2026-05-28');
    });
    // Still 5 active arcs (proposal blocked) - NOT 6.
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM quest_arcs WHERE status='active'`,
    ).first<{ n: number }>();
    expect(row?.n).toBe(5);
    // But quests for today were INSERTed (4 from the fixture).
    const q = await env.DB.prepare(`SELECT * FROM quests WHERE scheduled_for = ?`)
      .bind('2026-05-28')
      .all();
    expect(q.results.length).toBeGreaterThanOrEqual(4);
  });

  it('persists per-quest arc_id / arc_step when LLM tags a continuation', async () => {
    // Seed arc id=1 so the fixture's arc_id=1 tag references a real row.
    await env.DB.prepare(
      `INSERT INTO quest_arcs (id, pillar_id, title, description, total_steps, completed_steps, status, started_at, expected_end, total_xp_reward)
       VALUES (1, 'body', 'Trial of Discipline', 'D', 7, 1, 'active', '2026-05-27T08:00:00Z', '2026-06-03T08:00:00Z', 500)`,
    ).run();
    MockProvider.setFixture(CANONICAL_GENERATION_WITH_ARC_CONTINUATION_FIXTURE);
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as { generateDaily: (d?: string) => Promise<unknown> }
      ).generateDaily('2026-05-28');
    });
    const { results } = await env.DB.prepare(
      `SELECT id, arc_id, arc_step FROM quests WHERE scheduled_for = ? AND arc_id IS NOT NULL`,
    )
      .bind('2026-05-28')
      .all<{ id: number; arc_id: number; arc_step: number }>();
    expect(results).toHaveLength(1);
    expect(results[0]!.arc_id).toBe(1);
    expect(results[0]!.arc_step).toBe(2);
  });

  it('expired-arc sweep flips an expired arc to failed BEFORE the active set is read', async () => {
    // Seed one expired-but-incomplete arc.
    await env.DB.prepare(
      `INSERT INTO quest_arcs (id, pillar_id, title, description, total_steps, completed_steps, status, started_at, expected_end, total_xp_reward)
       VALUES (10, 'body', 'Expired', 'D', 7, 3, 'active', '2026-05-01T08:00:00Z', '2026-05-15T08:00:00Z', 500)`,
    ).run();
    MockProvider.setFixture(CANONICAL_GENERATION_WITH_ARC_PROPOSAL_FIXTURE);
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as { generateDaily: (d?: string) => Promise<unknown> }
      ).generateDaily('2026-05-28');
    });
    const row = await env.DB.prepare(`SELECT status FROM quest_arcs WHERE id = 10`).first<{
      status: string;
    }>();
    expect(row?.status).toBe('failed');
  });
});
