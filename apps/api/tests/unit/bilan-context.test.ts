import { describe, it, expect } from 'vitest';
import { buildBilanContext } from '../../src/do/bilan-context';
import type {
  BilanStatsInput,
  FocusHistoryEntry,
  PreviousBilanRef,
} from '../../src/lib/d1-reads-bilan';
import type { DetectedPattern } from '../../src/do/state';
import { emptyState } from '../../src/do/state';
import { readPlayerConfig } from '../../src/lib/player';
import { EXAMPLE_PLAYER_PROFILE } from '../fixtures/player-profile';

const PLAYER = readPlayerConfig({ PLAYER_PROFILE: EXAMPLE_PLAYER_PROFILE });

const REQUIRED_KEYS = [
  'PLAYER_NAME',
  'PLAYER_PROFILE',
  'PERIOD_TYPE',
  'PERIOD_START',
  'PERIOD_END',
  'PERIOD_DAYS',
  'GLOBAL_STATS',
  'PILLAR_STATS',
  'FOCUS_HISTORY',
  'OBJECTIVES_PROGRESS',
  'TEMPLATES_PROGRESS',
  'CHECKINS_SUMMARY',
  'CURRENT_PATTERNS',
  'PERFORMANCE_VS_PHYSIOLOGY',
  'PREVIOUS_BILAN',
];

function stats(): BilanStatsInput {
  return {
    global: {
      total_xp: 100,
      total_quests: 5,
      completed: 4,
      failed: 1,
      skipped: 0,
      completion_rate: 0.8,
    },
    byPillar: {
      body: { xp: 50, completed: 2, failed: 1, skipped: 0, assigned: 3, rate: 0.667 },
      mind: { xp: 25, completed: 1, failed: 0, skipped: 0, assigned: 1, rate: 1.0 },
      finance: { xp: 0, completed: 0, failed: 0, skipped: 0, assigned: 0, rate: 0 },
      projects: { xp: 25, completed: 1, failed: 0, skipped: 0, assigned: 1, rate: 1.0 },
    },
    streaks: {
      body: { current: 0, longest_in_period: 2 },
      mind: { current: 1, longest_in_period: 1 },
      finance: { current: 0, longest_in_period: 0 },
      projects: { current: 1, longest_in_period: 1 },
    },
    objectivesProgress: [{ id: 1, title: 'Read 6 books', progress_pct: 0.33, delta_in_period: 1 }],
    templatesProgress: [
      {
        template_id: 4,
        title: 'Spanish practice',
        current_value: 25,
        last_progressed_at: '2026-05-25T19:00:00Z',
        adjustments_in_period: 1,
      },
    ],
    checkinsSummary: { count: 3, avg_energy: 7.5, recent_moods: ['focused', 'tired'] },
    physiologyState: {
      hrv_baseline_avg: null,
      hrv_period_avg: null,
      hrv_delta_pct: null,
      sleep_period_avg_min: null,
      worst_sleep_night_min: null,
    },
  };
}

function focus(): FocusHistoryEntry[] {
  return [
    { pillarId: 'body', horizon: 'weekly', startedAt: '2026-05-18T00:00:00Z', endedAt: null },
  ];
}

describe('buildBilanContext', () => {
  it('returns all 14 placeholders', () => {
    const ctx = buildBilanContext({
      player: PLAYER,
      state: emptyState(),
      periodType: 'weekly',
      periodStart: '2026-05-18',
      periodEnd: '2026-05-24',
      periodDays: 7,
      stats: stats(),
      focusHistory: focus(),
      previousBilan: null,
      detectedPatterns: [],
      performanceVsPhysiology: '(insufficient calibration data - no recovery analysis possible)',
    });
    for (const k of REQUIRED_KEYS) expect(ctx).toHaveProperty(k);
  });

  it('formats PILLAR_STATS as a 4-line list', () => {
    const ctx = buildBilanContext({
      player: PLAYER,
      state: emptyState(),
      periodType: 'weekly',
      periodStart: '2026-05-18',
      periodEnd: '2026-05-24',
      periodDays: 7,
      stats: stats(),
      focusHistory: focus(),
      previousBilan: null,
      detectedPatterns: [],
      performanceVsPhysiology: '(insufficient calibration data - no recovery analysis possible)',
    });
    expect(ctx.PILLAR_STATS!.split('\n').length).toBe(4);
    expect(ctx.PILLAR_STATS).toContain('body');
    expect(ctx.PILLAR_STATS).toContain('finance');
  });

  it('PREVIOUS_BILAN renders "None" when null', () => {
    const ctx = buildBilanContext({
      player: PLAYER,
      state: emptyState(),
      periodType: 'weekly',
      periodStart: '2026-05-18',
      periodEnd: '2026-05-24',
      periodDays: 7,
      stats: stats(),
      focusHistory: focus(),
      previousBilan: null,
      detectedPatterns: [],
      performanceVsPhysiology: '(insufficient calibration data - no recovery analysis possible)',
    });
    expect(ctx.PREVIOUS_BILAN).toBe('None');
  });

  it('PREVIOUS_BILAN renders deltas when provided', () => {
    const prev: PreviousBilanRef = {
      id: 99,
      period_type: 'weekly',
      period_start: '2026-05-11',
      period_end: '2026-05-17',
      stats: { ...stats(), global: { ...stats().global, completion_rate: 0.5 } },
    };
    const ctx = buildBilanContext({
      player: PLAYER,
      state: emptyState(),
      periodType: 'weekly',
      periodStart: '2026-05-18',
      periodEnd: '2026-05-24',
      periodDays: 7,
      stats: stats(),
      focusHistory: focus(),
      previousBilan: prev,
      detectedPatterns: [],
      performanceVsPhysiology: '(insufficient calibration data - no recovery analysis possible)',
    });
    expect(ctx.PREVIOUS_BILAN).toContain('2026-05-11');
    expect(ctx.PREVIOUS_BILAN).toContain('completion_rate');
  });

  it('CURRENT_PATTERNS reflects passed-in detectedPatterns', () => {
    const p: DetectedPattern = {
      type: 'consistency_streak',
      description: 'Body 9-day',
      confidence: 0.64,
      detectedAt: '2026-05-24T20:00:00Z',
    };
    const ctx = buildBilanContext({
      player: PLAYER,
      state: emptyState(),
      periodType: 'weekly',
      periodStart: '2026-05-18',
      periodEnd: '2026-05-24',
      periodDays: 7,
      stats: stats(),
      focusHistory: focus(),
      previousBilan: null,
      detectedPatterns: [p],
      performanceVsPhysiology: '(insufficient calibration data - no recovery analysis possible)',
    });
    expect(ctx.CURRENT_PATTERNS).toContain('consistency_streak');
    expect(ctx.CURRENT_PATTERNS).toContain('0.64');
  });

  it('PLAYER_PROFILE preserves the physical-constraint and crypto safety language', () => {
    const ctx = buildBilanContext({
      player: PLAYER,
      state: emptyState(),
      periodType: 'weekly',
      periodStart: '2026-05-18',
      periodEnd: '2026-05-24',
      periodDays: 7,
      stats: stats(),
      focusHistory: focus(),
      previousBilan: null,
      detectedPatterns: [],
      performanceVsPhysiology: '(insufficient calibration data - no recovery analysis possible)',
    });
    expect(ctx.PLAYER_PROFILE).toMatch(/lower-back sensitivity/i);
    expect(ctx.PLAYER_PROFILE).toMatch(/loaded spinal flexion/i);
    expect(ctx.PLAYER_PROFILE).toContain('crypto');
  });
});
