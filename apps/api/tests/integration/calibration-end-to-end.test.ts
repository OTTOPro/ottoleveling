/**
 * End-to-end calibration integration tests.
 *
 * Three full-stack scenarios stacking seeded D1 + DO RPC + MockProvider to
 * verify the rendered system prompt under representative calibration shapes:
 *
 *  1. Sustaining: stable HRV + MILD chronic sleep + engaged reading + success-day
 *     → Rules 1 (SUCCESS_DAY_CALIBRATION), 8 (PHYSIOLOGICAL_CALIBRATION),
 *       10 (READING_ENGAGEMENT_DEFERENCE) all surface.
 *
 *  2. All-good: stable physiology + normal reading + no exceptional yesterday
 *     → no SEVERE/MILD triggers, no caps in prompt.
 *
 *  3. Worst-case: declining HRV + SEVERE both sleep + reading drought + regression-day
 *     → Rules 2 (REGRESSION_DAY_RECOVERY), 8 (PHYSIOLOGICAL_CALIBRATION),
 *       9 (READING_DRIFT_ACKNOWLEDGMENT) surface. Locked sleep wording
 *       "270 min last night, 345 min avg" tested verbatim (both-cause SEVERE).
 *
 * These tests are the runtime contract for the calibration prompt surface - any wording
 * drift in format helpers will be caught here.
 *
 * NOTE: Each test uses a unique date to avoid D1 idempotency collisions with the
 * "already generated today" guard in generateDailyInternal.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import { MockProvider } from '../../src/lib/llm/mock';
import { CANONICAL_FIXTURE } from '../fixtures/llm-fixture';

// Helper: insert hrv_rmssd value for a given date
async function seedHrv(date: string, value: number): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO daily_metrics (date, provider, metric, value, pillar_id)
     VALUES (?, 'google_health', 'hrv_rmssd', ?, 'body')`,
  )
    .bind(date, value)
    .run();
}

// Helper: insert sleep_minutes value for a given date
async function seedSleep(date: string, value: number): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO daily_metrics (date, provider, metric, value, pillar_id)
     VALUES (?, 'google_health', 'sleep_minutes', ?, 'body')`,
  )
    .bind(date, value)
    .run();
}

// Helper: insert a library_save_events episode_save row
async function seedEpisodeSave(date: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO library_save_events
       (date, show_or_book_title, show_or_book_author, show_or_book_spotify_uri, listening_type)
     VALUES (?, 'Test Show', NULL, 'spotify:show:test', 'episode_save')`,
  )
    .bind(date)
    .run();
}

// Helper: seed yesterday's quests and completions
async function seedYesterdayCompletions(
  yesterday: string,
  total: number,
  completed: number,
): Promise<void> {
  const pillars = ['body', 'mind', 'finance', 'projects'] as const;
  const ids: number[] = [];
  for (let i = 0; i < total; i++) {
    const pillar = pillars[i % 4];
    const r = await env.DB.prepare(
      `INSERT INTO quests (pillar_id, title, xp_value, difficulty, source, scheduled_for)
       VALUES (?, 'test quest', 50, 'medium', 'system', ?) RETURNING id`,
    )
      .bind(pillar, yesterday)
      .first<{ id: number }>();
    if (r) ids.push(r.id);
  }
  for (let i = 0; i < completed && i < ids.length; i++) {
    await env.DB.prepare(
      `INSERT INTO completions (quest_id, status, xp_awarded) VALUES (?, 'completed', 50)`,
    )
      .bind(ids[i])
      .run();
  }
  for (let i = completed; i < ids.length; i++) {
    await env.DB.prepare(
      `INSERT INTO completions (quest_id, status, xp_awarded) VALUES (?, 'failed', 0)`,
    )
      .bind(ids[i])
      .run();
  }
}

// Helper: derive an ISO date N days before a given date string
function daysBefore(base: string, n: number): string {
  const d = new Date(base + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

describe('End-to-end calibration integration', () => {
  beforeEach(async () => {
    // setup-d1.ts already wipes these tables globally; this is defensive
    // in case the test file runs in isolation without the global beforeEach.
    await env.DB.prepare(`DELETE FROM completions`).run();
    await env.DB.prepare(`DELETE FROM quests`).run();
    await env.DB.prepare(`DELETE FROM daily_metrics`).run();
    await env.DB.prepare(`DELETE FROM library_save_events`).run();
    await env.DB.prepare(`DELETE FROM spotify_show_filters`).run();
  });

  // ═══════════════════════════════════════════════════════════════════
  // Scenario 1 - "Sustaining"
  // HRV stable (14d @ 50ms) + sleep MILD chronic (7d avg ~370min, last night 420min)
  // + reading engaged (6 saves / 7d) + yesterday 4/4 success
  // Expected: SUCCESS_DAY_CALIBRATION + PHYSIOLOGICAL_CALIBRATION + READING_ENGAGEMENT_DEFERENCE
  // ═══════════════════════════════════════════════════════════════════
  it('Scenario 1 - sustaining path: stable HRV + MILD chronic sleep + engaged reading + success-day', async () => {
    const today = '2026-07-01';
    const yesterday = daysBefore(today, 1);

    // 14 days of stable HRV @ 50ms (all before today)
    for (let i = 1; i <= 14; i++) {
      await seedHrv(daysBefore(today, i), 50);
    }

    // 7 days of sleep: last night OK (420min), prior 6 days averaging ~355min
    // This means 7d avg = (420 + 6*355)/7 ≈ 364.3 min → below SLEEP_MILD_AVG_MIN=390 → MILD
    // last night 420min is > SLEEP_MILD_NIGHT_MIN=360, so not acute
    // → cause = 'chronic'
    await seedSleep(yesterday, 420); // last night
    for (let i = 2; i <= 7; i++) {
      await seedSleep(daysBefore(today, i), 355);
    }

    // 6 episode saves over the past 7 days → ENGAGED (threshold ≥5)
    for (let i = 1; i <= 6; i++) {
      await seedEpisodeSave(daysBefore(today, i));
    }

    // Yesterday 4/4 completed → SUCCESS_DAY_CALIBRATION fires
    await seedYesterdayCompletions(yesterday, 4, 4);

    MockProvider.setFixture(CANONICAL_FIXTURE);
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as { generateDaily: (d?: string) => Promise<unknown> }
      ).generateDaily(today);
    });

    const systemMsg = MockProvider.lastMessages!.find((m) => m.role === 'system')!;
    expect(systemMsg.content).toBeDefined();

    // Calibration block present
    expect(systemMsg.content).toContain('## Calibration signals (derived)');
    // HRV stable
    expect(systemMsg.content).toContain('HRV: stable');
    // Sleep MILD chronic
    expect(systemMsg.content).toMatch(/Sleep: MILD.*chronic/);
    // Reading engaged
    expect(systemMsg.content).toContain('Reading: engaged');

    // Strictness rules surface
    expect(systemMsg.content).toContain('SUCCESS_DAY_CALIBRATION');
    expect(systemMsg.content).toContain('PHYSIOLOGICAL_CALIBRATION');
    expect(systemMsg.content).toContain('READING_ENGAGEMENT_DEFERENCE');

    // No raw placeholder brace pairs
    expect(systemMsg.content).not.toContain('{CALIBRATION_SIGNALS}');
  });

  // ═══════════════════════════════════════════════════════════════════
  // Scenario 2 - "All-good"
  // HRV stable (14d @ 50ms) + sleep NONE (7d avg ~430min, last night 450min)
  // + reading normal (3 saves / 7d)
  // Expected: no PHYSIOLOGICAL_CALIBRATION cap triggers in prompt body
  // ═══════════════════════════════════════════════════════════════════
  it('Scenario 2 - all-good path: stable HRV + NONE sleep + normal reading', async () => {
    const today = '2026-07-02';
    const yesterday = daysBefore(today, 1);

    // 14 days of stable HRV @ 50ms
    for (let i = 1; i <= 14; i++) {
      await seedHrv(daysBefore(today, i), 50);
    }

    // 7 days of good sleep (450-480 min) → NONE (all above thresholds)
    // SLEEP_MILD_NIGHT_MIN=360, SLEEP_MILD_AVG_MIN=390 → need both > these
    await seedSleep(yesterday, 450);
    for (let i = 2; i <= 7; i++) {
      await seedSleep(daysBefore(today, i), 430);
    }

    // 3 episode saves over 7 days → NORMAL (2-4)
    for (let i = 1; i <= 3; i++) {
      await seedEpisodeSave(daysBefore(today, i));
    }

    MockProvider.setFixture(CANONICAL_FIXTURE);
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as { generateDaily: (d?: string) => Promise<unknown> }
      ).generateDaily(today);
    });

    const systemMsg = MockProvider.lastMessages!.find((m) => m.role === 'system')!;
    expect(systemMsg.content).toBeDefined();

    // Calibration block present
    expect(systemMsg.content).toContain('## Calibration signals (derived)');
    // HRV stable
    expect(systemMsg.content).toContain('HRV: stable');
    // Sleep NONE
    expect(systemMsg.content).toContain('Sleep: NONE');
    // Reading normal
    expect(systemMsg.content).toContain('Reading: normal');

    // PHYSIOLOGICAL_CALIBRATION rule is still in the prompt text (it's always rendered)
    // but the cap-directive-triggering conditions (severe/mild) are NOT in the calibration line
    expect(systemMsg.content).not.toMatch(/Sleep: SEVERE/);
    expect(systemMsg.content).not.toMatch(/Sleep: MILD/);
    expect(systemMsg.content).not.toContain('{CALIBRATION_SIGNALS}');
  });

  // ═══════════════════════════════════════════════════════════════════
  // Scenario 3 - "Worst-case"
  // HRV declining (-16%: 11d baseline @ 50ms + 3d recent @ 42ms)
  // + sleep SEVERE both (last night=270, 7d avg=345) - locked wording
  // + reading drought (1 save / 7d - drought boundary)
  // + yesterday 1/4 success → REGRESSION_DAY_RECOVERY
  // Expected: REGRESSION_DAY_RECOVERY + PHYSIOLOGICAL_CALIBRATION + READING_DRIFT_ACKNOWLEDGMENT
  //           Precedence hierarchy block present
  //           Verbatim: "270 min last night, 345 min avg"
  //           Boundary: "1 episode save last 7d"
  // ═══════════════════════════════════════════════════════════════════
  it('Scenario 3 - worst-case: declining HRV + SEVERE both sleep + drought reading + regression-day', async () => {
    const today = '2026-07-03';
    const yesterday = daysBefore(today, 1);

    // HRV: prior 11 days @ 50ms baseline, recent 3 days @ 42ms
    // Baseline window: [today-14, today-3) → days 4..14 before today
    // Recent window: [today-3, today) → days 1..3 before today
    for (let i = 4; i <= 14; i++) {
      await seedHrv(daysBefore(today, i), 50);
    }
    for (let i = 1; i <= 3; i++) {
      await seedHrv(daysBefore(today, i), 42);
    }

    // Sleep SEVERE both:
    // - last night (yesterday) = 270 min < SLEEP_SEVERE_NIGHT_MIN=300 → acute
    // - 7d avg: need avg < SLEEP_SEVERE_AVG_MIN=360
    //   270 + 6*387.5 = 270+2325 = 2595 / 7 = 370.7 → NOT below 360 for SEVERE
    //   Try: 270 + 6*363 = 270 + 2178 = 2448 / 7 = 349.7 → below 360 → SEVERE
    //   Round to: avg of [270, 362, 362, 362, 362, 362, 362] = 2392/7 ≈ 341.7 min
    //   Actual avg from 7d window: we seed 7 days
    //   Use: yesterday=270, prior 6 days @ 360 → avg = (270+6*360)/7 = (270+2160)/7 = 2430/7 ≈ 347
    //   347 < 360 → SEVERE chronic. acute also fires (270 < 300). → SEVERE both
    await seedSleep(yesterday, 270);
    for (let i = 2; i <= 7; i++) {
      await seedSleep(daysBefore(today, i), 360);
    }

    // Verify the expected 7d avg will be close to 345:
    // The locked wording expects "345 min avg". The format helper rounds to an integer:
    // (270 + 6*358) / 7 = 2418/7 ≈ 345.4 → rounds to 345.

    // Reading drought: exactly 1 episode save (boundary: ≤1 = drought)
    await seedEpisodeSave(daysBefore(today, 1));

    // Yesterday 1/4 completed → REGRESSION_DAY_RECOVERY fires (rate=0.25 < 0.4)
    await seedYesterdayCompletions(yesterday, 4, 1);

    // Re-seed sleep with precise values to hit avg≈345
    // Clear the sleep rows we seeded above and reseed with 358
    await env.DB.prepare(`DELETE FROM daily_metrics WHERE metric = 'sleep_minutes'`).run();
    await seedSleep(yesterday, 270);
    for (let i = 2; i <= 7; i++) {
      await seedSleep(daysBefore(today, i), 358);
    }
    // Verify: (270 + 5*358 + 358) / 7 = (270 + 6*358) / 7 = (270 + 2148) / 7 = 2418 / 7 = 345.43 → rounds to 345

    MockProvider.setFixture(CANONICAL_FIXTURE);
    const stub = env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
    await runInDurableObject(stub, async (instance) => {
      await (
        instance as unknown as { generateDaily: (d?: string) => Promise<unknown> }
      ).generateDaily(today);
    });

    const systemMsg = MockProvider.lastMessages!.find((m) => m.role === 'system')!;
    expect(systemMsg.content).toBeDefined();

    // Calibration block present
    expect(systemMsg.content).toContain('## Calibration signals (derived)');
    // HRV declining
    expect(systemMsg.content).toContain('HRV: declining');
    // Locked wording - SEVERE both with exact minute values
    expect(systemMsg.content).toContain(
      'Sleep: SEVERE (acute + chronic, 270 min last night, 345 min avg)',
    );
    // Reading drought - boundary (1 episode save → still drought)
    expect(systemMsg.content).toContain('Reading: drought');
    // Singular grammar: "1 episode save last 7d"
    expect(systemMsg.content).toContain('1 episode save last 7d');

    // All 3 strictness rules for this scenario
    expect(systemMsg.content).toContain('REGRESSION_DAY_RECOVERY');
    expect(systemMsg.content).toContain('PHYSIOLOGICAL_CALIBRATION');
    expect(systemMsg.content).toContain('READING_DRIFT_ACKNOWLEDGMENT');

    // Precedence hierarchy block
    expect(systemMsg.content).toContain('Rule precedence hierarchy');

    // No raw placeholder
    expect(systemMsg.content).not.toContain('{CALIBRATION_SIGNALS}');
  });
});
