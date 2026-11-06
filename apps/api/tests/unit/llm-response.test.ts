import { describe, it, expect } from 'vitest';
import { GenerationResponseSchema } from '../../src/schemas/llm-response';
import { CANONICAL_FIXTURE, CANONICAL_RESPONSE } from '../fixtures/llm-fixture';

const validQuest = {
  pillar_id: 'body',
  title: 't',
  difficulty: 'medium',
  xp_value: 50,
};

describe('GenerationResponseSchema - arc fields', () => {
  it('accepts a response with no proposed_arc and no arc-tagged quests', () => {
    const r = GenerationResponseSchema.parse({
      reasoning: 'baseline',
      focus_acknowledged: null,
      quests: [validQuest, validQuest, validQuest, validQuest],
    });
    expect(r.proposed_arc).toBeUndefined();
  });

  it('accepts a response with a valid proposed_arc', () => {
    const r = GenerationResponseSchema.parse({
      reasoning: 'arc time',
      focus_acknowledged: 'body',
      quests: [validQuest, validQuest, validQuest, validQuest],
      proposed_arc: {
        pillar_id: 'body',
        title: 'Trial',
        description: 'desc',
        total_steps: 7,
        expected_days: 7,
        total_xp_reward: 500,
      },
    });
    expect(r.proposed_arc).not.toBeNull();
  });

  it('rejects proposed_arc with step_criteria length mismatching total_steps', () => {
    expect(() =>
      GenerationResponseSchema.parse({
        reasoning: 'bad',
        focus_acknowledged: null,
        quests: [validQuest, validQuest, validQuest, validQuest],
        proposed_arc: {
          pillar_id: 'mind',
          title: 'Bad',
          description: 'desc',
          total_steps: 3,
          expected_days: 3,
          total_xp_reward: 300,
          step_criteria: ['only one'],
        },
      }),
    ).toThrow();
  });

  it('rejects proposed_arc with total_steps > 30', () => {
    expect(() =>
      GenerationResponseSchema.parse({
        reasoning: 'too long',
        focus_acknowledged: null,
        quests: [validQuest, validQuest, validQuest, validQuest],
        proposed_arc: {
          pillar_id: 'mind',
          title: 'Long',
          description: 'desc',
          total_steps: 100,
          expected_days: 30,
          total_xp_reward: 500,
        },
      }),
    ).toThrow();
  });

  it('accepts a quest tagged with valid arc_id + arc_step pair', () => {
    const r = GenerationResponseSchema.parse({
      reasoning: 'continuation',
      focus_acknowledged: 'body',
      quests: [{ ...validQuest, arc_id: 3, arc_step: 4 }, validQuest, validQuest, validQuest],
    });
    expect(r.quests[0]!.arc_id).toBe(3);
    expect(r.quests[0]!.arc_step).toBe(4);
  });

  it('rejects a quest with arc_id present but arc_step missing (refine fires)', () => {
    expect(() =>
      GenerationResponseSchema.parse({
        reasoning: 'half',
        focus_acknowledged: null,
        quests: [{ ...validQuest, arc_id: 3 }, validQuest, validQuest, validQuest],
      }),
    ).toThrow();
  });
});

describe('Optional stats field on GeneratedQuestSchema', () => {
  it('CANONICAL_FIXTURE validates without stats field (backwards compat)', () => {
    const parsed = GenerationResponseSchema.safeParse(JSON.parse(CANONICAL_FIXTURE));
    expect(parsed.success).toBe(true);
  });

  it('quest with full stats array (all 7 LLM types, values 1-3) validates', () => {
    const llmTypes = ['END', 'STR', 'FLEX', 'INT', 'WIS', 'CAP', 'CRAFT'] as const;
    const fixture = {
      ...CANONICAL_RESPONSE,
      quests: CANONICAL_RESPONSE.quests.map((q, i) => ({
        ...q,
        stats: [{ type: llmTypes[i % llmTypes.length], value: (i % 3) + 1 }],
      })),
    };
    const parsed = GenerationResponseSchema.safeParse(fixture);
    expect(parsed.success).toBe(true);
  });

  it('quest with FOCUS in stats array FAILS validation (FOCUS is system-awarded only)', () => {
    const fixture = {
      ...CANONICAL_RESPONSE,
      quests: CANONICAL_RESPONSE.quests.map((q, idx) =>
        idx === 0 ? { ...q, stats: [{ type: 'FOCUS', value: 1 }] } : q,
      ),
    };
    const parsed = GenerationResponseSchema.safeParse(fixture);
    // Zod rejects FOCUS because it's not in the enum ['END','STR','FLEX','INT','WIS','CAP','CRAFT'].
    // The error path points to quests[0].stats[0].type.
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.includes('stats'))).toBe(true);
    }
  });
});
