import type { ProviderName } from '../data-sources/types';

/**
 * AutoCompleteRule - JSON shape persisted in quest_templates.auto_complete_rule.
 * 8c ships a single rule type ('metric_threshold'); the discriminated-union
 * shape leaves room for future additions (e.g., 'metric_streak', 'composite')
 * without breaking existing rows.
 *
 * Comparison defaults to '>=' if absent on read (see schemas/auto-complete.ts).
 */
export type AutoCompleteRule = {
  type: 'metric_threshold';
  metric: string; // 'steps' | 'library_saves_episodes' | ... (matches daily_metrics.metric)
  source: ProviderName; // 'google_health' | 'spotify' - matches daily_metrics.provider
  threshold: number;
  comparison?: '>=' | '>'; // defaults to '>='
};
// Future: | { type: 'metric_streak'; ... } | { type: 'composite'; rules: AutoCompleteRule[] };

/**
 * AutoCompletion - DO state FIFO entry. Pushed onto state.recentAutoCompletions
 * (cap 10) whenever an auto-completion fires. Today page reads to render
 * <AutoCompleteNotificationBanner>.
 */
export interface AutoCompletion {
  /** Stable id (UUID) for localStorage dedup on the frontend. */
  id: string;
  /** Quest that auto-completed. */
  quest_id: number;
  /** Quest title - denormalized for the notification text. */
  quest_title: string;
  /** Pillar - denormalized for pillar-tinted notification + future analytics. */
  pillar_id: 'body' | 'mind' | 'finance' | 'projects';
  /** Rule that fired. */
  rule: AutoCompleteRule;
  /** Metric value that satisfied the rule (for the notification text). */
  metric_value: number;
  /** ISO timestamp of the auto-completion. */
  fired_at: string;
}

/** Result of attempting an auto-completion on a specific quest. */
export type AutoCompletionResult =
  | { ok: true; completion_id: number; quest_id: number }
  | {
      ok: false;
      quest_id: number;
      reason: 'already_completed' | 'rule_not_satisfied' | 'metric_missing' | 'insert_failed';
    };
