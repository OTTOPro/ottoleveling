import { z } from 'zod';
import { AutoCompleteRuleSchema } from './auto-complete';

const PillarId = z.enum(['body', 'mind', 'finance', 'projects']);
const Difficulty = z.enum(['trivial', 'easy', 'medium', 'hard', 'epic']);
const Schedule = z.enum(['daily', 'weekdays', 'weekly', 'custom']);

export const CreateTemplateSchema = z.object({
  pillar_id: PillarId,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  base_metric: z.string().min(1).max(100),
  starting_value: z.number().finite(),
  progression_rule: z.record(z.string(), z.unknown()).optional(),
  schedule: Schedule,
  schedule_config: z.record(z.string(), z.unknown()).optional().nullable(),
  base_xp: z.number().int().min(0).max(1000),
  difficulty: Difficulty,
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  auto_complete_rule: AutoCompleteRuleSchema.nullable().optional(),
});

export const UpdateTemplateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  pillar_id: PillarId.optional(),
  base_metric: z.string().min(1).max(100).optional(),
  current_value: z.number().finite().optional(),
  // starting_value intentionally omitted - immutable by design (the baseline never changes)
  progression_rule: z.record(z.string(), z.unknown()).optional(),
  schedule: Schedule.optional(),
  schedule_config: z.record(z.string(), z.unknown()).optional().nullable(),
  base_xp: z.number().int().min(0).max(1000).optional(),
  difficulty: Difficulty.optional(),
  active: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  auto_complete_rule: AutoCompleteRuleSchema.nullable().optional(),
});

export const TemplateIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type CreateTemplate = z.infer<typeof CreateTemplateSchema>;
export type UpdateTemplate = z.infer<typeof UpdateTemplateSchema>;
