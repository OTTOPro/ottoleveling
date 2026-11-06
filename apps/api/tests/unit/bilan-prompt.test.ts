import { describe, it, expect } from 'vitest';
import { BILAN_PROMPT, renderPrompt } from '../../src/lib/llm/prompts';

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

describe('BILAN_PROMPT', () => {
  it('contains all 14 required placeholders', () => {
    for (const key of REQUIRED_KEYS) {
      expect(BILAN_PROMPT).toContain(`{${key}}`);
    }
  });

  it('{PERFORMANCE_VS_PHYSIOLOGY} sits between CURRENT_PATTERNS and PREVIOUS_BILAN', () => {
    const cpIdx = BILAN_PROMPT.indexOf('{CURRENT_PATTERNS}');
    const pvpIdx = BILAN_PROMPT.indexOf('{PERFORMANCE_VS_PHYSIOLOGY}');
    const pbIdx = BILAN_PROMPT.indexOf('{PREVIOUS_BILAN}');
    expect(cpIdx).toBeGreaterThan(-1);
    expect(pvpIdx).toBeGreaterThan(cpIdx);
    expect(pbIdx).toBeGreaterThan(pvpIdx);
  });

  it('mentions strict voice prohibitions (no emojis, no preamble)', () => {
    expect(BILAN_PROMPT.toLowerCase()).toContain('emoji');
    expect(BILAN_PROMPT.toLowerCase()).toContain('preamble');
  });

  it('renderPrompt substitutes BILAN placeholders', () => {
    const rendered = renderPrompt(BILAN_PROMPT, {
      PLAYER_NAME: 'Player',
      PLAYER_PROFILE: 'TEST_PROFILE',
      PERIOD_TYPE: 'weekly',
      PERIOD_START: '2026-05-18',
      PERIOD_END: '2026-05-24',
      PERIOD_DAYS: '7',
      GLOBAL_STATS: 'stats here',
      PILLAR_STATS: 'pillar stats here',
      FOCUS_HISTORY: 'focus history',
      OBJECTIVES_PROGRESS: 'obj progress',
      TEMPLATES_PROGRESS: 'tpl progress',
      CHECKINS_SUMMARY: 'checkins',
      CURRENT_PATTERNS: 'patterns',
      PERFORMANCE_VS_PHYSIOLOGY: '(insufficient calibration data - no recovery analysis possible)',
      PREVIOUS_BILAN: 'previous bilan',
    });
    expect(rendered).toContain('TEST_PROFILE');
    expect(rendered).toContain('weekly');
    expect(rendered).not.toContain('{PLAYER_PROFILE}');
    expect(rendered).not.toContain('{PILLAR_STATS}');
    expect(rendered).not.toContain('{PERFORMANCE_VS_PHYSIOLOGY}');
  });
});
