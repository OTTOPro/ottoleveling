import type { PillarId } from '../../do/state';

export type TriggerType =
  | 'streak'
  | 'xp_threshold'
  | 'xp_threshold_total'
  | 'completion_count'
  | 'completion_count_total'
  | 'composite'
  | 'bilan_streak'
  | 'perfect_day'
  | 'consecutive_active_days';

export interface AchievementRow {
  id: string;
  name: string;
  description: string;
  unlocked_at: string | null;
  pillar_id: PillarId | null;
  trigger_type: TriggerType;
  trigger_config: string; // JSON-stringified
}

export interface UnlockedAchievement extends AchievementRow {
  unlocked_at: string; // non-null after unlock
}

export interface RecentUnlock {
  id: string;
  name: string;
  description: string;
  pillar_id: PillarId | null;
  unlocked_at: string;
}

export interface ClosestAchievement {
  id: string;
  name: string;
  progress: number;
  threshold: number;
  fraction: number; // progress / threshold, ∈ [0.9, 1)
}

// Discriminated union for parsed trigger_config payloads.
export type ParsedTriggerConfig =
  | { type: 'streak'; pillar: PillarId; threshold: number }
  | { type: 'xp_threshold'; pillar: PillarId; threshold: number }
  | { type: 'xp_threshold_total'; threshold: number }
  | { type: 'completion_count'; pillar: PillarId; threshold: number }
  | { type: 'completion_count_total'; threshold: number }
  | { type: 'composite'; all_pillars_level_at_least: number }
  | {
      type: 'bilan_streak';
      period_type: 'weekly' | 'monthly' | 'yearly';
      threshold: number;
      min_completion_rate: number;
    }
  | { type: 'perfect_day'; min_assigned: number }
  | { type: 'consecutive_active_days'; threshold: number };

/**
 * Parses a trigger_config JSON string against its trigger_type. Throws on
 * malformed config (caller must wrap in try/catch - the evaluator does).
 */
export function parseTriggerConfig(
  triggerType: TriggerType,
  configJson: string,
): ParsedTriggerConfig {
  const raw = JSON.parse(configJson) as Record<string, unknown>;
  switch (triggerType) {
    case 'streak':
      return { type: 'streak', pillar: raw.pillar as PillarId, threshold: Number(raw.threshold) };
    case 'xp_threshold':
      return {
        type: 'xp_threshold',
        pillar: raw.pillar as PillarId,
        threshold: Number(raw.threshold),
      };
    case 'xp_threshold_total':
      return { type: 'xp_threshold_total', threshold: Number(raw.threshold) };
    case 'completion_count':
      return {
        type: 'completion_count',
        pillar: raw.pillar as PillarId,
        threshold: Number(raw.threshold),
      };
    case 'completion_count_total':
      return { type: 'completion_count_total', threshold: Number(raw.threshold) };
    case 'composite':
      return {
        type: 'composite',
        all_pillars_level_at_least: Number(raw.all_pillars_level_at_least),
      };
    case 'bilan_streak':
      return {
        type: 'bilan_streak',
        period_type: raw.period_type as 'weekly' | 'monthly' | 'yearly',
        threshold: Number(raw.threshold),
        min_completion_rate: Number(raw.min_completion_rate),
      };
    case 'perfect_day':
      return { type: 'perfect_day', min_assigned: Number(raw.min_assigned) };
    case 'consecutive_active_days':
      return { type: 'consecutive_active_days', threshold: Number(raw.threshold) };
  }
}
