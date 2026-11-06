import { describe, it, expect } from 'vitest';
import { renderPrompt, QUEST_GENERATION_PROMPT } from '../../src/lib/llm/prompts';

describe('renderPrompt', () => {
  it('substitutes a single placeholder', () => {
    expect(renderPrompt('Hello {NAME}', { NAME: 'world' })).toBe('Hello world');
  });

  it('substitutes multiple placeholders', () => {
    const tpl = '{GREETING}, {NAME}! Today is {DATE}.';
    const out = renderPrompt(tpl, { GREETING: 'Hi', NAME: 'Player', DATE: '2026-05-24' });
    expect(out).toBe('Hi, Player! Today is 2026-05-24.');
  });

  it('substitutes all occurrences of the same key', () => {
    expect(renderPrompt('{X} and {X}', { X: 'foo' })).toBe('foo and foo');
  });

  it('leaves unknown placeholders intact', () => {
    expect(renderPrompt('{KNOWN} {UNKNOWN}', { KNOWN: 'yes' })).toBe('yes {UNKNOWN}');
  });

  it('handles empty vars object', () => {
    expect(renderPrompt('hello {WORLD}', {})).toBe('hello {WORLD}');
  });
});

describe('QUEST_GENERATION_PROMPT (bundled at build time)', () => {
  it('is a non-empty string', () => {
    expect(typeof QUEST_GENERATION_PROMPT).toBe('string');
    expect(QUEST_GENERATION_PROMPT.length).toBeGreaterThan(100);
  });

  it('contains the IDENTITY header (extracted from the fenced section)', () => {
    expect(QUEST_GENERATION_PROMPT).toContain('# IDENTITY');
    expect(QUEST_GENERATION_PROMPT).toContain('You are The System');
  });

  it('contains all 20 expected placeholders', () => {
    const placeholders = [
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
    for (const p of placeholders) {
      expect(QUEST_GENERATION_PROMPT).toContain(`{${p}}`);
    }
  });

  it('contains the ## Yesterday summary subsection header', () => {
    expect(QUEST_GENERATION_PROMPT).toContain('## Yesterday summary');
  });

  it('strictness rule 1 (SUCCESS_DAY_CALIBRATION) references {YESTERDAY_SUMMARY}', () => {
    // Use the rule DEFINITION (em-dash form) to skip the precedence hierarchy block's bare label reference.
    const idx = QUEST_GENERATION_PROMPT.indexOf('1. SUCCESS_DAY_CALIBRATION -');
    expect(idx).toBeGreaterThan(-1);
    const rest = QUEST_GENERATION_PROMPT.slice(idx, idx + 600);
    expect(rest).toContain('{YESTERDAY_SUMMARY}');
  });

  it('strictness rule 2 (REGRESSION_DAY_RECOVERY) references {YESTERDAY_SUMMARY}', () => {
    const idx = QUEST_GENERATION_PROMPT.indexOf('2. REGRESSION_DAY_RECOVERY -');
    expect(idx).toBeGreaterThan(-1);
    const rest = QUEST_GENERATION_PROMPT.slice(idx, idx + 600);
    expect(rest).toContain('{YESTERDAY_SUMMARY}');
  });

  it('strictness rule 3 (STREAK_MILESTONE_DECLARATION) references {YESTERDAY_SUMMARY} and its Streaks: line', () => {
    const idx = QUEST_GENERATION_PROMPT.indexOf('3. STREAK_MILESTONE_DECLARATION -');
    expect(idx).toBeGreaterThan(-1);
    const rest = QUEST_GENERATION_PROMPT.slice(idx, idx + 800);
    expect(rest).toContain('{YESTERDAY_SUMMARY}');
    expect(rest).toMatch(/Streaks:/);
  });

  // OUTPUT FORMAT JSON example must include the arc fields
  it('OUTPUT FORMAT JSON example includes arc_id + arc_step fields per quest', () => {
    const idx = QUEST_GENERATION_PROMPT.indexOf('# OUTPUT FORMAT');
    const rest = QUEST_GENERATION_PROMPT.slice(idx);
    expect(rest).toContain('"arc_id"');
    expect(rest).toContain('"arc_step"');
  });

  it('OUTPUT FORMAT documents proposed_arc top-level field with all sub-fields (prose contract)', () => {
    // Post-trim: the JSON example shows `"proposed_arc": null`. The full field
    // contract lives in the prose schema rules below the example.
    const idx = QUEST_GENERATION_PROMPT.indexOf('# OUTPUT FORMAT');
    const rest = QUEST_GENERATION_PROMPT.slice(idx);
    expect(rest).toContain('proposed_arc');
    expect(rest).toContain('total_steps');
    expect(rest).toContain('expected_days');
    expect(rest).toContain('step_criteria');
    expect(rest).toContain('total_xp_reward');
  });

  it('OUTPUT FORMAT documents the optional-fields contract below the JSON', () => {
    const idx = QUEST_GENERATION_PROMPT.indexOf('# OUTPUT FORMAT');
    const rest = QUEST_GENERATION_PROMPT.slice(idx);
    // Post-trim wording: "BOTH together (continuation ...) OR BOTH null"
    expect(rest).toMatch(/arc_id.*arc_step.*BOTH together.*OR BOTH null/s);
    expect(rest).toMatch(/proposed_arc.*SPARINGLY/s);
  });
});
