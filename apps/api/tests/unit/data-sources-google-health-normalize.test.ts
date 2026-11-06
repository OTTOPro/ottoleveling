import { describe, it, expect } from 'vitest';
import { GoogleHealthProvider } from '../../src/lib/data-sources/google-health';
import {
  STEPS_ROLLUP_FIXTURE,
  HEART_RATE_ROLLUP_FIXTURE,
  DAILY_RESTING_HR_LIST_FIXTURE,
  DAILY_HRV_LIST_FIXTURE,
  SLEEP_LIST_FIXTURE,
  EMPTY_ROLLUP_FIXTURE,
  EMPTY_LIST_FIXTURE,
} from '../fixtures/google-health-fixture';

// Stub fetcher - matches by URL substring AND method.
// steps + heart-rate use POST :dailyRollUp; resting-hr, hrv, sleep use GET list.
function makeStubFetcher(map: Record<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    for (const key of Object.keys(map)) {
      if (url.includes(key)) {
        return new Response(JSON.stringify(map[key]), { status: 200 });
      }
    }
    // Default: empty rollup for POST, empty list for GET (graceful)
    return new Response(
      JSON.stringify(method === 'POST' ? { rollupDataPoints: [] } : { dataPoints: [] }),
      { status: 200 },
    );
  }) as typeof fetch;
}

describe('GoogleHealthProvider.syncDaily - normalization', () => {
  const provider = (fetcher: typeof fetch) =>
    new GoogleHealthProvider({
      clientId: 'cid',
      clientSecret: 'csec',
      fetcher,
    });

  // The target date - all list-based fixtures match this (resting-hr + hrv via
  // {year,month,day} subobject; sleep via interval.endTime.slice(0,10)).
  // For sleep, "May 30" matches because interval.endTime = '2026-05-30T06:50:00Z'.
  const TARGET_DATE = '2026-05-30';

  it('normalizes steps from rollupDataPoints[].steps.countSum (string-encoded int)', async () => {
    const p = provider(
      makeStubFetcher({
        '/dataTypes/steps/dataPoints:dailyRollUp': STEPS_ROLLUP_FIXTURE,
      }),
    );
    const metrics = await p.syncDaily({ date: TARGET_DATE, accessToken: 'tok' });
    const steps = metrics.find((m) => m.metric === 'steps');
    expect(steps).toBeDefined();
    expect(steps!.value).toBe(8000);
    expect(steps!.pillar_id).toBe('body');
    expect(steps!.provider).toBe('google_health');
    expect(steps!.date).toBe(TARGET_DATE);
  });

  it('normalizes heart_rate from rollupDataPoints[].heartRate.beatsPerMinuteAvg (flat)', async () => {
    const p = provider(
      makeStubFetcher({
        '/dataTypes/heart-rate/dataPoints:dailyRollUp': HEART_RATE_ROLLUP_FIXTURE,
      }),
    );
    const metrics = await p.syncDaily({ date: TARGET_DATE, accessToken: 'tok' });
    const hr = metrics.find((m) => m.metric === 'heart_rate_avg');
    expect(hr).toBeDefined();
    expect(hr!.value).toBe(70);
    expect(hr!.metadata).toMatchObject({ min: 50, max: 150 });
  });

  it('normalizes daily_resting_heart_rate from dailyRestingHeartRate.beatsPerMinute (list, client-filtered by date)', async () => {
    // Fixture has date={2026,5,29} but TARGET_DATE is 2026-05-30 → no match
    // unless we override the target. Test with date matching the fixture instead.
    const p = provider(
      makeStubFetcher({
        '/dataTypes/daily-resting-heart-rate/dataPoints': DAILY_RESTING_HR_LIST_FIXTURE,
      }),
    );
    const metrics = await p.syncDaily({ date: '2026-05-29', accessToken: 'tok' });
    const rhr = metrics.find((m) => m.metric === 'resting_hr');
    expect(rhr).toBeDefined();
    expect(rhr!.value).toBe(60);
    expect(rhr!.metadata).toMatchObject({ calculationMethod: 'SLEEP' });
  });

  it('normalizes daily_hrv from dailyHeartRateVariability.averageHeartRateVariabilityMilliseconds (number)', async () => {
    const p = provider(
      makeStubFetcher({
        '/dataTypes/daily-heart-rate-variability/dataPoints': DAILY_HRV_LIST_FIXTURE,
      }),
    );
    const metrics = await p.syncDaily({ date: '2026-05-29', accessToken: 'tok' });
    const hrv = metrics.find((m) => m.metric === 'hrv_rmssd');
    expect(hrv).toBeDefined();
    expect(hrv!.value).toBeCloseTo(50.5, 1);
    expect(hrv!.metadata).toMatchObject({ entropy: 1.5, deep_sleep_rmssd_ms: 55.5 });
  });

  it('normalizes sleep via the list method - uses summary.minutesAsleep + matches by interval.endTime date', async () => {
    const p = provider(
      makeStubFetcher({
        '/dataTypes/sleep/dataPoints': SLEEP_LIST_FIXTURE,
      }),
    );
    // Fixture sleep.interval.endTime = '2026-05-30T06:50:00Z' → matches TARGET_DATE
    const metrics = await p.syncDaily({ date: TARGET_DATE, accessToken: 'tok' });
    const sleep = metrics.find((m) => m.metric === 'sleep_minutes');
    expect(sleep).toBeDefined();
    expect(sleep!.value).toBe(465); // summary.minutesAsleep
    expect(sleep!.metadata).toMatchObject({
      minutes_in_sleep_period: 480,
      minutes_awake: 15,
      minutes_to_fall_asleep: 5,
    });
  });

  it('returns empty array when all endpoints return no data points', async () => {
    const p = provider(makeStubFetcher({}));
    const metrics = await p.syncDaily({ date: TARGET_DATE, accessToken: 'tok' });
    expect(metrics).toEqual([]);
  });

  it('skips a metric whose response is missing rollupDataPoints/dataPoints field (graceful degradation)', async () => {
    const p = provider(
      (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch,
    );
    const metrics = await p.syncDaily({ date: TARGET_DATE, accessToken: 'tok' });
    expect(metrics).toEqual([]);
  });

  it('sends 2 POST :dailyRollUp + 3 GET list requests with the correct body shape', async () => {
    const seen: { url: string; method: string; body: string }[] = [];
    const captureFetcher: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? init.body : '';
      seen.push({ url, method, body });
      if (method === 'POST')
        return new Response(JSON.stringify(EMPTY_ROLLUP_FIXTURE), { status: 200 });
      return new Response(JSON.stringify(EMPTY_LIST_FIXTURE), { status: 200 });
    }) as typeof fetch;
    const p = provider(captureFetcher);
    await p.syncDaily({ date: '2026-05-29', accessToken: 'tok' });

    // 2 dailyRollUp POSTs (steps + heart-rate - the only types that support it)
    const posts = seen.filter((s) => s.method === 'POST');
    expect(posts.length).toBe(2);
    for (const post of posts) {
      expect(post.url).toContain(':dailyRollUp');
      // CivilDateTime is nested per Google's Discovery doc: { date: {y,m,d} }
      const parsed = JSON.parse(post.body) as {
        range: {
          start: { date: { year: number; month: number; day: number } };
          end: { date: { year: number; month: number; day: number } };
        };
        windowSizeDays: number;
      };
      expect(parsed.range.start.date).toEqual({ year: 2026, month: 5, day: 29 });
      expect(parsed.range.end.date).toEqual({ year: 2026, month: 5, day: 30 });
      expect(parsed.windowSizeDays).toBe(1);
    }
    // 3 GETs: resting-hr, hrv, sleep
    const gets = seen.filter((s) => s.method === 'GET');
    expect(gets.length).toBe(3);
    expect(gets.some((g) => g.url.includes('/dataTypes/daily-resting-heart-rate/dataPoints'))).toBe(
      true,
    );
    expect(
      gets.some((g) => g.url.includes('/dataTypes/daily-heart-rate-variability/dataPoints')),
    ).toBe(true);
    expect(gets.some((g) => g.url.includes('/dataTypes/sleep/dataPoints'))).toBe(true);
  });
});
