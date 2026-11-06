export type PillarId = 'body' | 'mind' | 'finance' | 'projects';
export type Difficulty = 'trivial' | 'easy' | 'medium' | 'hard' | 'epic';
export type ObjectiveStatus = 'active' | 'completed' | 'abandoned' | 'paused';

export interface Objective {
  id: number;
  pillar_id: PillarId;
  title: string;
  description: string | null;
  target_date: string;
  target_metric: string | null;
  target_value: number | null;
  current_value: number | null;
  status: ObjectiveStatus;
  created_at: string;
  completed_at: string | null;
  metadata: string | null;
  deleted_at: string | null; // NULL = active, non-NULL = soft-deleted
}

export interface CreateObjectiveInput {
  pillar_id: PillarId;
  title: string;
  description?: string | null;
  target_date: string;
  target_metric?: string | null;
  target_value?: number | null;
}

// Extended PATCH schema covering every editable column.
// Free transitions: any status → any status allowed.
export interface UpdateObjectiveInput {
  title?: string;
  description?: string | null;
  pillar_id?: PillarId;
  target_date?: string | null;
  status?: ObjectiveStatus;
  target_metric?: string | null;
  target_value?: number | null;
  success_criteria?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface Quest {
  id: number;
  pillar_id: PillarId;
  title: string;
  description: string | null;
  xp_value: number;
  difficulty: Difficulty;
  source: 'system' | 'manual';
  objective_id: number | null;
  template_id?: number | null;
  scheduled_for: string;
  created_at: string;
  arc_id?: number | null;
  arc_step?: number | null;
}

export interface CreateManualQuestInput {
  pillar_id: PillarId;
  title: string;
  description?: string | null;
  difficulty: Difficulty;
  xp_value: number;
  objective_id?: number | null;
}

export interface Completion {
  id: number;
  quest_id: number;
  status: 'completed' | 'failed' | 'skipped';
  xp_awarded: number;
  notes: string | null;
  completed_at: string;
  source: 'manual' | 'auto';
}

export interface PillarStats {
  id: PillarId;
  name: string;
  color: string;
  xp: number;
  level: number;
  xp_to_next: number;
  title: string;
  rank: 'E' | 'D' | 'C' | 'B' | 'A' | 'S';
}

export interface CompositeTitleResponse {
  title: string;
  rank: 'E' | 'D' | 'C' | 'B' | 'A' | 'S';
  /** Progress within current bracket (0..1), is_max for S-rank */
  progress?: number;
  is_max?: boolean;
  sum?: number;
}

export type FocusHorizon = 'weekly' | 'monthly' | 'sprint';

export interface CurrentFocus {
  pillarId: PillarId;
  horizon: FocusHorizon;
  startedAt: string;
}

export interface PillarStreak {
  current: number;
  longest: number;
  lastSuccessDate: string | null;
}

export type ScheduledEventType =
  | 'daily_generation'
  | 'weekly_bilan'
  | 'monthly_bilan'
  | 'yearly_bilan'
  | 'template_progression_check';

export interface ScheduledEvent {
  id: string;
  type: ScheduledEventType;
  scheduledFor: string;
}

export interface SystemAgentSnapshot {
  context: { userBio: string; activePillars: PillarId[] };
  currentFocus: CurrentFocus | null;
  patterns: Array<{ type: string; description: string; confidence: number; detectedAt: string }>;
  streaks: Record<PillarId, PillarStreak>;
  counters: { llmCallsToday: number; llmCallsTodayResetAt: string };
  scheduledEvents: ScheduledEvent[];
  recentUnlocks?: RecentUnlock[];
  recentAutoCompletions?: AutoCompletion[];
}

// ─────────────────────────────────────────────────────────────────────
// Today + generation + templates
// ─────────────────────────────────────────────────────────────────────

export type QuestSchedule = 'daily' | 'weekdays' | 'weekly' | 'custom';

export interface QuestTemplate {
  id: number;
  pillar_id: PillarId;
  title: string;
  description: string | null;
  base_metric: string;
  current_value: number;
  starting_value: number;
  progression_rule: string; // JSON string from D1
  schedule: QuestSchedule;
  schedule_config: string | null;
  base_xp: number;
  difficulty: Difficulty;
  active: number;
  created_by: 'manual' | 'system';
  last_progressed_at: string | null;
  created_at: string;
  metadata: string | null;
  auto_complete_rule: AutoCompleteRule | null;
  deleted_at: string | null; // NULL = active, non-NULL = soft-deleted
}

export interface CreateTemplateInput {
  pillar_id: PillarId;
  title: string;
  description?: string | null;
  base_metric: string;
  starting_value: number;
  progression_rule?: Record<string, unknown>;
  schedule: QuestSchedule;
  schedule_config?: Record<string, unknown> | null;
  base_xp: number;
  difficulty: Difficulty;
  metadata?: Record<string, unknown> | null;
  auto_complete_rule?: AutoCompleteRule | null;
}

export interface UpdateTemplateInput {
  title?: string;
  description?: string | null;
  pillar_id?: PillarId;
  base_metric?: string;
  current_value?: number;
  progression_rule?: Record<string, unknown>;
  schedule?: QuestSchedule;
  schedule_config?: Record<string, unknown> | null;
  base_xp?: number;
  difficulty?: Difficulty;
  active?: boolean;
  metadata?: Record<string, unknown> | null;
  auto_complete_rule?: AutoCompleteRule | null;
}

export type GenerationStatus = 'idle' | 'pending' | 'ready' | 'failed';

export interface TodayResponse {
  quests: Quest[];
  reasoning: string | null;
  completions: Completion[];
  // Async generation status from KV flag.
  // 'idle': no generation queued today
  // 'pending': consumer picked up message, Groq call in progress
  // 'ready': quests landed in D1 (consumer completed)
  // 'failed': consumer gave up after retries
  generation_status: GenerationStatus;
}

export interface GenerationBatchResponse {
  generation_id: string;
  quests: Quest[];
  reasoning: string;
  source: 'llm' | 'cached' | 'fallback';
}

// ─────────────────────────────────────────────────────────────────────
// Bilans + checkins
// ─────────────────────────────────────────────────────────────────────

export type PeriodType = 'weekly' | 'monthly' | 'yearly';

export interface BilanPillarStats {
  xp: number;
  completed: number;
  failed: number;
  skipped: number;
  rate: number;
}

export interface BilanStreakStats {
  current: number;
  longest_in_period: number;
}

export interface BilanObjectiveProgress {
  id: number;
  title: string;
  progress_pct: number;
  delta_in_period: number;
}

export interface BilanPatternDetected {
  type: string;
  description: string;
  confidence: number;
}

/** Physiology aggregate for the bilan period. */
export interface BilanPhysiologyState {
  hrv_baseline_avg: number | null;
  hrv_period_avg: number | null;
  hrv_delta_pct: number | null;
  sleep_period_avg_min: number | null;
  worst_sleep_night_min: number | null;
}

export interface BilanStats {
  global: {
    total_xp: number;
    total_quests: number;
    completed: number;
    failed: number;
    skipped: number;
    completion_rate: number;
  };
  by_pillar?: Record<PillarId, BilanPillarStats>;
  byPillar?: Record<PillarId, BilanPillarStats & { assigned: number }>;
  streaks: Record<PillarId, BilanStreakStats>;
  objectives_progress?: BilanObjectiveProgress[];
  objectivesProgress?: BilanObjectiveProgress[];
  patterns_detected?: BilanPatternDetected[];
  templatesProgress?: Array<{
    template_id: number;
    title: string;
    current_value: number;
    adjustments_in_period: number;
  }>;
  checkinsSummary?: { count: number; avg_energy: number | null; recent_moods: string[] };
  /** Physiology aggregate (HRV + sleep) for the period. Nullable fields indicate no data. */
  physiologyState?: BilanPhysiologyState;
}

export interface BilanListItem {
  id: number;
  period_type: PeriodType;
  period_start: string;
  period_end: string;
  generated_at: string;
}

export interface SuggestedTemplateAdjustment {
  template_id: number;
  action: 'increase' | 'decrease' | 'pause';
  reason: string;
}

export interface Bilan {
  id: number;
  period_type: PeriodType;
  period_start: string;
  period_end: string;
  stats: BilanStats;
  narrative: string;
  generated_at: string;
  source?: 'cached' | 'llm' | 'fallback';
}

export interface Checkin {
  id: number;
  date: string;
  energy_level: number | null;
  mood: string | null;
  notes: string | null;
  created_at: string;
}

export interface CreateCheckinInput {
  date?: string;
  energy_level?: number | null;
  mood?: string | null;
  notes?: string | null;
}

// ─────────────────────────────────────────────────────────────────────
// Push notifications
// ─────────────────────────────────────────────────────────────────────

export interface PushSubscriptionStatus {
  total: number;
  subscribed?: boolean;
  subscription?: {
    id: number;
    endpoint: string;
    created_at: string;
    last_used_at: string | null;
  } | null;
}

export interface SubscribePushInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// ─────────────────────────────────────────────────────────────────────
// Achievements
// ─────────────────────────────────────────────────────────────────────

export type AchievementTriggerType =
  | 'streak'
  | 'xp_threshold'
  | 'xp_threshold_total'
  | 'completion_count'
  | 'completion_count_total'
  | 'composite'
  | 'bilan_streak'
  | 'perfect_day'
  | 'consecutive_active_days';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  unlocked_at: string | null;
  pillar_id: PillarId | null;
  trigger_type: AchievementTriggerType;
  trigger_config: string;
}

/**
 * Subset of the achievement row pushed into DO state.recentUnlocks. The
 * /api/state route already exposes this (RecentUnlock from the backend).
 */
export interface RecentUnlock {
  id: string;
  name: string;
  description: string;
  pillar_id: PillarId | null;
  unlocked_at: string;
}

// ─────────────────────────────────────────────────────────────────────
// Quest arcs
// ─────────────────────────────────────────────────────────────────────

export type ArcStatus = 'active' | 'completed' | 'failed' | 'abandoned';

export interface Arc {
  id: number;
  pillar_id: PillarId;
  title: string;
  description: string;
  total_steps: number;
  completed_steps: number;
  status: ArcStatus;
  started_at: string;
  expected_end: string | null;
  completed_at: string | null;
  total_xp_reward: number;
  metadata: string | null;
}

// ─────────────────────────────────────────────────────────────────────
// Data sources (Google Health, Spotify)
// ─────────────────────────────────────────────────────────────────────

export type ProviderName = 'google_health' | 'spotify';

// ─────────────────────────────────────────────────────────────────────
// Auto-complete rules + completions
// ─────────────────────────────────────────────────────────────────────

export type AutoCompleteRule = {
  type: 'metric_threshold';
  metric: string;
  source: 'google_health' | 'spotify';
  threshold: number;
  comparison?: '>=' | '>';
};

export interface AutoCompletion {
  id: string;
  quest_id: number;
  quest_title: string;
  pillar_id: 'body' | 'mind' | 'finance' | 'projects';
  rule: AutoCompleteRule;
  metric_value: number;
  fired_at: string;
}

export type ConnectionStatus = 'disconnected' | 'connected' | 'reauth_required' | 'error';

export type SyncStatus = 'success' | 'partial' | 'failed';

export interface DataSourceRow {
  provider: ProviderName;
  status: ConnectionStatus;
  last_sync_at: string | null;
  last_sync_status: SyncStatus | null;
  error_message: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────
// Library save activity (Spotify)
// ─────────────────────────────────────────────────────────────────────

export interface LibrarySaveSummary {
  show_or_book_title: string;
  show_or_book_author: string | null;
  show_or_book_spotify_uri: string | null;
  listening_type: 'episode_save' | 'audiobook_save';
  saves_in_window: number;
  last_save_date: string;
}

// Server-side config response.
export interface ConfigResponse {
  version: string;
  llm_model: string;
}

// ─────────────────────────────────────────────────────────────────────
// Spotify show filters
// ─────────────────────────────────────────────────────────────────────

/**
 * Projected shape for spotify_show_filters rows (boolean coercion applied).
 * contributes_to_pillar is read-only for now (always 'mind').
 */
export interface SpotifyShowFilter {
  show_spotify_uri: string;
  show_name: string;
  include_in_mind_learning: boolean;
  contributes_to_pillar: PillarId;
  user_updated_at: string;
  discovered_at: string;
}

// ─────────────────────────────────────────────────────────────────────
// Calibration signals
// ─────────────────────────────────────────────────────────────────────

export type HrvStatus = 'stable' | 'declining' | 'improving';
export type SleepStatus = 'severe' | 'mild' | 'none';
export type SleepCause = 'acute' | 'chronic' | 'both';
export type ReadingTrend = 'drought' | 'normal' | 'engaged';

export type SleepDeficit =
  | { status: 'none' }
  | {
      status: 'severe';
      cause: SleepCause;
      previousNightMinutes?: number;
      sevenDayAvgMinutes?: number;
    }
  | {
      status: 'mild';
      cause: SleepCause;
      previousNightMinutes?: number;
      sevenDayAvgMinutes?: number;
    };

export interface CalibrationSignals {
  hrv: HrvStatus;
  sleep: SleepDeficit;
  reading: ReadingTrend;
  /** Raw numbers for debug display. */
  hrvRecentAvg?: number;
  hrvBaselineAvg?: number;
  hrvDeltaPct?: number;
  sleepPreviousNightMinutes?: number;
  sleepSevenDayAvgMinutes?: number;
  episodeSaves7dFiltered?: number;
}

export interface CalibrationCurrentResponse {
  signals: CalibrationSignals | null;
  computed_at: string;
}

// ─────────────────────────────────────────────────────────────────────
// Active projects
// ─────────────────────────────────────────────────────────────────────

export type ProjectPillar = 'body' | 'mind' | 'finance' | 'projects';
export type ProjectStatus = 'active' | 'paused' | 'archived';

export interface ActiveProject {
  id: number;
  name: string;
  description: string | null;
  pillar: ProjectPillar;
  status: ProjectStatus;
  priority: number;
  start_date: string;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListProjectsResponse {
  projects: ActiveProject[];
}
export interface ProjectResponse {
  project: ActiveProject;
}

export interface CreateProjectInput {
  name: string;
  description?: string | null;
  pillar: ProjectPillar;
  status?: ProjectStatus;
  priority?: number;
  notes?: string | null;
}

export type UpdateProjectInput = Partial<CreateProjectInput>;
