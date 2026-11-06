import { z } from 'zod';

const PillarId = z.enum(['body', 'mind', 'finance', 'projects']);
const Difficulty = z.enum(['trivial', 'easy', 'medium', 'hard', 'epic']);

export const CreateManualQuestSchema = z.object({
  pillar_id: PillarId,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  difficulty: Difficulty,
  xp_value: z.number().int().min(0).max(1000),
  objective_id: z.number().int().positive().optional().nullable(),
  scheduled_for: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
    .optional()
    .describe('Defaults to today (UTC) if omitted.'),
});
export type CreateManualQuest = z.infer<typeof CreateManualQuestSchema>;

export const QuestIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
export type QuestIdParam = z.infer<typeof QuestIdParamSchema>;

export const CompleteQuestBodySchema = z
  .object({
    notes: z.string().max(2000).optional().nullable(),
  })
  .optional()
  .nullable();
export type CompleteQuestBody = z.infer<typeof CompleteQuestBodySchema>;
