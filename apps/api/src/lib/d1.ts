export interface PillarRow {
  id: 'body' | 'mind' | 'finance' | 'projects';
  name: string;
  color: string;
  icon: string;
  description: string | null;
}

export interface ObjectiveRow {
  id: number;
  pillar_id: 'body' | 'mind' | 'finance' | 'projects';
  title: string;
  description: string | null;
  target_date: string;
  target_metric: string | null;
  target_value: number | null;
  current_value: number | null;
  status: 'active' | 'completed' | 'abandoned' | 'paused';
  created_at: string;
  completed_at: string | null;
  metadata: string | null;
  deleted_at: string | null; // NULL = active, non-NULL = soft-deleted
}

export interface QuestRow {
  id: number;
  pillar_id: 'body' | 'mind' | 'finance' | 'projects';
  title: string;
  description: string | null;
  xp_value: number;
  difficulty: 'trivial' | 'easy' | 'medium' | 'hard' | 'epic';
  source: 'system' | 'manual';
  objective_id: number | null;
  template_id: number | null;
  arc_id: number | null;
  arc_step: number | null;
  scheduled_for: string;
  generation_id: string | null;
  metadata: string | null;
  created_at: string;
}

export interface XpEventRow {
  id: number;
  pillar_id: 'body' | 'mind' | 'finance' | 'projects';
  amount: number;
  // 'arc_completion' = the bonus xp_event awarded when an arc's final step completes
  source_type:
    | 'quest_completed'
    | 'quest_failed'
    | 'streak_bonus'
    | 'penalty'
    | 'manual_adjustment'
    | 'arc_completion';
  source_id: number | null;
  description: string;
  occurred_at: string;
}

export interface CompletionRow {
  id: number;
  quest_id: number;
  status: 'completed' | 'failed' | 'skipped';
  xp_awarded: number;
  notes: string | null;
  completed_at: string;
  source: 'manual' | 'auto'; // default 'manual'
}

export interface QuestTemplateRow {
  id: number;
  pillar_id: 'body' | 'mind' | 'finance' | 'projects';
  title: string;
  description: string | null;
  base_metric: string;
  current_value: number;
  starting_value: number;
  progression_rule: string; // JSON string
  schedule: 'daily' | 'weekdays' | 'weekly' | 'custom';
  schedule_config: string | null;
  base_xp: number;
  difficulty: string;
  active: number;
  created_by: 'manual' | 'system';
  last_progressed_at: string | null;
  created_at: string;
  metadata: string | null;
  auto_complete_rule: string | null; // Raw TEXT from D1; parsed via AutoCompleteRuleSchema on read.
  deleted_at: string | null; // NULL = active, non-NULL = soft-deleted
}

// ─────────────────────────────────────────────────────────────────────
// Spotify show filters
// ─────────────────────────────────────────────────────────────────────

export type PillarId = 'body' | 'mind' | 'finance' | 'projects';

/** Raw D1 row for spotify_show_filters. INTEGER columns are number in D1. */
export interface SpotifyShowFilterRow {
  show_spotify_uri: string;
  show_name: string;
  include_in_mind_learning: number; // 0 | 1 (D1 stores boolean as INTEGER)
  contributes_to_pillar: PillarId; // CHECK IN ('body','mind','finance','projects'); currently always 'mind'
  user_updated_at: string;
  discovered_at: string;
}

/** Projected shape with boolean coercion applied (use in application logic). */
export interface SpotifyShowFilter {
  show_spotify_uri: string;
  show_name: string;
  include_in_mind_learning: boolean; // Projected from INTEGER 0/1
  contributes_to_pillar: PillarId;
  user_updated_at: string;
  discovered_at: string;
}

/** Project a raw D1 row to the application-friendly boolean shape. */
export function projectShowFilter(row: SpotifyShowFilterRow): SpotifyShowFilter {
  return {
    show_spotify_uri: row.show_spotify_uri,
    show_name: row.show_name,
    include_in_mind_learning: Boolean(row.include_in_mind_learning),
    contributes_to_pillar: row.contributes_to_pillar,
    user_updated_at: row.user_updated_at,
    discovered_at: row.discovered_at,
  };
}
