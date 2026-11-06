import { z } from 'zod';

export const PeriodType = z.enum(['weekly', 'monthly', 'yearly']);

export const GenerateBilanBodySchema = z.object({
  period_type: PeriodType,
  period_start: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  period_end: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const ListBilansQuerySchema = z.object({
  period_type: PeriodType.optional(),
});

export const BilanIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type GenerateBilanInput = z.infer<typeof GenerateBilanBodySchema>;
