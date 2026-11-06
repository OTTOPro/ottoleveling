import { z } from 'zod';

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const CreateCheckinSchema = z.object({
  date: DateString.optional(),
  energy_level: z.number().int().min(1).max(10).optional().nullable(),
  mood: z.string().max(50).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export type CreateCheckinInput = z.infer<typeof CreateCheckinSchema>;
