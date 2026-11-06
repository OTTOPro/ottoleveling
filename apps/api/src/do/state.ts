import { emptyStreak, type PillarStreak } from '../lib/streak';
import type { JsonValue } from '../types/json';
import type { RecentUnlock, UnlockedAchievement } from '../lib/achievements/types';
import { STATE_RECENT_UNLOCKS_CAP } from '../lib/achievements/thresholds';
import type { AutoCompletion } from '../lib/auto-complete/types';

export const STATE_RECENT_AUTO_COMPLETIONS_CAP = 10;

export type PillarId = 'body' | 'mind' | 'finance' | 'projects';
export type FocusHorizon = 'weekly' | 'monthly' | 'sprint';

export interface CurrentFocus {
  pillarId: PillarId;
  horizon: FocusHorizon;
  startedAt: string; // ISO 8601
}

export type ScheduledEventType =
  /**
   * Spawns the DailyCycleWorkflow instance at 06:00 UTC. The workflow handles
   * daily generation and the Google Health / Spotify syncs.
   */
  | 'daily_cycle_spawn'
  // Legacy alarm types - RETAINED for backward-compat with existing persisted DO state.
  // The alarm handler ignores them gracefully (reschedules as daily_cycle_spawn).
  | 'daily_generation'
  | 'weekly_bilan'
  | 'monthly_bilan'
  | 'yearly_bilan'
  | 'template_progression_check'
  | 'google_health_sync'
  | 'spotify_sync';

export interface ScheduledEvent {
  id: string;
  type: ScheduledEventType;
  scheduledFor: string; // ISO 8601
  payload?: JsonValue | null;
}

export interface DetectedPattern {
  type: string;
  description: string;
  confidence: number; // 0.0 - 1.0
  detectedAt: string;
}

export interface SystemAgentState {
  context: {
    userBio: string;
    activePillars: PillarId[];
  };
  currentFocus: CurrentFocus | null;
  patterns: DetectedPattern[];
  streaks: Record<PillarId, PillarStreak>;
  counters: {
    llmCallsToday: number;
    llmCallsTodayResetAt: string;
  };
  scheduledEvents: ScheduledEvent[];
  recentUnlocks: RecentUnlock[]; // FIFO-capped at STATE_RECENT_UNLOCKS_CAP
  activeArcCount: number; // cached counter; forward-filled from D1 on each generation
  /**
   * FIFO of recent auto-completions for the Today notification banner.
   * Capped at STATE_RECENT_AUTO_COMPLETIONS_CAP (10). Older entries evict on push.
   * Forward-filled to [] by runAutoCompleteAfter* if missing (older persisted state).
   */
  recentAutoCompletions: AutoCompletion[];
}

const PILLARS: readonly PillarId[] = ['body', 'mind', 'finance', 'projects'] as const;
const STATE_KEY = 'state';

export function emptyState(): SystemAgentState {
  return {
    context: {
      userBio: '',
      activePillars: [...PILLARS],
    },
    currentFocus: null,
    patterns: [],
    streaks: {
      body: emptyStreak(),
      mind: emptyStreak(),
      finance: emptyStreak(),
      projects: emptyStreak(),
    },
    counters: {
      llmCallsToday: 0,
      llmCallsTodayResetAt: new Date(0).toISOString(),
    },
    scheduledEvents: [],
    recentUnlocks: [],
    activeArcCount: 0,
    recentAutoCompletions: [],
  };
}

export async function loadState(storage: DurableObjectStorage): Promise<SystemAgentState | null> {
  const v = await storage.get<SystemAgentState>(STATE_KEY);
  return v ?? null;
}

export async function saveState(
  storage: DurableObjectStorage,
  state: SystemAgentState,
): Promise<void> {
  await storage.put(STATE_KEY, state);
}

export async function getOrInitState(storage: DurableObjectStorage): Promise<SystemAgentState> {
  const existing = await loadState(storage);
  if (existing) return existing;
  const fresh = emptyState();
  await saveState(storage, fresh);
  return fresh;
}

/**
 * Bumps llmCallsToday, resetting to 0 when the date rolls over from
 * llmCallsTodayResetAt. Pure mutation on the passed state.
 */
export function bumpLlmCallCounter(state: SystemAgentState, today: string): void {
  const lastReset = state.counters.llmCallsTodayResetAt.slice(0, 10);
  if (lastReset !== today) {
    state.counters.llmCallsToday = 0;
    state.counters.llmCallsTodayResetAt = new Date().toISOString();
  }
  state.counters.llmCallsToday += 1;
}

/**
 * Append auto-completions to state.recentAutoCompletions, evicting
 * oldest entries beyond STATE_RECENT_AUTO_COMPLETIONS_CAP. Forward-fills missing
 * field defensively (older persisted state may lack it). Mutates state in place.
 */
export function pushRecentAutoCompletions(state: SystemAgentState, items: AutoCompletion[]): void {
  state.recentAutoCompletions = state.recentAutoCompletions ?? [];
  state.recentAutoCompletions.push(...items);
  while (state.recentAutoCompletions.length > STATE_RECENT_AUTO_COMPLETIONS_CAP) {
    state.recentAutoCompletions.shift();
  }
}

/**
 * Appends new unlocks to state.recentUnlocks with FIFO eviction at
 * STATE_RECENT_UNLOCKS_CAP. Pure mutation on the passed state.
 */
export function pushRecentUnlocks(state: SystemAgentState, unlocks: UnlockedAchievement[]): void {
  for (const u of unlocks) {
    state.recentUnlocks.push({
      id: u.id,
      name: u.name,
      description: u.description,
      pillar_id: u.pillar_id,
      unlocked_at: u.unlocked_at,
    });
  }
  if (state.recentUnlocks.length > STATE_RECENT_UNLOCKS_CAP) {
    state.recentUnlocks = state.recentUnlocks.slice(-STATE_RECENT_UNLOCKS_CAP);
  }
}
