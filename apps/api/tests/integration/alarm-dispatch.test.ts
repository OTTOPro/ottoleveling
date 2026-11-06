import { describe, it, expect } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import { MockProvider } from '../../src/lib/llm/mock';
import { CANONICAL_BILAN_FIXTURE, CANONICAL_FIXTURE } from '../fixtures/llm-fixture';

const stubFn = () => env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));

describe('SystemAgent.alarm - dispatch', () => {
  it('fires weekly_bilan and creates a bilan row', async () => {
    MockProvider.setFixture(CANONICAL_BILAN_FIXTURE);

    const stub = stubFn();
    // Inject a single past-due weekly_bilan event into DO state.
    await runInDurableObject(stub, async (_inst, ctx) => {
      const state = {
        context: { userBio: '', activePillars: ['body', 'mind', 'finance', 'projects'] },
        currentFocus: null,
        patterns: [],
        streaks: {
          body: { current: 0, longest: 0, lastSuccessDate: null },
          mind: { current: 0, longest: 0, lastSuccessDate: null },
          finance: { current: 0, longest: 0, lastSuccessDate: null },
          projects: { current: 0, longest: 0, lastSuccessDate: null },
        },
        counters: { llmCallsToday: 0, llmCallsTodayResetAt: new Date(0).toISOString() },
        scheduledEvents: [
          {
            id: 'evt_test_1',
            type: 'weekly_bilan',
            scheduledFor: new Date(Date.now() - 60_000).toISOString(),
          },
        ],
      };
      await ctx.storage.put('state', state);
    });

    await runInDurableObject(stub, async (instance) => {
      await (instance as unknown as { alarm: () => Promise<void> }).alarm();
    });

    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM bilans WHERE period_type='weekly'`,
    ).first<{ n: number }>();
    expect(row!.n).toBeGreaterThan(0);
  });

  it('fires template_progression_check without erroring', async () => {
    MockProvider.setFixture(CANONICAL_FIXTURE);

    const stub = stubFn();
    await runInDurableObject(stub, async (_inst, ctx) => {
      const state = {
        context: { userBio: '', activePillars: ['body', 'mind', 'finance', 'projects'] },
        currentFocus: null,
        patterns: [],
        streaks: {
          body: { current: 0, longest: 0, lastSuccessDate: null },
          mind: { current: 0, longest: 0, lastSuccessDate: null },
          finance: { current: 0, longest: 0, lastSuccessDate: null },
          projects: { current: 0, longest: 0, lastSuccessDate: null },
        },
        counters: { llmCallsToday: 0, llmCallsTodayResetAt: new Date(0).toISOString() },
        scheduledEvents: [
          {
            id: 'evt_test_2',
            type: 'template_progression_check',
            scheduledFor: new Date(Date.now() - 60_000).toISOString(),
          },
        ],
      };
      await ctx.storage.put('state', state);
    });

    // Should not throw. Templates have no completions, so no adjustments expected.
    await runInDurableObject(stub, async (instance) => {
      await (instance as unknown as { alarm: () => Promise<void> }).alarm();
    });
  });
});
