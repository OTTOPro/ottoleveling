-- 0015 - stat_rewards table for Solo Leveling stat distribution radar
-- (END/STR/FLEX/INT/WIS/CAP/CRAFT/FOCUS)
--
-- 7 types are LLM-emitted as part of GenerationResponse.quests[i].stats (optional field).
-- The 8th, FOCUS, is system-awarded when a day's completions touch >= 3 distinct
-- pillars (evaluated by the daily-cycle workflow's close step).
--
-- stat_value: 1..5 range in DB (LLM schema enforces 1..3; FOCUS always = 1).
-- awarded_at: mirrors completion.completed_at for historical accuracy on backfill.

CREATE TABLE stat_rewards (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  completion_id   INTEGER NOT NULL REFERENCES completions(id) ON DELETE CASCADE,
  stat_type       TEXT NOT NULL
                  CHECK (stat_type IN ('END','STR','FLEX','INT','WIS','CAP','CRAFT','FOCUS')),
  stat_value      INTEGER NOT NULL CHECK (stat_value > 0 AND stat_value <= 5),
  awarded_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_stat_rewards_type ON stat_rewards(stat_type);
CREATE INDEX idx_stat_rewards_awarded ON stat_rewards(awarded_at);
CREATE INDEX idx_stat_rewards_completion ON stat_rewards(completion_id);
