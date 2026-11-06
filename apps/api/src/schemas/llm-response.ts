import { z } from 'zod';

const PillarId = z.enum(['body', 'mind', 'finance', 'projects']);
const Difficulty = z.enum(['trivial', 'easy', 'medium', 'hard', 'epic']);

/**
 * Stat reward emitted per quest by the LLM.
 * FOCUS is excluded here - it is system-awarded only (see maybeAwardFocus in lib/stat-rewards.ts).
 */
export const StatRewardSchema = z.object({
  type: z.enum(['END', 'STR', 'FLEX', 'INT', 'WIS', 'CAP', 'CRAFT']),
  value: z.number().int().min(1).max(3),
});

export type StatReward = z.infer<typeof StatRewardSchema>;

export const GeneratedQuestSchema = z
  .object({
    pillar_id: PillarId,
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional().nullable(),
    difficulty: Difficulty,
    xp_value: z.number().int().min(10).max(400),
    objective_link: z.number().int().positive().nullable().optional(),
    template_link: z.number().int().positive().nullable().optional(),
    arc_id: z.number().int().positive().nullable().optional(),
    arc_step: z.number().int().positive().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional().nullable(),
    /**
     * Optional stat rewards for this quest. 1-3 entries, 7 LLM-emittable types.
     * FOCUS is excluded - system-awarded at recordCompletion when 3+ pillars are touched.
     * Backwards-compatible: undefined means no stat rewards recorded at completion.
     */
    stats: z.array(StatRewardSchema).min(1).max(3).optional(),
  })
  .refine((q) => (q.arc_id == null) === (q.arc_step == null), {
    message: 'arc_id and arc_step must both be present or both absent',
    path: ['arc_step'],
  });

export const ProposedArcSchema = z
  .object({
    pillar_id: PillarId,
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(2000),
    total_steps: z.number().int().min(3).max(30),
    expected_days: z.number().int().min(3).max(30),
    total_xp_reward: z.number().int().min(100).max(2000),
    step_criteria: z.array(z.string().max(500)).optional(),
  })
  .refine((a) => !a.step_criteria || a.step_criteria.length === a.total_steps, {
    message: 'step_criteria length must equal total_steps',
    path: ['step_criteria'],
  });

export const GenerationResponseSchema = z.object({
  reasoning: z.string().max(2000),
  focus_acknowledged: PillarId.nullable(),
  quests: z.array(GeneratedQuestSchema).min(4).max(7),
  proposed_arc: ProposedArcSchema.optional().nullable(),
});

export type GeneratedQuest = z.infer<typeof GeneratedQuestSchema>;
export type GenerationResponse = z.infer<typeof GenerationResponseSchema>;
export type ProposedArcInput = z.infer<typeof ProposedArcSchema>;
