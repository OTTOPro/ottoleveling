import { applyD1Migrations, env, runInDurableObject } from 'cloudflare:test';
import { beforeAll, beforeEach } from 'vitest';
import { MockProvider } from '../src/lib/llm/mock';
import { MockPushSender } from '../src/lib/push-sender';

// 23 starter achievements. Mirrors migration 0005 verbatim.
const SEED_ACHIEVEMENT_ROWS: ReadonlyArray<
  [string, string, string, string | null, string, string]
> = [
  // Body
  [
    'body_first_step',
    'First Step',
    'First body quest completed.',
    'body',
    'completion_count',
    '{"pillar":"body","threshold":1}',
  ],
  [
    'body_iron_will_30',
    'Iron Will',
    '30-day body streak. The flesh has been disciplined.',
    'body',
    'streak',
    '{"pillar":"body","threshold":30}',
  ],
  [
    'body_hardened_500xp',
    'Hardened',
    '500 total body XP.',
    'body',
    'xp_threshold',
    '{"pillar":"body","threshold":500}',
  ],
  [
    'body_centurion_100',
    'Centurion',
    '100 body quests completed.',
    'body',
    'completion_count',
    '{"pillar":"body","threshold":100}',
  ],
  // Mind
  [
    'mind_first_thought',
    'First Thought',
    'First mind quest completed.',
    'mind',
    'completion_count',
    '{"pillar":"mind","threshold":1}',
  ],
  [
    'mind_disciplined_30',
    'Disciplined Mind',
    '30-day mind streak.',
    'mind',
    'streak',
    '{"pillar":"mind","threshold":30}',
  ],
  [
    'mind_scholar_xp_500',
    'Scholar',
    '500 total mind XP.',
    'mind',
    'xp_threshold',
    '{"pillar":"mind","threshold":500}',
  ],
  [
    'mind_polymath_100',
    'Polymath',
    '100 mind quests completed.',
    'mind',
    'completion_count',
    '{"pillar":"mind","threshold":100}',
  ],
  // Finance
  [
    'finance_first_coin',
    'First Coin',
    'First finance quest completed.',
    'finance',
    'completion_count',
    '{"pillar":"finance","threshold":1}',
  ],
  [
    'finance_steward_30',
    'Steward',
    '30-day finance streak.',
    'finance',
    'streak',
    '{"pillar":"finance","threshold":30}',
  ],
  [
    'finance_solvent_500xp',
    'Solvent',
    '500 total finance XP.',
    'finance',
    'xp_threshold',
    '{"pillar":"finance","threshold":500}',
  ],
  [
    'finance_magnate_100',
    "Magnate's Path",
    '100 finance quests completed.',
    'finance',
    'completion_count',
    '{"pillar":"finance","threshold":100}',
  ],
  // Projects
  [
    'projects_first_blueprint',
    'First Blueprint',
    'First project quest completed.',
    'projects',
    'completion_count',
    '{"pillar":"projects","threshold":1}',
  ],
  [
    'projects_relentless_30',
    'Relentless Builder',
    '30-day projects streak.',
    'projects',
    'streak',
    '{"pillar":"projects","threshold":30}',
  ],
  [
    'projects_architect_500xp',
    'Architect',
    '500 total projects XP.',
    'projects',
    'xp_threshold',
    '{"pillar":"projects","threshold":500}',
  ],
  [
    'projects_master_100',
    'Master Builder',
    '100 projects quests completed.',
    'projects',
    'completion_count',
    '{"pillar":"projects","threshold":100}',
  ],
  // Transversal (7) - 3 early-game milestones at top
  [
    'transversal_first_quest_completed',
    'First Steps',
    'The first quest of any pillar completed.',
    null,
    'completion_count_total',
    '{"threshold":1}',
  ],
  [
    'transversal_first_perfect_day',
    'Perfect Discipline',
    'One day with 100% completion rate across all assigned quests (requires >= 2 quests assigned).',
    null,
    'perfect_day',
    '{"min_assigned":2}',
  ],
  [
    'transversal_first_week_complete',
    'First Week',
    '7 consecutive days each with at least 1 completed quest in any pillar.',
    null,
    'consecutive_active_days',
    '{"threshold":7}',
  ],
  [
    'transversal_path_begins_1k',
    'The Path Begins',
    '1000 total XP across all pillars.',
    null,
    'xp_threshold_total',
    '{"threshold":1000}',
  ],
  [
    'transversal_centurion_total',
    'Hundredfold',
    '100 total quests completed across pillars.',
    null,
    'completion_count_total',
    '{"threshold":100}',
  ],
  [
    'transversal_balanced_soul_lvl3',
    'Balanced Soul',
    'All 4 pillars at level 3+.',
    null,
    'composite',
    '{"all_pillars_level_at_least":3}',
  ],
  [
    'transversal_self_reflective_4',
    'Self-Reflective',
    '4 consecutive weekly bilans with completion_rate >= 0.7.',
    null,
    'bilan_streak',
    '{"period_type":"weekly","threshold":4,"min_completion_rate":0.7}',
  ],
];

beforeAll(async () => {
  // TEST_MIGRATIONS is injected via miniflare bindings in vitest.config.ts.
  // applyD1Migrations is idempotent - safe to call on every suite run.
  await applyD1Migrations(
    env.DB,
    (env as unknown as Record<string, unknown>)
      .TEST_MIGRATIONS as import('cloudflare:test').D1Migration[],
  );
});

beforeEach(async () => {
  // Wipe D1 rows inserted by tests. Order respects FK constraints (children → parents).
  // Keep seeded reference tables (pillars, penalty_rules, quest_templates) intact.
  const statements = [
    env.DB.prepare('DELETE FROM llm_jobs_dlq'),
    env.DB.prepare('DELETE FROM events_dlq'),
    env.DB.prepare('DELETE FROM active_projects'),
    env.DB.prepare('DELETE FROM objective_workflow_state'),
    env.DB.prepare('DELETE FROM stat_rewards'),
    env.DB.prepare('DELETE FROM xp_events'),
    env.DB.prepare('DELETE FROM completions'),
    env.DB.prepare('DELETE FROM quests'),
    env.DB.prepare('DELETE FROM quest_arcs'),
    env.DB.prepare('DELETE FROM objectives'),
    env.DB.prepare('DELETE FROM focus_periods'),
    env.DB.prepare('DELETE FROM push_subscriptions'),
    env.DB.prepare('DELETE FROM library_save_events'),
    env.DB.prepare('DELETE FROM spotify_show_filters'),
    env.DB.prepare('DELETE FROM daily_metrics'),
    env.DB.prepare('DELETE FROM data_source_tokens'),
    env.DB.prepare('DELETE FROM data_sources'),
    env.DB.prepare(
      "INSERT INTO data_sources (provider, status) VALUES ('google_health', 'disconnected')",
    ),
    env.DB.prepare(
      "INSERT INTO data_sources (provider, status) VALUES ('spotify', 'disconnected')",
    ),
    env.DB.prepare('DELETE FROM lifetime_stats'),
    env.DB.prepare("INSERT INTO lifetime_stats (pillar_id) VALUES ('body')"),
    env.DB.prepare("INSERT INTO lifetime_stats (pillar_id) VALUES ('mind')"),
    env.DB.prepare("INSERT INTO lifetime_stats (pillar_id) VALUES ('finance')"),
    env.DB.prepare("INSERT INTO lifetime_stats (pillar_id) VALUES ('projects')"),
    env.DB.prepare('DELETE FROM achievements'),
  ];

  // Re-seed achievements per row using parameterized prepares.
  for (const row of SEED_ACHIEVEMENT_ROWS) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO achievements (id, name, description, pillar_id, trigger_type, trigger_config) VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(row[0], row[1], row[2], row[3], row[4], row[5]),
    );
  }

  await env.DB.batch(statements);

  // Wipe the SystemAgent DO state (focus, streaks, scheduledEvents, alarms).
  // Without this, tests across files leak state and streak math comes out wrong.
  const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
  await runInDurableObject(stub, async (_instance, ctx) => {
    await ctx.storage.deleteAll();
  });

  // Reset MockProvider fixture + callCount between tests.
  MockProvider.reset();
  // Reset MockPushSender between tests.
  MockPushSender.reset();
});
