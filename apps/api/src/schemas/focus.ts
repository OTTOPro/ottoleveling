import { z } from 'zod';

const PillarId = z.enum(['body', 'mind', 'finance', 'projects']);
const Horizon = z.enum(['weekly', 'monthly', 'sprint']);

export const SetFocusSchema = z.object({
  pillar_id: PillarId,
  horizon: Horizon,
});
export type SetFocus = z.infer<typeof SetFocusSchema>;
