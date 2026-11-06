import { z } from 'zod';

const PillarId = z.enum(['body', 'mind', 'finance', 'projects']);

const PillarStats = z.object({
  xp: z.number(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  rate: z.number().min(0).max(1),
});

const StreakStats = z.object({
  current: z.number().int().nonnegative(),
  longest_in_period: z.number().int().nonnegative(),
});

export const BilanResponseSchema = z.object({
  stats: z.object({
    global: z.object({
      total_xp: z.number(),
      total_quests: z.number().int().nonnegative(),
      completed: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
      skipped: z.number().int().nonnegative(),
      completion_rate: z.number().min(0).max(1),
    }),
    by_pillar: z.record(PillarId, PillarStats),
    streaks: z.record(PillarId, StreakStats),
    objectives_progress: z.array(
      z.object({
        id: z.number().int().positive(),
        title: z.string(),
        progress_pct: z.number().min(0).max(1),
        delta_in_period: z.number(),
      }),
    ),
    patterns_detected: z.array(
      z.object({
        type: z.string(),
        description: z.string(),
        confidence: z.number().min(0).max(1),
      }),
    ),
  }),
  narrative: z.string().min(100).max(8000),
  suggested_focus_next_period: PillarId.nullable(),
  suggested_template_adjustments: z.array(
    z.object({
      template_id: z.number().int().positive(),
      action: z.enum(['increase', 'decrease', 'pause']),
      reason: z.string(),
    }),
  ),
});

export type BilanResponse = z.infer<typeof BilanResponseSchema>;
