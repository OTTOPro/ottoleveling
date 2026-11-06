/**
 * Canonical LLM response fixture for integration tests. Matches the shape of
 * GenerationResponseSchema. Use via:
 *
 *   import { CANONICAL_FIXTURE } from '../fixtures/llm-fixture';
 *   MockProvider.setFixture(CANONICAL_FIXTURE);
 */

import type { GenerationResponse } from '../../src/schemas/llm-response';
import type { BilanResponse } from '../../src/schemas/bilan-response';

export const CANONICAL_RESPONSE: GenerationResponse = {
  reasoning:
    'Focus pillar body acknowledged. Generated 5 quests with ~60% body distribution: 3 body quests covering core stability (physical constraints respected: no loaded spinal flexion, no high-impact plyometrics), 1 mind quest for daily learning, 1 finance quest aligned with the emergency fund objective.',
  focus_acknowledged: 'body',
  quests: [
    {
      pillar_id: 'body',
      title: 'Core stability circuit (dead bugs, bird dogs, side planks)',
      description: '3 sets, 10 reps each side. Slow tempo, neutral spine.',
      difficulty: 'medium',
      xp_value: 50,
      objective_link: null,
      template_link: null,
      metadata: { physical_constraint_respected: true },
    },
    {
      pillar_id: 'body',
      title: 'Brisk walk 30 min',
      description: 'Low-impact cardio.',
      difficulty: 'easy',
      xp_value: 40,
      objective_link: null,
      template_link: null,
      metadata: null,
    },
    {
      pillar_id: 'body',
      title: 'Drink 2 liters of water',
      description: 'Spread across the day.',
      difficulty: 'easy',
      xp_value: 20,
      objective_link: null,
      template_link: null,
      metadata: null,
    },
    {
      pillar_id: 'mind',
      title: 'Learn one new technical concept',
      description: 'One concept, written down in three sentences.',
      difficulty: 'easy',
      xp_value: 25,
      objective_link: null,
      template_link: null,
      metadata: null,
    },
    {
      pillar_id: 'finance',
      title: 'Read 1 article on index funds',
      description: '15-30 min.',
      difficulty: 'easy',
      xp_value: 20,
      objective_link: null,
      template_link: null,
      metadata: null,
    },
  ],
};

export const CANONICAL_FIXTURE: string = JSON.stringify(CANONICAL_RESPONSE);

export const MALFORMED_FIXTURE: string = '{ "this is not valid": json';

export const CANONICAL_BILAN_RESPONSE: BilanResponse = {
  stats: {
    global: {
      total_xp: 840,
      total_quests: 22,
      completed: 18,
      failed: 3,
      skipped: 1,
      completion_rate: 0.818,
    },
    by_pillar: {
      body: { xp: 300, completed: 7, failed: 1, skipped: 0, rate: 0.875 },
      mind: { xp: 200, completed: 5, failed: 1, skipped: 0, rate: 0.833 },
      finance: { xp: 140, completed: 3, failed: 1, skipped: 1, rate: 0.6 },
      projects: { xp: 200, completed: 3, failed: 0, skipped: 0, rate: 1.0 },
    },
    streaks: {
      body: { current: 5, longest_in_period: 5 },
      mind: { current: 7, longest_in_period: 7 },
      finance: { current: 0, longest_in_period: 2 },
      projects: { current: 3, longest_in_period: 3 },
    },
    objectives_progress: [{ id: 1, title: 'Read 6 books', progress_pct: 0.33, delta_in_period: 1 }],
    patterns_detected: [
      { type: 'consistency_streak', description: 'Mind consistency 7 days', confidence: 0.5 },
    ],
  },
  narrative:
    '## Period state\nWeekly period closed. Performance trending up.\n\n## Performance per pillar\n- body: 7/8 (88%). Streak 5.\n- mind: 5/6 (83%). Streak 7.\n- finance: 3/5 (60%). Streak broken.\n- projects: 3/3 (100%). Streak 3.\n\n## Detected patterns\n- **Consistency**: Mind 7-day streak.\n\n## Critical failures\nNo critical failure detected.\n\n## Recommendations for next period\n- Maintain focus: body.\n- Increase template "Daily learning" baseline.',
  suggested_focus_next_period: 'body',
  suggested_template_adjustments: [
    { template_id: 1, action: 'increase', reason: 'Streak > 7 days with 100% success.' },
  ],
};

export const CANONICAL_BILAN_FIXTURE: string = JSON.stringify(CANONICAL_BILAN_RESPONSE);

export const MALFORMED_BILAN_FIXTURE: string = '{ "stats": "this is invalid';

export const CANONICAL_GENERATION_WITH_ARC_PROPOSAL_RESPONSE = {
  reasoning: 'Focus body. Streak strong. Initiating multi-day trial to harden discipline.',
  focus_acknowledged: 'body' as const,
  quests: [
    {
      pillar_id: 'body' as const,
      title: 'Hip stability circuit',
      difficulty: 'medium' as const,
      xp_value: 60,
    },
    {
      pillar_id: 'body' as const,
      title: 'Swim 25 min',
      difficulty: 'medium' as const,
      xp_value: 60,
    },
    {
      pillar_id: 'mind' as const,
      title: '30 min audiobook',
      difficulty: 'easy' as const,
      xp_value: 30,
    },
    {
      pillar_id: 'projects' as const,
      title: 'Recipe app: 60 min focused build',
      difficulty: 'medium' as const,
      xp_value: 80,
    },
  ],
  proposed_arc: {
    pillar_id: 'body' as const,
    title: 'Trial of Discipline',
    description: '7-day core stability cycle.',
    total_steps: 7,
    expected_days: 7,
    total_xp_reward: 500,
  },
};
export const CANONICAL_GENERATION_WITH_ARC_PROPOSAL_FIXTURE = JSON.stringify(
  CANONICAL_GENERATION_WITH_ARC_PROPOSAL_RESPONSE,
);

export const CANONICAL_GENERATION_WITH_ARC_CONTINUATION_RESPONSE = {
  reasoning: 'Arc 1 advanced to step 2 - five remain. Calibration upward.',
  focus_acknowledged: 'body' as const,
  quests: [
    {
      pillar_id: 'body' as const,
      title: 'Hip stability circuit (arc step)',
      difficulty: 'medium' as const,
      xp_value: 60,
      arc_id: 1,
      arc_step: 2,
    },
    {
      pillar_id: 'mind' as const,
      title: 'Read 1 chapter',
      difficulty: 'easy' as const,
      xp_value: 30,
    },
    {
      pillar_id: 'finance' as const,
      title: 'Review portfolio rebalance',
      difficulty: 'easy' as const,
      xp_value: 30,
    },
    {
      pillar_id: 'projects' as const,
      title: 'Recipe app: 45 min',
      difficulty: 'medium' as const,
      xp_value: 70,
    },
  ],
};
export const CANONICAL_GENERATION_WITH_ARC_CONTINUATION_FIXTURE = JSON.stringify(
  CANONICAL_GENERATION_WITH_ARC_CONTINUATION_RESPONSE,
);
