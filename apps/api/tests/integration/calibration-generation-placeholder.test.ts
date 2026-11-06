/**
 * Integration tests
 * confirming {CALIBRATION_SIGNALS} is substituted into the system prompt and
 * that the Rule precedence hierarchy block is present in the rendered prompt.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import { MockProvider } from '../../src/lib/llm/mock';
import { CANONICAL_FIXTURE } from '../fixtures/llm-fixture';

describe('CALIBRATION_SIGNALS in daily generation prompt', () => {
  beforeEach(async () => {
    await env.DB.prepare(`DELETE FROM completions`).run();
    await env.DB.prepare(`DELETE FROM quests`).run();
    await env.DB.prepare(`DELETE FROM daily_metrics`).run();
    await env.DB.prepare(`DELETE FROM library_save_events`).run();
    await env.DB.prepare(`DELETE FROM spotify_show_filters`).run();
  });

  it('renders {CALIBRATION_SIGNALS} placeholder fully substituted (no raw brace pair)', async () => {
    MockProvider.setFixture(CANONICAL_FIXTURE);
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as { generateDaily: (d?: string) => Promise<unknown> }
      ).generateDaily('2026-06-01');
    });
    const systemMsg = MockProvider.lastMessages!.find((m) => m.role === 'system')!;
    // Placeholder must be substituted - raw {CALIBRATION_SIGNALS} must NOT appear
    expect(systemMsg.content).not.toContain('{CALIBRATION_SIGNALS}');
  });

  it('renders the empty-state line when no calibration data is available', async () => {
    // No daily_metrics, no library_save_events → buildCalibrationSignals returns null
    MockProvider.setFixture(CANONICAL_FIXTURE);
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as { generateDaily: (d?: string) => Promise<unknown> }
      ).generateDaily('2026-06-01');
    });
    const systemMsg = MockProvider.lastMessages!.find((m) => m.role === 'system')!;
    // null calibration → format helper renders empty-state
    expect(systemMsg.content).toContain('no calibration signals available');
  });

  it('renders ## Calibration signals (derived) heading when HRV data is seeded', async () => {
    // Seed 14 days of HRV data (stable) so buildCalibrationSignals returns non-null
    const seedStatements = [];
    for (let i = 1; i <= 14; i++) {
      const d = new Date('2026-06-01T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      seedStatements.push(
        env.DB.prepare(
          `INSERT INTO daily_metrics (date, provider, metric, value, pillar_id) VALUES (?, 'google_health', 'hrv_rmssd', 50, 'body')`,
        ).bind(dateStr),
      );
    }
    await env.DB.batch(seedStatements);

    MockProvider.setFixture(CANONICAL_FIXTURE);
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as { generateDaily: (d?: string) => Promise<unknown> }
      ).generateDaily('2026-06-01');
    });
    const systemMsg = MockProvider.lastMessages!.find((m) => m.role === 'system')!;
    // Non-null calibration → format helper renders the H2 heading
    expect(systemMsg.content).toContain('## Calibration signals (derived)');
    // Placeholder fully substituted
    expect(systemMsg.content).not.toContain('{CALIBRATION_SIGNALS}');
  });

  it('Risk #3 - HRV declining + 4/4 success day → prompt contains BOTH rule labels + precedence hierarchy', async () => {
    // Seed 14 days of HRV:
    //   Prior 11 days @ baseline 50ms, recent 3 days @ 42ms → -16% delta → 'declining'
    const today = '2026-06-02'; // use a different date to avoid idempotency collision
    const seedStmts = [];

    // Prior 11 days: 2026-05-18 → 2026-05-28 (inclusive) at 50ms
    for (let i = 0; i < 11; i++) {
      const d = new Date('2026-05-18T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + i);
      seedStmts.push(
        env.DB.prepare(
          `INSERT INTO daily_metrics (date, provider, metric, value, pillar_id) VALUES (?, 'google_health', 'hrv_rmssd', 50, 'body')`,
        ).bind(d.toISOString().slice(0, 10)),
      );
    }
    // Recent 3 days: 2026-05-29, 2026-05-30, 2026-06-01 @ 42ms (50 * 0.84 = 42 → -16% delta)
    for (const d of ['2026-05-29', '2026-05-30', '2026-06-01']) {
      seedStmts.push(
        env.DB.prepare(
          `INSERT INTO daily_metrics (date, provider, metric, value, pillar_id) VALUES (?, 'google_health', 'hrv_rmssd', 42, 'body')`,
        ).bind(d),
      );
    }

    // Seed yesterday's quests (2026-06-01) as 4/4 completed → SUCCESS_DAY_CALIBRATION fires
    for (const pillar of ['body', 'mind', 'finance', 'projects']) {
      const r = await env.DB.prepare(
        `INSERT INTO quests (pillar_id, title, xp_value, difficulty, source, scheduled_for)
         VALUES (?, 'quest', 50, 'medium', 'system', '2026-06-01') RETURNING id`,
      )
        .bind(pillar)
        .first<{ id: number }>();
      if (r) {
        seedStmts.push(
          env.DB.prepare(
            `INSERT INTO completions (quest_id, status, xp_awarded) VALUES (?, 'completed', 50)`,
          ).bind(r.id),
        );
      }
    }

    await env.DB.batch(seedStmts);

    MockProvider.setFixture(CANONICAL_FIXTURE);
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as { generateDaily: (d?: string) => Promise<unknown> }
      ).generateDaily(today);
    });
    const systemMsg = MockProvider.lastMessages!.find((m) => m.role === 'system')!;

    // Both rule labels must be present in the rendered prompt
    expect(systemMsg.content).toContain('PHYSIOLOGICAL_CALIBRATION');
    expect(systemMsg.content).toContain('SUCCESS_DAY_CALIBRATION');

    // Precedence hierarchy block must be present
    expect(systemMsg.content).toContain('### Rule precedence hierarchy');
    expect(systemMsg.content).toContain('Tier 1 wins');
    expect(systemMsg.content).toContain('higher-tier rule conflicts');

    // HRV declining signal must appear in calibration block
    expect(systemMsg.content).toContain('declining');
  });
});
