-- ============================================================
-- Migration 0002: example seed
-- ============================================================
-- A fictional player, so a fresh clone has something to show.
-- Replace these rows with your own objectives and templates.
-- Target dates are relative to the day the migration runs.
--
-- Two template titles are referenced by 0011_seed_auto_complete_rules.sql:
-- '10,000 daily steps' and 'Daily learning'. Keep them if you keep 0011.

-- PILLARS
INSERT INTO pillars (id, name, color, icon, description) VALUES
  ('body',     'Body',     '#ef4444', 'heart',  'Nutrition, fitness, sleep, recovery'),
  ('mind',     'Mind',     '#8b5cf6', 'brain',  'Learning, reading, languages'),
  ('finance',  'Finance',  '#10b981', 'wallet', 'Income, savings, investments'),
  ('projects', 'Projects', '#3b82f6', 'rocket', 'Side projects and personal builds');

-- PENALTY_RULES
INSERT INTO penalty_rules (difficulty, fail_penalty_pct, skip_penalty_pct) VALUES
  ('trivial', 0.25, 0.10),
  ('easy',    0.40, 0.20),
  ('medium',  0.50, 0.25),
  ('hard',    0.65, 0.40),
  ('epic',    0.80, 0.50);

-- OBJECTIVES
INSERT INTO objectives (pillar_id, title, description, target_date, target_metric, target_value, metadata) VALUES
  -- MIND
  ('mind', 'Read six books',
   'One book a month. At least two that are not about work.',
   date('now', '+6 months'), 'books completed', 6,
   '{"horizon_months": 6}'),

  ('mind', 'Reach A2 in Spanish',
   'Order food, ask for directions, follow a slow podcast.',
   date('now', '+5 months'), 'CEFR level (1 = A1, 2 = A2)', 2,
   '{"horizon_months": 5}'),

  -- BODY
  ('body', 'Run 10 km without stopping',
   'Two easy runs a week. Add distance slowly.',
   date('now', '+3 months'), 'km continuous', 10,
   '{"horizon_months": 3}'),

  ('body', 'Sleep 7 hours on average',
   'Measured over 30 days. Screens off at 23:00.',
   date('now', '+2 months'), 'h average over rolling 30d', 7.0,
   '{"horizon_months": 2}'),

  ('body', 'Build a stable core',
   'Protects the lower back. Three short sessions a week, no heavy loading.',
   date('now', '+4 months'), 'level reached (1-5)', 3,
   '{"horizon_months": 4, "physical_constraint": true}'),

  -- FINANCE
  ('finance', 'Three months of expenses saved',
   'Automatic transfer on payday. Do not touch it.',
   date('now', '+6 months'), 'months of expenses saved', 3,
   '{"horizon_months": 6}'),

  ('finance', 'Log every expense for 60 days',
   'Every purchase, same day. Cash too.',
   date('now', '+3 months'), 'consecutive days', 60,
   '{"horizon_months": 3}'),

  -- PROJECTS
  ('projects', 'Ship the recipe app',
   'Design, then core features, then a public URL that friends can use.',
   date('now', '+4 months'), 'stage reached', 3,
   '{"horizon_months": 4, "stages": ["design", "core", "deployed"]}');

-- QUEST_TEMPLATES
INSERT INTO quest_templates (pillar_id, title, description, base_metric, current_value, starting_value, progression_rule, schedule, base_xp, difficulty, created_by, metadata) VALUES
  -- MIND
  ('mind', 'Daily learning',
   'Learn one new thing. A word, a fact, a concept. Write it down.',
   'item learned', 1, 1,
   '{"type":"none"}',
   'daily', 25, 'easy', 'manual', NULL),

  ('mind', 'Spanish practice',
   'Vocabulary cards or a short listening session.',
   'minutes', 15, 15,
   '{"type":"linear","step":5,"after_successes":14}',
   'daily', 25, 'easy', 'manual', NULL),

  -- BODY
  ('body', '10,000 daily steps',
   'Walk. Take the stairs. It adds up.',
   'steps', 10000, 10000,
   '{"type":"none"}',
   'daily', 30, 'easy', 'manual', NULL),

  ('body', 'Core stability session',
   'Dead bugs, bird dogs, side planks. Slow and controlled. Nothing loaded through the spine.',
   'sessions', 1, 1,
   '{"type":"hybrid","min_successes":8,"success_threshold":0.8,"step":1,"regression_threshold":0.5,"regression_step":0}',
   'custom', 50, 'medium', 'manual',
   '{"schedule_config":{"days":["mon","wed","fri"]},"physical_constraint":true,"contraindicated":["heavy_deadlift","loaded_spinal_flexion","high_impact_plyo"]}'),

  ('body', 'Easy run',
   'Slow enough to hold a conversation.',
   'minutes', 25, 25,
   '{"type":"linear","step":5,"after_successes":8}',
   'custom', 40, 'medium', 'manual',
   '{"schedule_config":{"days":["tue","sat"]}}'),

  -- FINANCE
  ('finance', 'Weekly budget review',
   'Fifteen minutes. Compare spending with the plan.',
   'minutes', 15, 15,
   '{"type":"none"}',
   'weekly', 40, 'easy', 'manual',
   '{"schedule_config":{"day":"sun"}}'),

  -- PROJECTS
  ('projects', 'Side project deep work',
   'Ninety minutes, phone in another room.',
   'minutes', 90, 90,
   '{"type":"none"}',
   'weekdays', 80, 'medium', 'manual', NULL);
