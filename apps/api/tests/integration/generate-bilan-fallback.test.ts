import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { MockProvider } from '../../src/lib/llm/mock';
import { MALFORMED_BILAN_FIXTURE } from '../fixtures/llm-fixture';

const getAgent = () => env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));

describe('SystemAgent.generateBilan - fallback', () => {
  it('synthesizes a markdown narrative when LLM response is malformed', async () => {
    MockProvider.setFixture(MALFORMED_BILAN_FIXTURE);
    const agent = getAgent();
    const result = await agent.generateBilan('weekly', '2026-05-18', '2026-05-24');

    expect(result.source).toBe('fallback');
    // Distinct "## Report state" header signals degraded mode (not "## Period state").
    expect(result.narrative).toContain('## Report state');
    expect(result.narrative).toContain('## Performance per pillar');
    expect(result.narrative.toLowerCase()).toContain('degraded');
    // Recommendations section must also flag degradation, not silently omit.
    expect(result.narrative).toContain('## Recommendations for next period');
    expect(result.narrative.toLowerCase()).toContain('generation degraded');

    // Row was inserted.
    const row = await env.DB.prepare(`SELECT id FROM bilans WHERE id = ?`).bind(result.id).first();
    expect(row).not.toBeNull();
  });
});
