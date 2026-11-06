import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import {
  evaluateOnCompletion,
  evaluateOnBilan,
  getRecentAchievements,
  getClosestToThreshold,
  formatRecentAchievementsSnapshot,
} from '../../src/lib/achievements/evaluate';
import { emptyState } from '../../src/do/state';
import {
  RECENT_UNLOCKS_MAX_LINES,
  CLOSEST_PREVIEW_COUNT,
} from '../../src/lib/achievements/thresholds';

// `bilans` is not cleaned in tests/setup-d1.ts. Wipe it locally so each test
// in this file starts with a clean bilan history (bilan_streak triggers read
// the most-recent N rows by period_start DESC).
beforeEach(async () => {
  await env.DB.prepare('DELETE FROM bilans').run();
});

async function seedBodyCompletion(date: string, xp: number, questId: number): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for)
     VALUES (?, 'body', ?, ?, 'medium', 'system', ?)`,
  )
    .bind(questId, `q${questId}`, xp, date)
    .run();
  await env.DB.prepare(
    `INSERT INTO completions (quest_id, status, xp_awarded) VALUES (?, 'completed', ?)`,
  )
    .bind(questId, xp)
    .run();
  await env.DB.prepare(
    `INSERT INTO xp_events (pillar_id, amount, source_type, source_id, description, occurred_at)
     VALUES ('body', ?, 'quest_completed', ?, 'seed', ?)`,
  )
    .bind(xp, questId, date + 'T08:00:00Z')
    .run();
}

describe('evaluateOnCompletion - completion_count trigger', () => {
  it('fires body_first_step on the FIRST body completion', async () => {
    await seedBodyCompletion('2026-05-01', 50, 1);
    const unlocks = await evaluateOnCompletion(env.DB, 'body', emptyState());
    const ids = unlocks.map((u) => u.id);
    expect(ids).toContain('body_first_step');
    const row = await env.DB.prepare(
      `SELECT unlocked_at FROM achievements WHERE id = 'body_first_step'`,
    ).first<{ unlocked_at: string | null }>();
    expect(row?.unlocked_at).not.toBeNull();
  });

  it('does NOT re-fire body_first_step on the SECOND completion (idempotent)', async () => {
    await seedBodyCompletion('2026-05-01', 50, 1);
    await evaluateOnCompletion(env.DB, 'body', emptyState());
    await seedBodyCompletion('2026-05-02', 50, 2);
    const secondCallUnlocks = await evaluateOnCompletion(env.DB, 'body', emptyState());
    expect(secondCallUnlocks.map((u) => u.id)).not.toContain('body_first_step');
  });
});

describe('evaluateOnCompletion - xp_threshold trigger', () => {
  it('fires body_hardened_500xp at total body XP >= 500', async () => {
    // Seed 10 × 50 XP = 500
    for (let i = 1; i <= 10; i++)
      await seedBodyCompletion(`2026-05-${String(i).padStart(2, '0')}`, 50, i);
    const unlocks = await evaluateOnCompletion(env.DB, 'body', emptyState());
    expect(unlocks.map((u) => u.id)).toContain('body_hardened_500xp');
  });

  it('does NOT fire body_hardened_500xp at total body XP = 450 (under threshold)', async () => {
    for (let i = 1; i <= 9; i++)
      await seedBodyCompletion(`2026-05-${String(i).padStart(2, '0')}`, 50, i);
    const unlocks = await evaluateOnCompletion(env.DB, 'body', emptyState());
    expect(unlocks.map((u) => u.id)).not.toContain('body_hardened_500xp');
  });
});

describe('evaluateOnCompletion - streak trigger', () => {
  it('fires body_iron_will_30 when state.streaks.body.longest >= 30', async () => {
    const state = emptyState();
    state.streaks.body.longest = 30;
    state.streaks.body.current = 30;
    const unlocks = await evaluateOnCompletion(env.DB, 'body', state);
    expect(unlocks.map((u) => u.id)).toContain('body_iron_will_30');
  });

  it('does NOT fire body_iron_will_30 at longest = 29', async () => {
    const state = emptyState();
    state.streaks.body.longest = 29;
    const unlocks = await evaluateOnCompletion(env.DB, 'body', state);
    expect(unlocks.map((u) => u.id)).not.toContain('body_iron_will_30');
  });
});

describe('evaluateOnCompletion - xp_threshold_total trigger', () => {
  it('fires transversal_path_begins_1k when sum across pillars >= 1000', async () => {
    // 500 body + 500 mind = 1000 total
    for (let i = 1; i <= 10; i++)
      await seedBodyCompletion(`2026-05-${String(i).padStart(2, '0')}`, 50, i);
    await env.DB.prepare(
      `INSERT INTO xp_events (pillar_id, amount, source_type, description, occurred_at)
       VALUES ('mind', 500, 'manual_adjustment', 'seed', '2026-05-11T08:00:00Z')`,
    ).run();
    const unlocks = await evaluateOnCompletion(env.DB, 'body', emptyState());
    expect(unlocks.map((u) => u.id)).toContain('transversal_path_begins_1k');
  });

  it('does NOT fire transversal_path_begins_1k at 999 total XP', async () => {
    await env.DB.prepare(
      `INSERT INTO xp_events (pillar_id, amount, source_type, description, occurred_at)
       VALUES ('body', 999, 'manual_adjustment', 'seed', '2026-05-11T08:00:00Z')`,
    ).run();
    const unlocks = await evaluateOnCompletion(env.DB, 'body', emptyState());
    expect(unlocks.map((u) => u.id)).not.toContain('transversal_path_begins_1k');
  });
});

describe('evaluateOnCompletion - completion_count_total trigger', () => {
  it('fires transversal_centurion_total at 100 cross-pillar completions', async () => {
    for (let i = 1; i <= 100; i++)
      await seedBodyCompletion(`2026-05-${String(i).padStart(2, '0')}`, 10, i);
    const unlocks = await evaluateOnCompletion(env.DB, 'body', emptyState());
    expect(unlocks.map((u) => u.id)).toContain('transversal_centurion_total');
  });

  it('does NOT fire transversal_centurion_total at 99 completions', async () => {
    for (let i = 1; i <= 99; i++)
      await seedBodyCompletion(`2026-05-${String(i).padStart(2, '0')}`, 10, i);
    const unlocks = await evaluateOnCompletion(env.DB, 'body', emptyState());
    expect(unlocks.map((u) => u.id)).not.toContain('transversal_centurion_total');
  });
});

describe('evaluateOnCompletion - composite trigger (all_pillars_level_at_least)', () => {
  it('fires transversal_balanced_soul_lvl3 when all 4 pillars >= level 3 (XP per pillar >= ~900)', async () => {
    // level 3 requires xp >= 900 per the levelFromXp curve (verify with the unit). Seed each.
    for (const p of ['body', 'mind', 'finance', 'projects'] as const) {
      await env.DB.prepare(
        `INSERT INTO xp_events (pillar_id, amount, source_type, description, occurred_at)
         VALUES (?, 900, 'manual_adjustment', 'seed', '2026-05-10T08:00:00Z')`,
      )
        .bind(p)
        .run();
    }
    const unlocks = await evaluateOnCompletion(env.DB, 'body', emptyState());
    expect(unlocks.map((u) => u.id)).toContain('transversal_balanced_soul_lvl3');
  });

  it('does NOT fire transversal_balanced_soul_lvl3 when 3 pillars at lvl 3 + projects at lvl 2', async () => {
    for (const p of ['body', 'mind', 'finance'] as const) {
      await env.DB.prepare(
        `INSERT INTO xp_events (pillar_id, amount, source_type, description, occurred_at)
         VALUES (?, 900, 'manual_adjustment', 'seed', '2026-05-10T08:00:00Z')`,
      )
        .bind(p)
        .run();
    }
    await env.DB.prepare(
      `INSERT INTO xp_events (pillar_id, amount, source_type, description, occurred_at)
       VALUES ('projects', 400, 'manual_adjustment', 'seed', '2026-05-10T08:00:00Z')`,
    ).run();
    const unlocks = await evaluateOnCompletion(env.DB, 'body', emptyState());
    expect(unlocks.map((u) => u.id)).not.toContain('transversal_balanced_soul_lvl3');
  });
});

describe('evaluateOnBilan - bilan_streak trigger', () => {
  it('fires transversal_self_reflective_4 after 4 consecutive weekly bilans with completion_rate >= 0.7', async () => {
    const stats = JSON.stringify({ completion_rate: 0.8 });
    await env.DB.prepare(
      `INSERT INTO bilans (period_type, period_start, period_end, stats, narrative) VALUES
       ('weekly', '2026-04-06', '2026-04-12', ?, 'a'),
       ('weekly', '2026-04-13', '2026-04-19', ?, 'b'),
       ('weekly', '2026-04-20', '2026-04-26', ?, 'c'),
       ('weekly', '2026-04-27', '2026-05-03', ?, 'd')`,
    )
      .bind(stats, stats, stats, stats)
      .run();
    const bilanResult = {
      id: 4,
      period_type: 'weekly' as const,
      period_start: '2026-04-27',
      period_end: '2026-05-03',
      stats: { completion_rate: 0.8 } as Record<string, unknown>,
      narrative: 'd',
      source: 'llm' as const,
    };
    const unlocks = await evaluateOnBilan(env.DB, bilanResult, emptyState());
    expect(unlocks.map((u) => u.id)).toContain('transversal_self_reflective_4');
  });

  it('does NOT fire transversal_self_reflective_4 when one bilan in the chain has completion_rate < 0.7', async () => {
    // Use different period_starts than the prior test (bilans table not cleaned in setup-d1).
    await env.DB.prepare(
      `INSERT INTO bilans (period_type, period_start, period_end, stats, narrative) VALUES
       ('weekly', '2026-03-02', '2026-03-08', ?, 'a'),
       ('weekly', '2026-03-09', '2026-03-15', ?, 'b'),
       ('weekly', '2026-03-16', '2026-03-22', ?, 'c'),
       ('weekly', '2026-03-23', '2026-03-29', ?, 'd')`,
    )
      .bind(
        JSON.stringify({ completion_rate: 0.8 }),
        JSON.stringify({ completion_rate: 0.5 }),
        JSON.stringify({ completion_rate: 0.8 }),
        JSON.stringify({ completion_rate: 0.8 }),
      )
      .run();
    const bilanResult = {
      id: 4,
      period_type: 'weekly' as const,
      period_start: '2026-03-23',
      period_end: '2026-03-29',
      stats: { completion_rate: 0.8 } as Record<string, unknown>,
      narrative: 'd',
      source: 'llm' as const,
    };
    const unlocks = await evaluateOnBilan(env.DB, bilanResult, emptyState());
    expect(unlocks.map((u) => u.id)).not.toContain('transversal_self_reflective_4');
  });
});

describe('evaluateOnCompletion - perfect_day trigger', () => {
  it('fires transversal_first_perfect_day when any day has 100% completion with >= 2 assigned', async () => {
    // Seed a day with 2 body quests, both completed
    await env.DB.prepare(
      `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for) VALUES (1, 'body', 'q1', 50, 'medium', 'system', '2026-05-10')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for) VALUES (2, 'body', 'q2', 50, 'medium', 'system', '2026-05-10')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO completions (quest_id, status, xp_awarded) VALUES (1, 'completed', 50)`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO completions (quest_id, status, xp_awarded) VALUES (2, 'completed', 50)`,
    ).run();
    const unlocks = await evaluateOnCompletion(env.DB, 'body', emptyState());
    expect(unlocks.map((u) => u.id)).toContain('transversal_first_perfect_day');
  });

  it('does NOT fire transversal_first_perfect_day with only 1 assigned (below min_assigned=2)', async () => {
    await env.DB.prepare(
      `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for) VALUES (1, 'body', 'q1', 50, 'medium', 'system', '2026-05-10')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO completions (quest_id, status, xp_awarded) VALUES (1, 'completed', 50)`,
    ).run();
    const unlocks = await evaluateOnCompletion(env.DB, 'body', emptyState());
    expect(unlocks.map((u) => u.id)).not.toContain('transversal_first_perfect_day');
  });
});

describe('evaluateOnCompletion - consecutive_active_days trigger', () => {
  it('fires transversal_first_week_complete after 7 consecutive days each with >=1 completion', async () => {
    // Seed 7 consecutive days (2026-05-01 through 2026-05-07) each with 1 body quest completed
    for (let i = 0; i < 7; i++) {
      const day = `2026-05-${String(1 + i).padStart(2, '0')}`;
      const qid = 100 + i;
      await env.DB.prepare(
        `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for) VALUES (?, 'body', ?, 50, 'medium', 'system', ?)`,
      )
        .bind(qid, `q${qid}`, day)
        .run();
      await env.DB.prepare(
        `INSERT INTO completions (quest_id, status, xp_awarded) VALUES (?, 'completed', 50)`,
      )
        .bind(qid)
        .run();
    }
    const unlocks = await evaluateOnCompletion(env.DB, 'body', emptyState());
    expect(unlocks.map((u) => u.id)).toContain('transversal_first_week_complete');
  });

  it('does NOT fire transversal_first_week_complete with a gap (6 consecutive + skip + 1 more)', async () => {
    // 2026-05-01..06 consecutive + 2026-05-08 (gap on 05-07) - longest run is 6
    for (let i = 0; i < 6; i++) {
      const day = `2026-05-${String(1 + i).padStart(2, '0')}`;
      const qid = 200 + i;
      await env.DB.prepare(
        `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for) VALUES (?, 'body', ?, 50, 'medium', 'system', ?)`,
      )
        .bind(qid, `q${qid}`, day)
        .run();
      await env.DB.prepare(
        `INSERT INTO completions (quest_id, status, xp_awarded) VALUES (?, 'completed', 50)`,
      )
        .bind(qid)
        .run();
    }
    await env.DB.prepare(
      `INSERT INTO quests (id, pillar_id, title, xp_value, difficulty, source, scheduled_for) VALUES (300, 'body', 'q300', 50, 'medium', 'system', '2026-05-08')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO completions (quest_id, status, xp_awarded) VALUES (300, 'completed', 50)`,
    ).run();
    const unlocks = await evaluateOnCompletion(env.DB, 'body', emptyState());
    expect(unlocks.map((u) => u.id)).not.toContain('transversal_first_week_complete');
  });
});

describe('getRecentAchievements', () => {
  it('returns achievements unlocked within window, sorted by unlocked_at DESC, capped at RECENT_UNLOCKS_MAX_LINES', async () => {
    // Unlock 6 achievements at increasing timestamps
    const today = '2026-05-15';
    for (let i = 0; i < 6; i++) {
      const id = [
        'body_first_step',
        'mind_first_thought',
        'finance_first_coin',
        'projects_first_blueprint',
        'body_hardened_500xp',
        'mind_scholar_xp_500',
      ][i]!;
      await env.DB.prepare(`UPDATE achievements SET unlocked_at = ? WHERE id = ?`)
        .bind(`2026-05-${String(10 + i).padStart(2, '0')} 12:00:00`, id)
        .run();
    }
    const recent = await getRecentAchievements(env.DB, today, 30);
    expect(recent.length).toBeLessThanOrEqual(RECENT_UNLOCKS_MAX_LINES);
    // Most recent first
    expect(recent[0]?.id).toBe('mind_scholar_xp_500');
  });
});

describe('getClosestToThreshold', () => {
  it('returns up to CLOSEST_PREVIEW_COUNT achievements where progress >= 0.9 * threshold, sorted desc', async () => {
    // Seed body XP at 460 (92% of 500 threshold for body_hardened_500xp)
    await env.DB.prepare(
      `INSERT INTO xp_events (pillar_id, amount, source_type, description, occurred_at)
       VALUES ('body', 460, 'manual_adjustment', 'seed', '2026-05-10T08:00:00Z')`,
    ).run();
    const state = emptyState();
    const closest = await getClosestToThreshold(env.DB, state);
    expect(closest.length).toBeLessThanOrEqual(CLOSEST_PREVIEW_COUNT);
    const ids = closest.map((c) => c.id);
    expect(ids).toContain('body_hardened_500xp');
  });
});

describe('formatRecentAchievementsSnapshot', () => {
  it('zero recent + zero closest → "None yet."', () => {
    const out = formatRecentAchievementsSnapshot([], []);
    expect(out).toContain('None yet.');
  });

  it('populated recent + closest renders the two sections', () => {
    const out = formatRecentAchievementsSnapshot(
      [
        {
          id: 'body_first_step',
          name: 'First Step',
          description: 'First body quest completed.',
          unlocked_at: '2026-05-12 14:30:00',
          pillar_id: 'body',
          trigger_type: 'completion_count',
          trigger_config: '{"pillar":"body","threshold":1}',
        },
      ],
      [
        {
          id: 'body_hardened_500xp',
          name: 'Hardened',
          progress: 460,
          threshold: 500,
          fraction: 0.92,
        },
      ],
    );
    expect(out).toContain('Unlocked in last 30 days');
    expect(out).toContain('First Step');
    expect(out).toContain('Closest to unlock');
    expect(out).toContain('Hardened');
    expect(out).toContain('92%');
    for (const line of out.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });
});
