import { describe, it, expect } from 'vitest';
import { buildGenerationContext, dayOfWeekFromIso } from '../../src/do/generation-context';
import { readPlayerConfig } from '../../src/lib/player';
import { EXAMPLE_DAY_JOB_EXCLUSIONS, EXAMPLE_PLAYER_PROFILE } from '../fixtures/player-profile';
import { emptyState } from '../../src/do/state';
import { renderPrompt, QUEST_GENERATION_PROMPT } from '../../src/lib/llm/prompts';

describe('dayOfWeekFromIso', () => {
  it.each([
    ['2026-05-24', 'Sunday'],
    ['2026-05-25', 'Monday'],
    ['2026-05-30', 'Saturday'],
  ])('%s → %s', (iso, day) => {
    expect(dayOfWeekFromIso(iso)).toBe(day);
  });
});

const PLAYER = readPlayerConfig({
  PLAYER_PROFILE: EXAMPLE_PLAYER_PROFILE,
  DAY_JOB_EXCLUSIONS: EXAMPLE_DAY_JOB_EXCLUSIONS,
});

const BASE_INPUT = {
  player: PLAYER,
  state: emptyState(),
  today: '2026-05-24',
  activeObjectives: [],
  pillarLevels: [
    { pillarId: 'body' as const, xp: 100, level: 1, xpToNext: 400 },
    { pillarId: 'mind' as const, xp: 0, level: 0, xpToNext: 100 },
    { pillarId: 'finance' as const, xp: 0, level: 0, xpToNext: 100 },
    { pillarId: 'projects' as const, xp: 0, level: 0, xpToNext: 100 },
  ],
  recentPerformance: [
    { pillarId: 'body' as const, assigned: 5, completed: 4, rate: 0.8 },
    { pillarId: 'mind' as const, assigned: 0, completed: 0, rate: 0 },
    { pillarId: 'finance' as const, assigned: 0, completed: 0, rate: 0 },
    { pillarId: 'projects' as const, assigned: 0, completed: 0, rate: 0 },
  ],
  activeTemplates: [],
  latestCheckin: null,
  lifetimeStats: [],
  pillarLevelsForTitles: { body: 1, mind: 0, finance: 0, projects: 0 },
  recentAchievements: [],
  closestToThreshold: [],
  activeArcs: [],
  objectiveMetrics: { body: [], mind: [], finance: [], projects: [] },
  currentListening: [],
  activeProjects: [],
  // Yesterday summary defaults
  yesterdayIso: '2026-05-23',
  yesterdayPerPillar: [
    { pillar: 'body' as const, assigned: 0, completed: 0 },
    { pillar: 'mind' as const, assigned: 0, completed: 0 },
    { pillar: 'finance' as const, assigned: 0, completed: 0 },
    { pillar: 'projects' as const, assigned: 0, completed: 0 },
  ],
  yesterdayMissed: [],
  yesterdayCheckinNotes: null,
  yesterdayCheckinRowExists: false,
};

describe('buildGenerationContext', () => {
  it('returns all 22 expected placeholder keys', () => {
    const ctx = buildGenerationContext(BASE_INPUT);
    const expectedKeys = [
      'PLAYER_NAME',
      'PLAYER_PROFILE',
      'DAY_JOB_EXCLUSIONS',
      'CURRENT_DATE',
      'DAY_OF_WEEK',
      'CURRENT_FOCUS',
      'ACTIVE_OBJECTIVES',
      'PILLAR_LEVELS',
      'STREAKS',
      'RECENT_PERFORMANCE',
      'DETECTED_PATTERNS',
      'LAST_CHECKIN',
      'ACTIVE_TEMPLATES',
      'LIFETIME_SNAPSHOT',
      'CURRENT_TITLES',
      'RECENT_ACHIEVEMENTS',
      'ACTIVE_ARCS',
      'ACTIVE_PROJECTS',
      'OBJECTIVE_METRICS',
      'CURRENT_LISTENING',
      'YESTERDAY_SUMMARY',
      'CALIBRATION_SIGNALS',
    ];
    expect(Object.keys(ctx).sort()).toEqual(expectedKeys.sort());
  });

  it('YESTERDAY_SUMMARY renders with header and per-pillar counts', () => {
    const ctx = buildGenerationContext({
      ...BASE_INPUT,
      yesterdayIso: '2026-05-23',
      yesterdayPerPillar: [
        { pillar: 'body' as const, assigned: 3, completed: 2 },
        { pillar: 'mind' as const, assigned: 1, completed: 0 },
        { pillar: 'finance' as const, assigned: 0, completed: 0 },
        { pillar: 'projects' as const, assigned: 1, completed: 1 },
      ],
      yesterdayMissed: [{ pillar: 'mind' as const, questTitle: 'read 30 min' }],
      yesterdayCheckinNotes: 'back mild pain after football',
      yesterdayCheckinRowExists: true,
    });
    expect(ctx.YESTERDAY_SUMMARY).toContain('YESTERDAY (2026-05-23)');
    expect(ctx.YESTERDAY_SUMMARY).toContain('Body 2/3');
    expect(ctx.YESTERDAY_SUMMARY).toContain('Mind 0/1');
    expect(ctx.YESTERDAY_SUMMARY).toContain('Missed: Mind "read 30 min"');
    expect(ctx.YESTERDAY_SUMMARY).toContain('Check-in pain:');
    expect(ctx.YESTERDAY_SUMMARY).toContain('back');
    expect(ctx.YESTERDAY_SUMMARY).toContain('Streaks:');
  });

  it('OBJECTIVE_METRICS renders "No objective metrics connected." for empty input', () => {
    const ctx = buildGenerationContext(BASE_INPUT);
    expect(ctx.OBJECTIVE_METRICS).toContain('No objective metrics connected.');
  });

  it('OBJECTIVE_METRICS renders per-pillar metric lines when populated', () => {
    const ctx = buildGenerationContext({
      ...BASE_INPUT,
      objectiveMetrics: {
        body: [
          { metric: 'steps', avg: 8200, latest: 9600, trend: 'up' as const },
          { metric: 'resting_hr', avg: 58, latest: 56, trend: 'down' as const },
        ],
        mind: [],
        finance: [],
        projects: [],
      },
    });
    expect(ctx.OBJECTIVE_METRICS).toContain('- body (last 7d):');
    expect(ctx.OBJECTIVE_METRICS).toContain('steps');
    expect(ctx.OBJECTIVE_METRICS).toContain('avg 8,200');
    expect(ctx.OBJECTIVE_METRICS).toContain('↑');
    expect(ctx.OBJECTIVE_METRICS).toContain('↓ (improving)');
  });

  it('CURRENT_LISTENING renders empty-state line for no input', () => {
    const ctx = buildGenerationContext(BASE_INPUT);
    expect(ctx.CURRENT_LISTENING).toContain('no podcast/audiobook library activity today');
    expect(ctx.CURRENT_LISTENING).not.toMatch(/\d+\s*min today/);
  });

  it('CURRENT_LISTENING renders per-entry save lines when populated (episode + audiobook mixed)', () => {
    const ctx = buildGenerationContext({
      ...BASE_INPUT,
      currentListening: [
        {
          show_or_book_title: 'Long Conversations',
          show_or_book_author: 'Avery Lane',
          show_or_book_spotify_uri: 'spotify:show:longconv',
          listening_type: 'episode_save',
          saves_in_window: 3,
          last_save_date: '2026-05-29',
        },
        {
          show_or_book_title: 'A Short History of Tools',
          show_or_book_author: 'Morgan Ellis',
          show_or_book_spotify_uri: 'spotify:audiobook:toolshistory',
          listening_type: 'audiobook_save',
          saves_in_window: 1,
          last_save_date: '2026-05-28',
        },
      ],
    });
    expect(ctx.CURRENT_LISTENING).toContain('Long Conversations');
    expect(ctx.CURRENT_LISTENING).toContain('A Short History of Tools');
    expect(ctx.CURRENT_LISTENING).toContain('Morgan Ellis');
    expect(ctx.CURRENT_LISTENING).toContain('saved');
    expect(ctx.CURRENT_LISTENING).toContain('(saved ≠ listened)');
    expect(ctx.CURRENT_LISTENING).not.toMatch(/\d+\s*min today/);
  });

  it('ACTIVE_ARCS renders "None active." when input is empty', () => {
    const ctx = buildGenerationContext(BASE_INPUT);
    expect(ctx.ACTIVE_ARCS).toBe('None active.');
  });

  it('ACTIVE_ARCS renders one line per active arc with [arc N] handle', () => {
    const ctx = buildGenerationContext({
      ...BASE_INPUT,
      activeArcs: [
        {
          id: 3,
          pillar_id: 'body',
          title: 'Trial of Discipline',
          description: 'D',
          total_steps: 7,
          completed_steps: 4,
          status: 'active',
          started_at: '2026-05-28T08:00:00Z',
          expected_end: '2026-06-10T08:00:00Z',
          completed_at: null,
          total_xp_reward: 500,
          metadata: null,
        },
      ],
    });
    expect(ctx.ACTIVE_ARCS).toContain('[arc 3]');
    expect(ctx.ACTIVE_ARCS).toContain('Trial of Discipline');
    expect(ctx.ACTIVE_ARCS).toContain('4/7 steps');
  });

  it('RECENT_ACHIEVEMENTS renders "None yet." for empty state', () => {
    const ctx = buildGenerationContext(BASE_INPUT);
    expect(ctx.RECENT_ACHIEVEMENTS).toContain('None yet.');
  });

  it('RECENT_ACHIEVEMENTS renders both sections (Unlocked + Closest) when populated', () => {
    const ctx = buildGenerationContext({
      ...BASE_INPUT,
      recentAchievements: [
        {
          id: 'body_first_step',
          name: 'First Step',
          description: 'First body quest completed.',
          unlocked_at: '2026-05-12 14:30:00',
          pillar_id: 'body',
          trigger_type: 'completion_count',
          trigger_config: '{"pillar":"body","threshold":1}',
        },
      ],
      closestToThreshold: [
        {
          id: 'body_hardened_500xp',
          name: 'Hardened',
          progress: 460,
          threshold: 500,
          fraction: 0.92,
        },
      ],
    });
    expect(ctx.RECENT_ACHIEVEMENTS).toContain('Unlocked in last 30 days');
    expect(ctx.RECENT_ACHIEVEMENTS).toContain('First Step');
    expect(ctx.RECENT_ACHIEVEMENTS).toContain('Closest to unlock');
    expect(ctx.RECENT_ACHIEVEMENTS).toContain('Hardened');
    expect(ctx.RECENT_ACHIEVEMENTS).toContain('92%');
  });

  it('CALIBRATION_SIGNALS renders empty-state line when calibrationSignals is not provided', () => {
    const ctx = buildGenerationContext(BASE_INPUT);
    expect(ctx.CALIBRATION_SIGNALS).toContain('no calibration signals available');
  });

  it('CALIBRATION_SIGNALS renders signal lines when calibrationSignals is provided', () => {
    const ctx = buildGenerationContext({
      ...BASE_INPUT,
      calibrationSignals: {
        hrv: 'declining',
        sleep: { status: 'none' },
        reading: 'drought',
        hrvRecentAvg: 44,
        hrvBaselineAvg: 50,
        hrvDeltaPct: -0.12,
        sleepPreviousNightMinutes: undefined,
        sleepSevenDayAvgMinutes: undefined,
        episodeSaves7dFiltered: 0,
      },
    });
    expect(ctx.CALIBRATION_SIGNALS).toContain('## Calibration signals (derived)');
    expect(ctx.CALIBRATION_SIGNALS).toContain('declining');
    expect(ctx.CALIBRATION_SIGNALS).toContain('drought');
  });

  it('CURRENT_FOCUS defaults to "None" when no focus set', () => {
    const ctx = buildGenerationContext(BASE_INPUT);
    expect(ctx.CURRENT_FOCUS).toBe('None');
  });

  it('CURRENT_FOCUS formats as "Pillar: X, Horizon: Y, started: Z"', () => {
    const state = emptyState();
    state.currentFocus = {
      pillarId: 'body',
      horizon: 'weekly',
      startedAt: '2026-05-20T10:00:00.000Z',
    };
    const ctx = buildGenerationContext({ ...BASE_INPUT, state });
    expect(ctx.CURRENT_FOCUS).toBe('Pillar: body, Horizon: weekly, started: 2026-05-20');
  });

  it('ACTIVE_OBJECTIVES says "No active objectives." when empty', () => {
    expect(buildGenerationContext(BASE_INPUT).ACTIVE_OBJECTIVES).toBe('No active objectives.');
  });

  it('PILLAR_LEVELS lists all 4 pillars with level + XP + to-next', () => {
    const ctx = buildGenerationContext(BASE_INPUT);
    expect(ctx.PILLAR_LEVELS).toContain('- body: level 1');
    expect(ctx.PILLAR_LEVELS).toContain('- mind: level 0');
    expect(ctx.PILLAR_LEVELS).toContain('- finance: level 0');
    expect(ctx.PILLAR_LEVELS).toContain('- projects: level 0');
  });

  it('STREAKS lists all 4 pillars with "last success never" for empty state', () => {
    const ctx = buildGenerationContext(BASE_INPUT);
    expect(ctx.STREAKS).toContain('- body: current 0, longest 0, last success never');
  });

  it('RECENT_PERFORMANCE formats as fraction + percentage', () => {
    const ctx = buildGenerationContext(BASE_INPUT);
    expect(ctx.RECENT_PERFORMANCE).toContain('- body: 4/5 (80%)');
    expect(ctx.RECENT_PERFORMANCE).toContain('- mind: 0/0 (0%)');
  });

  it('DETECTED_PATTERNS says "None detected yet." when no patterns exist', () => {
    expect(buildGenerationContext(BASE_INPUT).DETECTED_PATTERNS).toBe('None detected yet.');
  });

  it('LAST_CHECKIN says "None" when null', () => {
    expect(buildGenerationContext(BASE_INPUT).LAST_CHECKIN).toBe('None');
  });

  it('LAST_CHECKIN formats with energy + mood + notes when present', () => {
    const ctx = buildGenerationContext({
      ...BASE_INPUT,
      latestCheckin: { date: '2026-05-23', energyLevel: 7, mood: 'focused', notes: 'great day' },
    });
    expect(ctx.LAST_CHECKIN).toBe('2026-05-23, energy 7/10, mood: focused, notes: "great day"');
  });

  it('ACTIVE_TEMPLATES says "None active for today." when empty', () => {
    expect(buildGenerationContext(BASE_INPUT).ACTIVE_TEMPLATES).toBe('None active for today.');
  });

  it('LIFETIME_SNAPSHOT renders 4 lines (one per pillar) even when input is empty', () => {
    const ctx = buildGenerationContext(BASE_INPUT);
    const lines = ctx.LIFETIME_SNAPSHOT!.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('body:');
    expect(lines[3]).toContain('projects:');
    expect(ctx.LIFETIME_SNAPSHOT).toContain('first -');
  });

  it('LIFETIME_SNAPSHOT renders populated rows in body→mind→finance→projects order', () => {
    const ctx = buildGenerationContext({
      ...BASE_INPUT,
      lifetimeStats: [
        {
          pillar_id: 'mind',
          total_xp: 99,
          total_completed: 2,
          total_failed: 0,
          longest_streak: 2,
          highest_level: 0,
          first_quest_at: '2026-02-01',
          last_updated_at: null,
        },
        {
          pillar_id: 'body',
          total_xp: 250,
          total_completed: 5,
          total_failed: 1,
          longest_streak: 4,
          highest_level: 1,
          first_quest_at: '2026-01-05',
          last_updated_at: null,
        },
      ],
    });
    const lines = ctx.LIFETIME_SNAPSHOT!.split('\n');
    expect(lines[0]).toContain('xp 250');
    expect(lines[1]).toContain('xp 99');
    // finance + projects fall back to defaults
    expect(lines[2]).toContain('xp 0');
    expect(lines[3]).toContain('xp 0');
  });

  it('CURRENT_TITLES renders 5 lines (4 pillars + composite) at all-zero levels', () => {
    const ctx = buildGenerationContext({
      ...BASE_INPUT,
      pillarLevelsForTitles: { body: 0, mind: 0, finance: 0, projects: 0 },
    });
    const lines = ctx.CURRENT_TITLES!.split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain('body:');
    expect(lines[0]).toContain('Initiate');
    expect(lines[0]).toContain('E-Rank');
    expect(lines[4]).toContain('composite:');
    expect(lines[4]).toContain('Unranked'); // E-Rank composite
    expect(lines[4]).toContain('sum 0');
  });

  it('CURRENT_TITLES reflects mixed levels with SUM-derived composite', () => {
    const ctx = buildGenerationContext({
      ...BASE_INPUT,
      pillarLevelsForTitles: { body: 12, mind: 4, finance: 0, projects: 1 },
    });
    const lines = ctx.CURRENT_TITLES!.split('\n');
    expect(lines[0]).toContain('Hunter');
    expect(lines[0]).toContain('B-Rank');
    expect(lines[1]).toContain('Apprentice');
    expect(lines[1]).toContain('D-Rank');
    expect(lines[2]).toContain('Initiate'); // finance @ 0 = Initiate
    expect(lines[2]).toContain('E-Rank');
    expect(lines[3]).toContain('Apprentice'); // projects @ 1 = Apprentice
    expect(lines[3]).toContain('E-Rank');
    expect(lines[4]).toContain('composite:');
    expect(lines[4]).toContain('Path-Walker'); // sum=17 → D-Rank composite
    expect(lines[4]).toContain('D-Rank');
    expect(lines[4]).toContain('sum 17');
  });

  it('PLAYER_PROFILE carries the configured profile; PLAYER_NAME defaults to Player', () => {
    const ctx = buildGenerationContext(BASE_INPUT);
    expect(ctx.PLAYER_PROFILE).toBe(EXAMPLE_PLAYER_PROFILE);
    expect(ctx.PLAYER_NAME).toBe('Player');
  });

  it('DAY_JOB_EXCLUSIONS renders one bullet per configured domain', () => {
    const ctx = buildGenerationContext(BASE_INPUT);
    expect(ctx.DAY_JOB_EXCLUSIONS).toBe(
      '- employer client work\n- employer internal tooling\n- on-call tickets',
    );
  });

  it('falls back to a conservative default profile when PLAYER_PROFILE is unset', () => {
    const ctx = buildGenerationContext({ ...BASE_INPUT, player: readPlayerConfig({}) });
    expect(ctx.PLAYER_PROFILE).toMatch(/No player profile is configured/);
    expect(ctx.PLAYER_PROFILE).toMatch(/crypto/);
    expect(ctx.DAY_JOB_EXCLUSIONS).toContain('no day-job domains configured');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Regression guards: the rendered prompt (what the LLM actually receives)
// must carry the physical-constraint and crypto safety language. Catches
// silent regressions in the player profile wiring, the prompt template,
// or buildGenerationContext placeholder substitution.
// ─────────────────────────────────────────────────────────────────────

describe('REGRESSION GUARD: rendered prompt carries medical + crypto safety language', () => {
  function render(): string {
    const vars = buildGenerationContext(BASE_INPUT);
    return renderPrompt(QUEST_GENERATION_PROMPT, vars);
  }

  it('rendered prompt contains the profile constraint keywords', () => {
    const rendered = render().toLowerCase();
    const required = [
      'lower-back sensitivity',
      'heavy deadlifts',
      'loaded spinal flexion',
      'plyometric', // matches both "plyometrics" and "plyometric"
    ];
    for (const keyword of required) {
      expect(rendered).toContain(keyword.toLowerCase());
    }
  });

  it('rendered prompt enforces NO crypto in the finance pillar', () => {
    const rendered = render();
    // The prompt template says "NO crypto, ever" verbatim; the profile says "no crypto".
    // Either phrasing surviving the substitution is enough to guard.
    expect(rendered).toMatch(/NO crypto|EXCEPT crypto|no crypto|exclude crypto/i);
  });
});
