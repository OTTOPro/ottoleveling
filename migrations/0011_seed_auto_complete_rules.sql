-- ============================================================
-- Migration 0011: auto-complete rules on two seeded templates
-- ============================================================
-- Only templates with a clear external metric get a rule. Everything else
-- stays manual: there is no data source that could prove it was done.
--
-- Targeted by exact title (the seed never duplicates titles):
--   '10,000 daily steps'  Google Health steps >= 10000
--   'Daily learning'      Spotify library_saves_episodes >= 1
--                         A saved podcast episode counts as intent to learn.
--                         It does not prove the episode was played, and the
--                         notification says so ("saves, not listens").

UPDATE quest_templates
   SET auto_complete_rule = json('{"type":"metric_threshold","metric":"steps","source":"google_health","threshold":10000}')
 WHERE title = '10,000 daily steps';

UPDATE quest_templates
   SET auto_complete_rule = json('{"type":"metric_threshold","metric":"library_saves_episodes","source":"spotify","threshold":1}')
 WHERE title = 'Daily learning';
