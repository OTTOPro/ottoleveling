import { describe, it, expect } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import { MockProvider } from '../../src/lib/llm/mock';
import { MockPushSender } from '../../src/lib/push-sender';
import { CANONICAL_FIXTURE, CANONICAL_BILAN_FIXTURE } from '../fixtures/llm-fixture';

const stubFn = () => env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));

async function seedSub(endpoint: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, 'p', 'a')`,
  )
    .bind(endpoint)
    .run();
}

describe('alarm push integration', () => {
  /**
   * `daily_generation` is a LEGACY alarm. The primary alarm
   * is `daily_cycle_spawn` which creates a DailyCycleWorkflow. Push notification
   * for daily generation now originates from the consumer worker (sendPush called
   * after generateDailyFromQueue completes), not the alarm handler.
   *
   * These 2 tests are updated to reflect the new behavior: the legacy
   * `daily_generation` alarm handler dispatches to the LLM queue only -
   * no push is fired from the alarm path anymore.
   */
  it('legacy daily_generation alarm dispatches to queue (no push from alarm)', async () => {
    MockProvider.setFixture(CANONICAL_FIXTURE);
    await seedSub('https://example.com/daily-test');

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
            id: 'evt_push_daily',
            type: 'daily_generation',
            scheduledFor: new Date(Date.now() - 60_000).toISOString(),
          },
        ],
      };
      await ctx.storage.put('state', state);
    });

    await runInDurableObject(stub, async (instance) => {
      await (instance as unknown as { alarm: () => Promise<void> }).alarm();
    });

    // daily_generation alarm dispatches to queue - push is NOT fired inline.
    // Push now comes from the consumer worker after queue processing.
    expect(MockPushSender.recordedCalls.length).toBe(0);
  });

  it('legacy daily_generation alarm with focus set dispatches to queue (no push from alarm)', async () => {
    MockProvider.setFixture(CANONICAL_FIXTURE);
    await seedSub('https://example.com/daily-focus-test');

    const stub = stubFn();
    await runInDurableObject(stub, async (_inst, ctx) => {
      const state = {
        context: { userBio: '', activePillars: ['body', 'mind', 'finance', 'projects'] },
        currentFocus: { pillarId: 'body', horizon: 'weekly', startedAt: new Date().toISOString() },
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
            id: 'evt_push_daily_focus',
            type: 'daily_generation',
            scheduledFor: new Date(Date.now() - 60_000).toISOString(),
          },
        ],
      };
      await ctx.storage.put('state', state);
    });

    await runInDurableObject(stub, async (instance) => {
      await (instance as unknown as { alarm: () => Promise<void> }).alarm();
    });

    // Legacy daily_generation alarm dispatches to queue - no push from alarm.
    expect(MockPushSender.recordedCalls.length).toBe(0);
  });

  it('weekly_bilan alarm fires sendPush with bilan_ready + ISO week number in body + bilan id in url', async () => {
    MockProvider.setFixture(CANONICAL_BILAN_FIXTURE);
    await seedSub('https://example.com/bilan-test');

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
            id: 'evt_push_bilan',
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

    expect(MockPushSender.recordedCalls.length).toBe(1);
    const payload = JSON.parse(MockPushSender.recordedCalls[0]!.payload);
    expect(payload.type).toBe('bilan_ready');
    expect(payload.url).toMatch(/^\/bilans\/\d+$/);
    // Body includes "Week N" where N is an ISO week number (1-53).
    expect(payload.body).toMatch(/^Weekly bilan available\. Week \d{1,2}\.$/);
  });

  it('weekly_bilan alarm fires without sending push when no subscriptions exist', async () => {
    MockProvider.setFixture(CANONICAL_BILAN_FIXTURE);
    // No seedSub call.

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
            id: 'evt_push_empty',
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

    expect(MockPushSender.recordedCalls.length).toBe(0);
  });
});
