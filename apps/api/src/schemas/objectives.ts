import { z } from 'zod';

const PillarId = z.enum(['body', 'mind', 'finance', 'projects']);

export const CreateObjectiveSchema = z.object({
  pillar_id: PillarId,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
  target_metric: z.string().max(100).optional().nullable(),
  target_value: z.number().finite().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});
export type CreateObjective = z.infer<typeof CreateObjectiveSchema>;

export const ObjectiveQuerySchema = z.object({
  pillar_id: PillarId.optional(),
  status: z.enum(['active', 'completed', 'abandoned', 'paused']).optional(),
});
export type ObjectiveQuery = z.infer<typeof ObjectiveQuerySchema>;

// PATCH schema covering every editable column.
// Free transitions: any status → any status allowed.
export const UpdateObjectiveSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  pillar_id: PillarId.optional(),
  target_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
    .optional()
    .nullable(),
  status: z.enum(['active', 'completed', 'abandoned', 'paused']).optional(),
  success_criteria: z.string().max(2000).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});
export type UpdateObjective = z.infer<typeof UpdateObjectiveSchema>;
