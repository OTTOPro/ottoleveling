import { describe, it, expect, vi } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { MockProvider } from '../../src/lib/llm/mock';
import type { GenerationResponse } from '../../src/schemas/llm-response';

const TOKEN = 'integration-test-token-deadbeef';

function authed(path: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers);
  headers.set('x-dev-token', TOKEN);
  if (init?.body) headers.set('content-type', 'application/json');
  return new Request(`http://localhost${path}`, { ...init, headers });
}

// Three forbidden quests: one from the player profile (heavy deadlifts), one
// from a seeded template contraindication (high_impact_plyo on "Core stability
// session"), one from the profile's "(no crypto)" aside. Plus two clean ones.
const FAULTY_RESPONSE: GenerationResponse = {
  reasoning: 'Strength block assigned.',
  focus_acknowledged: null,
  quests: [
    {
      pillar_id: 'body',
      title: 'Heavy deadlifts 5x5',
      description: 'Work up to a heavy top set.',
      difficulty: 'hard',
      xp_value: 80,
      objective_link: null,
      template_link: null,
      metadata: {},
    },
    {
      pillar_id: 'body',
      title: 'Box jump series',
      description: 'High-impact plyo drills, 4 rounds.',
      difficulty: 'medium',
      xp_value: 50,
      objective_link: null,
      template_link: null,
      metadata: {},
    },
    {
      pillar_id: 'finance',
      title: 'Research a crypto exchange',
      description: 'Compare fees.',
      difficulty: 'easy',
      xp_value: 25,
      objective_link: null,
      template_link: null,
      metadata: {},
    },
    {
      pillar_id: 'mind',
      title: 'Read 20 pages',
      description: 'Any book on the list.',
      difficulty: 'easy',
      xp_value: 25,
      objective_link: null,
      template_link: null,
      metadata: {},
    },
    {
      pillar_id: 'projects',
      title: 'Write the search endpoint',
      description: '60 minutes.',
      difficulty: 'medium',
      xp_value: 60,
      objective_link: null,
      template_link: null,
      metadata: {},
    },
  ],
};

describe('post-generation validator', () => {
  it('never writes a forbidden LLM quest to D1 and replaces it with the inert fallback', async () => {
    MockProvider.setFixture(JSON.stringify(FAULTY_RESPONSE));
    const warn = vi.spyOn(console, 'warn');

    const res = await SELF.fetch(authed('/api/quests/generate', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      source: string;
      quests: Array<{ title: string; pillar_id: string }>;
    };
    expect(body.source).toBe('llm');

    const today = new Date().toISOString().slice(0, 10);
    const { results } = await env.DB.prepare(
      `SELECT pillar_id, title, description FROM quests WHERE scheduled_for = ? ORDER BY id`,
    )
      .bind(today)
      .all<{ pillar_id: string; title: string; description: string | null }>();

    const text = results.map((q) => `${q.title} ${q.description ?? ''}`.toLowerCase()).join('\n');
    expect(text).not.toContain('deadlift');
    expect(text).not.toContain('plyometric');
    expect(text).not.toContain('crypto');

    // Both body rejections collapse into one inert body quest; finance gets its own.
    expect(results.map((q) => q.title)).toEqual([
      'Log how your body feels today',
      "Review yesterday's expenses",
      'Read 20 pages',
      'Write the search endpoint',
    ]);

    const logged = warn.mock.calls.find(
      (c) => c[0] === '[quest-validator] rejected generated quests',
    );
    expect(logged).toBeDefined();
    const payload = JSON.parse(String(logged![1])) as {
      rejected: Array<{ pattern: string; source: string }>;
    };
    expect(payload.rejected.map((r) => [r.pattern, r.source])).toEqual([
      ['heavy deadlifts', 'profile'],
      ['high impact plyo', 'template'],
      ['crypto', 'profile'],
    ]);
    warn.mockRestore();
  });

  it('leaves a clean LLM batch untouched', async () => {
    const base = FAULTY_RESPONSE.quests[3]!;
    const clean: GenerationResponse = {
      ...FAULTY_RESPONSE,
      quests: [
        {
          ...base,
          pillar_id: 'body',
          title: 'Core stability circuit',
          description: 'Dead bugs, side planks.',
        },
        {
          ...base,
          pillar_id: 'finance',
          title: 'Weekly budget review',
          description: '15 minutes.',
        },
        ...FAULTY_RESPONSE.quests.slice(3),
      ],
    };
    MockProvider.setFixture(JSON.stringify(clean));

    // regenerate: the first test already generated today's batch, and generate is idempotent per date.
    const res = await SELF.fetch(authed('/api/quests/regenerate', { method: 'POST', body: '{}' }));
    const body = (await res.json()) as { quests: Array<{ title: string }> };
    expect(body.quests.map((q) => q.title)).toEqual([
      'Core stability circuit',
      'Weekly budget review',
      'Read 20 pages',
      'Write the search endpoint',
    ]);
  });
});
