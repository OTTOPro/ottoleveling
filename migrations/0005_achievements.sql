-- ============================================================
-- Migration 0005 - achievements (23 seeded rows)
-- ============================================================
-- One row per starter achievement (16 per-pillar + 7 transversal). All rows
-- ship with unlocked_at = NULL; the deterministic evaluator in
-- lib/achievements/evaluate.ts flips unlocked_at to datetime('now') when the
-- trigger fires. WHERE unlocked_at IS NULL guard on the UPDATE makes the
-- flip idempotent.
--
-- Trigger types:
--   streak / xp_threshold / xp_threshold_total /
--   completion_count / completion_count_total /
--   composite / bilan_streak / perfect_day / consecutive_active_days

CREATE TABLE achievements (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL,
  unlocked_at     DATETIME,
  pillar_id       TEXT REFERENCES pillars(id),
  trigger_type    TEXT NOT NULL
                  CHECK (trigger_type IN ('streak','xp_threshold','xp_threshold_total','completion_count','completion_count_total','composite','bilan_streak','perfect_day','consecutive_active_days')),
  trigger_config  TEXT NOT NULL
);

CREATE INDEX idx_achievements_pillar ON achievements(pillar_id);
CREATE INDEX idx_achievements_unlocked ON achievements(unlocked_at);

-- ----------- Body (4) -----------
INSERT INTO achievements (id, name, description, pillar_id, trigger_type, trigger_config) VALUES
  ('body_first_step', 'First Step', 'First body quest completed.', 'body', 'completion_count', '{"pillar":"body","threshold":1}'),
  ('body_iron_will_30', 'Iron Will', '30-day body streak. The flesh has been disciplined.', 'body', 'streak', '{"pillar":"body","threshold":30}'),
  ('body_hardened_500xp', 'Hardened', '500 total body XP.', 'body', 'xp_threshold', '{"pillar":"body","threshold":500}'),
  ('body_centurion_100', 'Centurion', '100 body quests completed.', 'body', 'completion_count', '{"pillar":"body","threshold":100}');

-- ----------- Mind (4) -----------
INSERT INTO achievements (id, name, description, pillar_id, trigger_type, trigger_config) VALUES
  ('mind_first_thought', 'First Thought', 'First mind quest completed.', 'mind', 'completion_count', '{"pillar":"mind","threshold":1}'),
  ('mind_disciplined_30', 'Disciplined Mind', '30-day mind streak.', 'mind', 'streak', '{"pillar":"mind","threshold":30}'),
  ('mind_scholar_xp_500', 'Scholar', '500 total mind XP.', 'mind', 'xp_threshold', '{"pillar":"mind","threshold":500}'),
  ('mind_polymath_100', 'Polymath', '100 mind quests completed.', 'mind', 'completion_count', '{"pillar":"mind","threshold":100}');

-- ----------- Finance (4) -----------
INSERT INTO achievements (id, name, description, pillar_id, trigger_type, trigger_config) VALUES
  ('finance_first_coin', 'First Coin', 'First finance quest completed.', 'finance', 'completion_count', '{"pillar":"finance","threshold":1}'),
  ('finance_steward_30', 'Steward', '30-day finance streak.', 'finance', 'streak', '{"pillar":"finance","threshold":30}'),
  ('finance_solvent_500xp', 'Solvent', '500 total finance XP.', 'finance', 'xp_threshold', '{"pillar":"finance","threshold":500}'),
  ('finance_magnate_100', 'Magnate''s Path', '100 finance quests completed.', 'finance', 'completion_count', '{"pillar":"finance","threshold":100}');

-- ----------- Projects (4) -----------
INSERT INTO achievements (id, name, description, pillar_id, trigger_type, trigger_config) VALUES
  ('projects_first_blueprint', 'First Blueprint', 'First project quest completed.', 'projects', 'completion_count', '{"pillar":"projects","threshold":1}'),
  ('projects_relentless_30', 'Relentless Builder', '30-day projects streak.', 'projects', 'streak', '{"pillar":"projects","threshold":30}'),
  ('projects_architect_500xp', 'Architect', '500 total projects XP.', 'projects', 'xp_threshold', '{"pillar":"projects","threshold":500}'),
  ('projects_master_100', 'Master Builder', '100 projects quests completed.', 'projects', 'completion_count', '{"pillar":"projects","threshold":100}');

-- ----------- Transversal (7) - the first 3 are early-game milestones -----------
INSERT INTO achievements (id, name, description, pillar_id, trigger_type, trigger_config) VALUES
  ('transversal_first_quest_completed', 'First Steps', 'The first quest of any pillar completed.', NULL, 'completion_count_total', '{"threshold":1}'),
  ('transversal_first_perfect_day', 'Perfect Discipline', 'One day with 100% completion rate across all assigned quests (requires >= 2 quests assigned).', NULL, 'perfect_day', '{"min_assigned":2}'),
  ('transversal_first_week_complete', 'First Week', '7 consecutive days each with at least 1 completed quest in any pillar.', NULL, 'consecutive_active_days', '{"threshold":7}'),
  ('transversal_path_begins_1k', 'The Path Begins', '1000 total XP across all pillars.', NULL, 'xp_threshold_total', '{"threshold":1000}'),
  ('transversal_centurion_total', 'Hundredfold', '100 total quests completed across pillars.', NULL, 'completion_count_total', '{"threshold":100}'),
  ('transversal_balanced_soul_lvl3', 'Balanced Soul', 'All 4 pillars at level 3+.', NULL, 'composite', '{"all_pillars_level_at_least":3}'),
  ('transversal_self_reflective_4', 'Self-Reflective', '4 consecutive weekly bilans with completion_rate >= 0.7.', NULL, 'bilan_streak', '{"period_type":"weekly","threshold":4,"min_completion_rate":0.7}');
