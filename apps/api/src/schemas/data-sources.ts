import { z } from 'zod';

/**
 * Zod schemas for /api/data-sources/* routes.
 *
 * `ProviderParamSchema` lists every supported provider; adding a provider is a
 * one-line change to the enum.
 */
export const ProviderParamSchema = z.object({
  provider: z.enum(['google_health', 'spotify']),
});

export const SyncQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const CallbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export type ProviderParam = z.infer<typeof ProviderParamSchema>;
export type SyncQuery = z.infer<typeof SyncQuerySchema>;
export type CallbackQuery = z.infer<typeof CallbackQuerySchema>;
