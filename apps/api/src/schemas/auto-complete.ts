import { z } from 'zod';
import type { AutoCompleteRule } from '../lib/auto-complete/types';

// Provider names match data-sources types.ProviderName.
const ProviderNameSchema = z.enum(['google_health', 'spotify']);

/**
 * AutoCompleteRule Zod schema. Used:
 *  1. POST/PATCH /api/templates - validates user-submitted rule payloads.
 *  2. lib/auto-complete/evaluate.ts - defensive re-parse on read in case a row
 *     was hand-edited or the schema evolves.
 *
 * .safeParse on both paths - caller decides how to handle failure (route
 * returns 400; evaluator logs + skips).
 */
export const AutoCompleteRuleSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('metric_threshold'),
    metric: z.string().min(1).max(64),
    source: ProviderNameSchema,
    threshold: z.number().finite(),
    comparison: z.enum(['>=', '>']).optional(),
  }),
  // Future variants land here.
]);

export type AutoCompleteRuleParsed = z.infer<typeof AutoCompleteRuleSchema>;

// Sanity check at compile time: the Zod-inferred type is assignable to the lib type.
const _typeCheck: AutoCompleteRule = {} as AutoCompleteRuleParsed;
void _typeCheck;
