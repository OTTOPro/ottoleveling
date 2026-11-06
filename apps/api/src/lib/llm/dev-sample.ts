import type { ChatMessage, CompletionOptions, LLMProvider } from './types';

/**
 * Offline provider for local development (LLM_PROVIDER=mock with
 * ENV=development). Returns a fixed, valid quest batch so a fresh clone shows
 * readable quests without any API key.
 *
 * It only covers daily quest generation. Report generation throws, which
 * sends reports down their deterministic fallback path, exactly as a real
 * LLM outage would.
 */
export const DEV_SAMPLE_GENERATION = {
  reasoning:
    'Sample batch (offline development provider). No focus set. Balanced distribution across the 4 pillars. Body quests respect the profile constraints: no loaded spinal flexion, no high-impact work.',
  focus_acknowledged: null,
  quests: [
    {
      pillar_id: 'body',
      title: 'Core stability circuit',
      description: 'Dead bugs, bird dogs, side planks. 3 rounds, slow tempo.',
      difficulty: 'medium',
      xp_value: 50,
      objective_link: null,
      template_link: null,
      arc_id: null,
      arc_step: null,
      metadata: { duration_minutes: 20 },
      stats: [{ type: 'STR', value: 1 }],
    },
    {
      pillar_id: 'body',
      title: 'Walk 8,000 steps',
      description: 'Split it: morning, lunch, evening.',
      difficulty: 'easy',
      xp_value: 30,
      objective_link: null,
      template_link: null,
      arc_id: null,
      arc_step: null,
      metadata: {},
      stats: [{ type: 'END', value: 1 }],
    },
    {
      pillar_id: 'mind',
      title: 'Read 20 pages',
      description: 'Current book. Note one idea worth keeping.',
      difficulty: 'easy',
      xp_value: 30,
      objective_link: null,
      template_link: null,
      arc_id: null,
      arc_step: null,
      metadata: {},
      stats: [{ type: 'INT', value: 1 }],
    },
    {
      pillar_id: 'finance',
      title: "Log yesterday's expenses",
      description: 'Every purchase, including cash. 10 minutes.',
      difficulty: 'easy',
      xp_value: 25,
      objective_link: null,
      template_link: null,
      arc_id: null,
      arc_step: null,
      metadata: {},
      stats: [{ type: 'CAP', value: 1 }],
    },
    {
      pillar_id: 'projects',
      title: 'Ship one small feature',
      description: '90 minutes. Merge it before stopping.',
      difficulty: 'medium',
      xp_value: 80,
      objective_link: null,
      template_link: null,
      arc_id: null,
      arc_step: null,
      metadata: {},
      stats: [{ type: 'CRAFT', value: 2 }],
    },
  ],
  proposed_arc: null,
};

export class DevSampleProvider implements LLMProvider {
  async complete(messages: ChatMessage[], _options?: CompletionOptions): Promise<string> {
    const system = messages.find((m) => m.role === 'system')?.content ?? '';
    if (system.includes('# REPORT ROLE')) {
      throw new Error('Offline development provider does not write reports');
    }
    return JSON.stringify(DEV_SAMPLE_GENERATION);
  }
}
