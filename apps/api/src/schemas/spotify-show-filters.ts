import { z } from 'zod';

/**
 * PATCH body schema for /api/sources/spotify/filters/:uri.
 * At least one field required (.refine guard).
 * contributes_to_pillar is currently read-only (the route rejects non-'mind'
 * values); it is included here so per-show pillar mapping can be enabled later.
 */
export const SpotifyShowFilterPatchSchema = z
  .object({
    include_in_mind_learning: z.boolean().optional(),
    contributes_to_pillar: z.enum(['body', 'mind', 'finance', 'projects']).optional(),
  })
  .refine((d) => Object.keys(d).some((k) => d[k as keyof typeof d] !== undefined), {
    message: 'At least one field required',
  });

export type SpotifyShowFilterPatch = z.infer<typeof SpotifyShowFilterPatchSchema>;
