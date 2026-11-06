import { describe, it, expect } from 'vitest';
import { QUEST_GENERATION_PROMPT, renderPrompt } from '../../src/lib/llm/prompts';

const STRICTNESS_LABELS = [
  'SUCCESS_DAY_CALIBRATION',
  'REGRESSION_DAY_RECOVERY',
  'STREAK_MILESTONE_DECLARATION',
  'RANK_TRANSITION_DECLARATION',
  'LIFETIME_PROXIMITY_FLAG',
  'ACHIEVEMENT_ACKNOWLEDGMENT',
  'PODCAST_LISTENING_SEMANTICS',
  'PHYSIOLOGICAL_CALIBRATION',
  'READING_DRIFT_ACKNOWLEDGMENT',
  'READING_ENGAGEMENT_DEFERENCE',
  'DAY_JOB_OUT_OF_SCOPE',
] as const;

/**
 * Renders the prompt with all 20 placeholders filled with stub values so any
 * unrendered {KEY} placeholder would be visible as a leftover brace pair.
 * The strictness assertions then run against the rendered output.
 */
function renderWithStubs(): string {
  return renderPrompt(QUEST_GENERATION_PROMPT, {
    PLAYER_NAME: 'Player',
    PLAYER_PROFILE: 'stub',
    DAY_JOB_EXCLUSIONS: '- employer client work',
    CURRENT_DATE: '2026-05-29',
    DAY_OF_WEEK: 'Friday',
    CURRENT_FOCUS: 'None',
    ACTIVE_OBJECTIVES: 'None.',
    PILLAR_LEVELS: 'None.',
    STREAKS: 'None.',
    RECENT_PERFORMANCE: 'None.',
    DETECTED_PATTERNS: 'None detected yet.',
    LAST_CHECKIN: 'None.',
    ACTIVE_TEMPLATES: 'None active for today.',
    LIFETIME_SNAPSHOT: 'None.',
    CURRENT_TITLES: 'None.',
    RECENT_ACHIEVEMENTS: 'None yet.',
    ACTIVE_ARCS: 'None active.',
    ACTIVE_PROJECTS: '(no active personal projects)',
    OBJECTIVE_METRICS: 'No objective metrics connected.',
    CURRENT_LISTENING: '(no podcast/audiobook library activity today)',
    YESTERDAY_SUMMARY:
      'YESTERDAY (2026-05-28):\n- Body 0/0, Mind 0/0, Finance 0/0, Projects 0/0\n- Check-in pain: (no check-in yesterday)\n- Streaks: body-streak 0d BROKEN, mind-streak 0d BROKEN, finance-streak 0d BROKEN, projects-streak 0d BROKEN, global-streak 0d BROKEN',
    CALIBRATION_SIGNALS:
      '## Calibration signals (derived)\n- HRV: stable (recent 50ms vs baseline 50ms, +0% delta)\n- Sleep: NONE\n- Reading: normal (3 episode saves last 7d after filter)',
  });
}

describe('## STRICTNESS RULES section', () => {
  it('## STRICTNESS RULES section header is present in the rendered prompt', () => {
    const rendered = renderWithStubs();
    expect(rendered).toMatch(/^## STRICTNESS RULES$/m);
  });

  it.each(STRICTNESS_LABELS)('rule label "%s" is present in the rendered prompt', (label) => {
    const rendered = renderWithStubs();
    expect(rendered).toContain(label);
  });

  it('## STRICTNESS RULES sits AFTER # GENERATION RULES and BEFORE # OUTPUT FORMAT', () => {
    const rendered = renderWithStubs();
    const generationRulesIdx = rendered.indexOf('# GENERATION RULES');
    const strictnessIdx = rendered.indexOf('## STRICTNESS RULES');
    const outputFormatIdx = rendered.indexOf('# OUTPUT FORMAT');
    expect(generationRulesIdx).toBeGreaterThan(-1);
    expect(strictnessIdx).toBeGreaterThan(generationRulesIdx);
    expect(outputFormatIdx).toBeGreaterThan(strictnessIdx);
  });

  it('all 11 strictness labels are unique (no accidental duplication) - em-dash form', () => {
    const rendered = renderWithStubs();
    // Extract only the strictness section so we don't count rule 15's
    // ACHIEVEMENT_ACKNOWLEDGMENT_BASE reference, rule 13's LIFETIME PROXIMITY,
    // or the precedence hierarchy block's bare "1. PHYSIOLOGICAL_CALIBRATION" entries.
    const start = rendered.indexOf('## STRICTNESS RULES');
    const end = rendered.indexOf('# OUTPUT FORMAT');
    const section = rendered.slice(start, end);
    for (const label of STRICTNESS_LABELS) {
      // Each label should appear EXACTLY ONCE as a rule DEFINITION - identified by
      // the em-dash pattern "N. LABEL -". The hierarchy block uses bare "N. LABEL"
      // without an em-dash, so it won't match here.
      const ruleLineMatches = section.match(new RegExp(`^\\d+\\.\\s+${label}\\s+-`, 'gm')) ?? [];
      expect(
        ruleLineMatches,
        `label ${label} should appear exactly once as a rule definition`,
      ).toHaveLength(1);
    }
  });

  it('strictness rules are numbered 1-11 inside their section', () => {
    const rendered = renderWithStubs();
    const start = rendered.indexOf('## STRICTNESS RULES');
    const end = rendered.indexOf('# OUTPUT FORMAT');
    const section = rendered.slice(start, end);
    for (let i = 1; i <= 11; i++) {
      const re = new RegExp(`^${i}\\.\\s+\\w+`, 'm');
      expect(section).toMatch(re);
    }
  });

  it('rule 7 (PODCAST_LISTENING_SEMANTICS) body includes show filter note (explicitly excluded)', () => {
    const rendered = renderWithStubs();
    const start = rendered.indexOf('7. PODCAST_LISTENING_SEMANTICS');
    expect(start).toBeGreaterThan(-1);
    // Extract until the next rule definition (8. PHYSIOLOGICAL_CALIBRATION)
    const nextRule = rendered.indexOf('\n8.', start);
    const body = rendered.slice(start, nextRule > -1 ? nextRule : start + 2000);
    expect(body.toLowerCase()).toContain('explicitly excluded');
  });

  it('rule 5 (LIFETIME_PROXIMITY_FLAG) inlines all three cases (approach / match / surpass) per Verification 7d-1', () => {
    const rendered = renderWithStubs();
    const start = rendered.indexOf('5. LIFETIME_PROXIMITY_FLAG');
    expect(start).toBeGreaterThan(-1);
    // Extract the rule body - bounded by the start and the next numbered rule (6.).
    const next = rendered.indexOf('\n6.', start);
    const body = rendered.slice(start, next > -1 ? next : start + 2000);
    expect(body.toLowerCase()).toContain('approach');
    expect(body.toLowerCase()).toContain('match');
    expect(body.toLowerCase()).toContain('surpass');
  });

  it('rule 8 (PHYSIOLOGICAL_CALIBRATION) body includes HRV, sleep and Tier 1 reference', () => {
    const rendered = renderWithStubs();
    // The Tier 1 hierarchy listing `8. PHYSIOLOGICAL_CALIBRATION` shadows the
    // first occurrence - the rule BODY anchor uses the em-dash form which the
    // hierarchy listing does not have.
    const start = rendered.indexOf('8. PHYSIOLOGICAL_CALIBRATION -');
    expect(start).toBeGreaterThan(-1);
    const next = rendered.indexOf('\n9.', start);
    const body = rendered.slice(start, next > -1 ? next : start + 2000);
    expect(body.toLowerCase()).toContain('hrv');
    expect(body.toLowerCase()).toContain('sleep');
    expect(body).toContain('Tier 1');
  });

  it('rule 9 (READING_DRIFT_ACKNOWLEDGMENT) body includes drought acknowledgment requirement', () => {
    const rendered = renderWithStubs();
    const start = rendered.indexOf('9. READING_DRIFT_ACKNOWLEDGMENT');
    expect(start).toBeGreaterThan(-1);
    const next = rendered.indexOf('\n10.', start);
    const body = rendered.slice(start, next > -1 ? next : start + 2000);
    expect(body.toLowerCase()).toContain('drought');
    expect(body.toLowerCase()).toContain('reasoning');
  });

  it('rule 10 (READING_ENGAGEMENT_DEFERENCE) body includes "MAY" and soft-rule description', () => {
    const rendered = renderWithStubs();
    const start = rendered.indexOf('10. READING_ENGAGEMENT_DEFERENCE');
    expect(start).toBeGreaterThan(-1);
    // Bounded by next H1 section (# ARC SEMANTICS)
    const next = rendered.indexOf('\n# ', start);
    const body = rendered.slice(start, next > -1 ? next : start + 2000);
    expect(body).toContain('MAY');
    expect(body.toLowerCase()).toContain('soft rule');
  });

  // Prose count phrase must match structural label count
  it('the prose count phrase matches the structural label count (currently 11)', () => {
    const match = QUEST_GENERATION_PROMPT.match(/The following (\d+) rules are MUSTs/);
    expect(match).not.toBeNull();
    const proseCount = parseInt(match![1]!, 10);

    // Count actual rule labels in the ## STRICTNESS RULES section (bounded by next H1)
    const sectionStart = QUEST_GENERATION_PROMPT.indexOf('## STRICTNESS RULES');
    const sectionEnd = QUEST_GENERATION_PROMPT.indexOf('\n# ', sectionStart + 1);
    const section = QUEST_GENERATION_PROMPT.slice(
      sectionStart,
      sectionEnd > -1 ? sectionEnd : sectionStart + 8000,
    );
    // Labels in the strictness section are formatted: "N. LABEL - body..."
    // Using em-dash pattern to exclude the hierarchy block's bare "N. LABEL" entries.
    const labelMatches = section.match(/^\d+\.\s+[A-Z][A-Z_]+\s+-/gm) ?? [];
    expect(proseCount).toBe(labelMatches.length);
    expect(proseCount).toBe(11);
  });
});

describe('DAY_JOB_OUT_OF_SCOPE strictness rule', () => {
  it('rule 11 DAY_JOB_OUT_OF_SCOPE is present in the rendered prompt', () => {
    const rendered = renderWithStubs();
    expect(rendered).toContain('11. DAY_JOB_OUT_OF_SCOPE');
  });

  it('rule 11 renders the configured exclusion list', () => {
    const rendered = renderWithStubs();
    const start = rendered.indexOf('11. DAY_JOB_OUT_OF_SCOPE -');
    expect(start).toBeGreaterThan(-1);
    expect(rendered.slice(start, start + 600)).toContain('- employer client work');
  });

  it('Tier 1 - Safety hierarchy block lists DAY_JOB_OUT_OF_SCOPE', () => {
    const rendered = renderWithStubs();
    const tier1Idx = rendered.indexOf('Tier 1 - Safety');
    expect(tier1Idx).toBeGreaterThan(-1);
    const tier2Idx = rendered.indexOf('Tier 2 -', tier1Idx);
    const tier1Block = rendered.slice(tier1Idx, tier2Idx);
    expect(tier1Block).toContain('DAY_JOB_OUT_OF_SCOPE');
  });

  it('prose count matches the 11 strictness rules', () => {
    const match = QUEST_GENERATION_PROMPT.match(/The following (\d+) rules are MUSTs/);
    expect(match).not.toBeNull();
    const proseCount = parseInt(match![1]!, 10);
    expect(proseCount).toBe(11);
  });

  it('rule 11 body forbids inventing day-job quests even when ACTIVE_PROJECTS is empty', () => {
    // The raw template still holds the placeholders; rendering would replace them.
    const start = QUEST_GENERATION_PROMPT.indexOf('11. DAY_JOB_OUT_OF_SCOPE -');
    expect(start).toBeGreaterThan(-1);
    const next = QUEST_GENERATION_PROMPT.indexOf('\n# ', start);
    const body = QUEST_GENERATION_PROMPT.slice(start, next > -1 ? next : start + 2000);
    expect(body).toMatch(/NEVER generate/i);
    expect(body).toContain('{DAY_JOB_EXCLUSIONS}');
    expect(body).toContain('{ACTIVE_PROJECTS}');
  });
});

describe('Rule precedence hierarchy', () => {
  it('the ### Rule precedence hierarchy block exists between count sentence and rule 1', () => {
    const rendered = renderWithStubs();
    const countIdx = rendered.indexOf('The following 11 rules are MUSTs');
    const hierarchyIdx = rendered.indexOf('### Rule precedence hierarchy');
    const rule1Idx = rendered.indexOf('1. SUCCESS_DAY_CALIBRATION');
    expect(countIdx).toBeGreaterThan(-1);
    expect(hierarchyIdx).toBeGreaterThan(countIdx);
    expect(rule1Idx).toBeGreaterThan(hierarchyIdx);
  });

  it('Tier 1 block names PHYSIOLOGICAL_CALIBRATION + PODCAST_LISTENING_SEMANTICS', () => {
    const rendered = renderWithStubs();
    const tier1Idx = rendered.indexOf('Tier 1 - Safety');
    expect(tier1Idx).toBeGreaterThan(-1);
    const tier2Idx = rendered.indexOf('Tier 2 -', tier1Idx);
    const tier1Block = rendered.slice(tier1Idx, tier2Idx);
    expect(tier1Block).toContain('PHYSIOLOGICAL_CALIBRATION');
    expect(tier1Block).toContain('PODCAST_LISTENING_SEMANTICS');
  });

  it('each of 4 tier headers appears exactly once', () => {
    const rendered = renderWithStubs();
    for (const header of [
      'Tier 1 - Safety',
      'Tier 2 - Calibration',
      'Tier 3 - Generation hygiene',
      'Tier 4 - Output coherence',
    ]) {
      const matches = rendered.match(new RegExp(header.replace(/\s+/g, '\\s+'), 'g')) ?? [];
      expect(matches.length, `header "${header}" should appear exactly once`).toBe(1);
    }
  });

  it('precedence-override directive appears (cite override in reasoning)', () => {
    const rendered = renderWithStubs();
    expect(rendered).toContain('higher-tier rule conflicts');
    expect(rendered).toContain('Tier 1 wins');
  });
});

describe('Prompt internal consistency', () => {
  it('pillar definition names no specific project and points at the day-job rule', () => {
    const pillarsIdx = QUEST_GENERATION_PROMPT.indexOf('# THE 4 PILLARS');
    expect(pillarsIdx).toBeGreaterThan(-1);
    const nextSectionIdx = QUEST_GENERATION_PROMPT.indexOf('\n# ', pillarsIdx + 1);
    const section = QUEST_GENERATION_PROMPT.slice(pillarsIdx, nextSectionIdx);
    const projectsLineMatch = section.match(/projects\s*:\s*[^\n]+/);
    expect(projectsLineMatch).not.toBeNull();
    const projectsLine = projectsLineMatch![0];
    expect(projectsLine).not.toMatch(/e\.g\./i);
    expect(projectsLine).toContain('{ACTIVE_PROJECTS}');
    expect(projectsLine).toContain('DAY_JOB_OUT_OF_SCOPE');
  });

  it('output format JSON example quest titles are generic', () => {
    const outputIdx = QUEST_GENERATION_PROMPT.indexOf('# OUTPUT FORMAT');
    expect(outputIdx).toBeGreaterThan(-1);
    const block = QUEST_GENERATION_PROMPT.slice(outputIdx);
    const titleMatches = block.match(/"title":\s*"([^"]+)"/g) ?? [];
    expect(titleMatches.length).toBeGreaterThan(0);
    for (const t of titleMatches) {
      expect(t, `example title should not name a project: ${t}`).not.toMatch(/project|app\b/i);
    }
  });

  it('Tier 1 lists PHYSIOLOGICAL_CALIBRATION as rule 8 (not rule 1)', () => {
    const rendered = renderWithStubs();
    const tier1Idx = rendered.indexOf('Tier 1 - Safety');
    expect(tier1Idx).toBeGreaterThan(-1);
    const tier2Idx = rendered.indexOf('Tier 2 -', tier1Idx);
    const tier1Block = rendered.slice(tier1Idx, tier2Idx);
    expect(tier1Block).toMatch(/8\.\s+PHYSIOLOGICAL_CALIBRATION/);
    expect(tier1Block).not.toMatch(/^\s*1\.\s+PHYSIOLOGICAL_CALIBRATION/m);
  });

  it('# GENERATION RULES does not duplicate strictness rules 4/5/6', () => {
    const genIdx = QUEST_GENERATION_PROMPT.indexOf('# GENERATION RULES');
    const strictIdx = QUEST_GENERATION_PROMPT.indexOf('## STRICTNESS RULES');
    expect(genIdx).toBeGreaterThan(-1);
    expect(strictIdx).toBeGreaterThan(genIdx);
    const genSection = QUEST_GENERATION_PROMPT.slice(genIdx, strictIdx);
    expect(genSection).not.toContain('ACHIEVEMENT_ACKNOWLEDGMENT_BASE');
    expect(genSection).not.toContain('RANK TRANSITION DECLARATION');
    expect(genSection).not.toMatch(/^\s*13\.\s+LIFETIME\s+PROXIMITY/im);
    // Generation rule count should now max at 12 (rules 13/14/15 dropped)
    const ruleNumbers = (genSection.match(/^\s*(\d+)\.\s+[A-Z]/gm) ?? []).map((m) =>
      parseInt(m.trim().match(/^(\d+)/)![1]!, 10),
    );
    if (ruleNumbers.length > 0) {
      expect(Math.max(...ruleNumbers)).toBeLessThanOrEqual(12);
    }
  });

  it('reasoning schema permits 6-8 sentences when 3+ rules fire', () => {
    // Post-trim wording: "3-5 sentences typical; expand to 6-8 when 3+
    // strictness rules fire. EVERY tier-1 rule that fires gets its own sentence."
    expect(QUEST_GENERATION_PROMPT).toMatch(/expand to 6-8.*when 3\+ (strictness )?rules fire/i);
    expect(QUEST_GENERATION_PROMPT).toMatch(
      /EVERY tier-1 rule that fires (MUST get|gets) its own sentence/i,
    );
  });

  it('# OBJECTIVE PHASE AWARENESS section exists between ARC SEMANTICS and OUTPUT FORMAT', () => {
    const arcIdx = QUEST_GENERATION_PROMPT.indexOf('# ARC SEMANTICS');
    const phaseIdx = QUEST_GENERATION_PROMPT.indexOf('# OBJECTIVE PHASE AWARENESS');
    const outputIdx = QUEST_GENERATION_PROMPT.indexOf('# OUTPUT FORMAT');
    expect(arcIdx).toBeGreaterThan(-1);
    expect(phaseIdx).toBeGreaterThan(arcIdx);
    expect(outputIdx).toBeGreaterThan(phaseIdx);
    const phaseSection = QUEST_GENERATION_PROMPT.slice(phaseIdx, outputIdx);
    expect(phaseSection.toLowerCase()).toContain('phase x of y');
    expect(phaseSection).toContain('Decision tree');
    expect(phaseSection.toLowerCase()).toContain('short intervals');
  });
});
