import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';

async function makeQuest(
  pillar: 'body' | 'mind' | 'finance' | 'projects' = 'body',
  xp = 50,
): Promise<number> {
  const result = await env.DB.prepare(
    `INSERT INTO quests (pillar_id, title, xp_value, difficulty, source, scheduled_for)
       VALUES (?, 'streak-test', ?, 'medium', 'manual', '2026-05-24') RETURNING id`,
  )
    .bind(pillar, xp)
    .first<{ id: number }>();
  if (!result) throw new Error('quest insert failed');
  return result.id;
}

function getAgent() {
  return env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
}

describe('Streak via SystemAgent.recordCompletion (RPC)', () => {
  it('first successful completion → streak 1', async () => {
    const agent = getAgent();
    const id = await makeQuest('body');
    await agent.recordCompletion(id, 'complete', null, '2026-05-01');
    const state = await agent.getState();
    expect(state.streaks.body.current).toBe(1);
    expect(state.streaks.body.longest).toBe(1);
    expect(state.streaks.body.lastSuccessDate).toBe('2026-05-01');
  });

  it('same-day second completion does not bump current', async () => {
    const agent = getAgent();
    const id1 = await makeQuest('body');
    const id2 = await makeQuest('body');
    await agent.recordCompletion(id1, 'complete', null, '2026-05-01');
    await agent.recordCompletion(id2, 'complete', null, '2026-05-01');
    const state = await agent.getState();
    expect(state.streaks.body.current).toBe(1);
  });

  it('consecutive days → current bumps', async () => {
    const agent = getAgent();
    const id1 = await makeQuest('body');
    const id2 = await makeQuest('body');
    await agent.recordCompletion(id1, 'complete', null, '2026-05-01');
    await agent.recordCompletion(id2, 'complete', null, '2026-05-02');
    const state = await agent.getState();
    expect(state.streaks.body.current).toBe(2);
    expect(state.streaks.body.longest).toBe(2);
  });

  it('gap day WITH assigned quests → current resets to 1, longest preserved', async () => {
    const agent = getAgent();
    // ids[0]=day1, ids[1]=day2, ids[2]=day5 (completed), ids[3]=gap quest on day3 (not completed)
    const ids = [
      await makeQuest('body'),
      await makeQuest('body'),
      await makeQuest('body'),
      await makeQuest('body'),
    ];
    // Assign gap quest (ids[3]) to day 3 - it won't be completed, so it's a missed opportunity.
    await env.DB.prepare(`UPDATE quests SET scheduled_for = '2026-05-03' WHERE id = ?`)
      .bind(ids[3]!)
      .run();
    // Assign ids[2] to day 5.
    await env.DB.prepare(`UPDATE quests SET scheduled_for = '2026-05-05' WHERE id = ?`)
      .bind(ids[2]!)
      .run();

    await agent.recordCompletion(ids[0]!, 'complete', null, '2026-05-01');
    await agent.recordCompletion(ids[1]!, 'complete', null, '2026-05-02');
    // Day 3 quest (ids[3]) is NOT completed → missed opportunity → streak resets.
    await agent.recordCompletion(ids[2]!, 'complete', null, '2026-05-05');
    const state = await agent.getState();
    expect(state.streaks.body.current).toBe(1);
    expect(state.streaks.body.longest).toBe(2);
  });

  it('streaks are per-pillar (body completion does not affect mind)', async () => {
    const agent = getAgent();
    const bodyId = await makeQuest('body');
    const mindId = await makeQuest('mind');
    await agent.recordCompletion(bodyId, 'complete', null, '2026-05-01');
    await agent.recordCompletion(mindId, 'complete', null, '2026-05-01');
    const state = await agent.getState();
    expect(state.streaks.body.current).toBe(1);
    expect(state.streaks.mind.current).toBe(1);
    expect(state.streaks.finance.current).toBe(0);
    expect(state.streaks.projects.current).toBe(0);
  });

  it('failed quest does NOT advance streak (lastSuccessDate stays null)', async () => {
    const agent = getAgent();
    const id = await makeQuest('body');
    const result = await agent.recordCompletion(id, 'fail', null, '2026-05-01');
    expect(result.ok).toBe(true);
    const state = await agent.getState();
    expect(state.streaks.body.current).toBe(0);
    expect(state.streaks.body.lastSuccessDate).toBeNull();
  });

  it('skipped quest does NOT advance streak', async () => {
    const agent = getAgent();
    const id = await makeQuest('body');
    await agent.recordCompletion(id, 'skip', null, '2026-05-01');
    const state = await agent.getState();
    expect(state.streaks.body.current).toBe(0);
    expect(state.streaks.body.lastSuccessDate).toBeNull();
  });

  it('returns error for unknown quest id', async () => {
    const agent = getAgent();
    const result = await agent.recordCompletion(99999, 'complete', null, '2026-05-01');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('quest_not_found');
  });

  it('returns error on double-complete', async () => {
    const agent = getAgent();
    const id = await makeQuest('body');
    await agent.recordCompletion(id, 'complete', null, '2026-05-01');
    const second = await agent.recordCompletion(id, 'complete', null, '2026-05-02');
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe('already_completed');
  });

  it('opportunity-aware: gap day with assigned-but-uncompleted quest → streak resets', async () => {
    const agent = getAgent();
    const id1 = await makeQuest('body');
    const id2 = await makeQuest('body');
    const id3 = await makeQuest('body');

    // Day 1: complete a quest → streak 1.
    await agent.recordCompletion(id1, 'complete', null, '2026-05-01');

    // Day 2: an assigned-but-uncompleted body quest. Override scheduled_for to day 2.
    await env.DB.prepare(`UPDATE quests SET scheduled_for = '2026-05-02' WHERE id = ?`)
      .bind(id2)
      .run();

    // Day 3: complete id3 (override its scheduled_for to day 3).
    // Gap (day 2) has 1 missed opportunity → streak resets to 1.
    await env.DB.prepare(`UPDATE quests SET scheduled_for = '2026-05-03' WHERE id = ?`)
      .bind(id3)
      .run();
    await agent.recordCompletion(id3, 'complete', null, '2026-05-03');

    const state = await agent.getState();
    expect(state.streaks.body.current).toBe(1);
    expect(state.streaks.body.longest).toBe(1);
  });

  it('opportunity-aware: gap day with ZERO assigned quests → streak survives', async () => {
    const agent = getAgent();
    const id1 = await makeQuest('body');
    const id3 = await makeQuest('body');
    // No quest assigned on day 2 (2026-05-02) for body - gap is neutral.

    await env.DB.prepare(`UPDATE quests SET scheduled_for = '2026-05-01' WHERE id = ?`)
      .bind(id1)
      .run();
    await env.DB.prepare(`UPDATE quests SET scheduled_for = '2026-05-03' WHERE id = ?`)
      .bind(id3)
      .run();

    await agent.recordCompletion(id1, 'complete', null, '2026-05-01');
    await agent.recordCompletion(id3, 'complete', null, '2026-05-03');

    const state = await agent.getState();
    // Day 1 → streak 1. Day 2 is neutral (no quests). Day 3 → streak 2.
    expect(state.streaks.body.current).toBe(2);
    expect(state.streaks.body.longest).toBe(2);
  });
});
