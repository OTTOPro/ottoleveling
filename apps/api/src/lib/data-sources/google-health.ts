import type { DataSourceProvider } from './provider';
import type { DailyMetric, ProviderName, TokenSet } from './types';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://health.googleapis.com/v4/users/me/dataTypes';

// OAuth scopes - space-separated in the authorize URL
const SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.profile.readonly',
].join(' ');

interface GoogleHealthProviderArgs {
  clientId: string;
  clientSecret: string;
  fetcher: typeof fetch;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

// --- Response shapes ---

// list method (used for sleep + daily-resting-heart-rate + daily-heart-rate-variability)
// Shape varies per dataType - the dataPoint wrapper contains a type-specific nested
// object. We type each variant separately for normalization.

interface GoogleDailyRestingHrDataPoint {
  dailyRestingHeartRate?: {
    date?: { year: number; month: number; day: number };
    beatsPerMinute?: string; // string-encoded int
    dailyRestingHeartRateMetadata?: { calculationMethod?: string };
  };
}

interface GoogleDailyHrvDataPoint {
  dailyHeartRateVariability?: {
    date?: { year: number; month: number; day: number };
    averageHeartRateVariabilityMilliseconds?: number;
    nonRemHeartRateBeatsPerMinute?: string;
    entropy?: number;
    deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds?: number;
  };
}

interface GoogleSleepStage {
  startTime: string; // ISO 8601
  endTime: string;
  type: 'LIGHT' | 'DEEP' | 'REM' | 'AWAKE';
}

interface GoogleSleepDataPoint {
  // Live API response shape (verified against real responses):
  //   { "sleep": { "interval": {startTime,endTime}, "type": "STAGES",
  //                "stages": [...], "summary": {minutesAsleep,...} } }
  // Note: the top-level key is `sleep`; there is no `sleepSession` key in v4 responses.
  sleep?: {
    interval?: {
      startTime?: string; // ISO 8601 - overall session start
      endTime?: string; // ISO 8601 - overall session end (used for date matching)
      startUtcOffset?: string;
      endUtcOffset?: string;
    };
    type?: 'STAGES' | string;
    stages?: GoogleSleepStage[];
    summary?: {
      minutesInSleepPeriod?: string; // string-encoded int
      minutesAfterWakeUp?: string;
      minutesToFallAsleep?: string;
      minutesAsleep?: string;
      minutesAwake?: string;
      stagesSummary?: Array<{ type: string; minutes: string; count: string }>;
    };
    createTime?: string;
    updateTime?: string;
  };
}

interface GoogleListResponse<T = unknown> {
  dataPoints?: T[];
  nextPageToken?: string;
}

// dailyRollUp method (used for steps + heart-rate)
interface CivilDateTime {
  year: number;
  month: number;
  day: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
}

interface GoogleRollupDataPoint {
  civilStartTime: CivilDateTime;
  civilEndTime: CivilDateTime;
  // Per-metric union value field (only one set per data point).
  // Field shapes verified against live API responses:
  //   steps:     { "countSum": "23294" } - STRING-encoded int64
  //   heartRate: { "beatsPerMinuteAvg": 68.4, "beatsPerMinuteMin": 39, "beatsPerMinuteMax": 184 } - flat numbers
  steps?: { countSum?: string };
  heartRate?: {
    beatsPerMinuteAvg?: number;
    beatsPerMinuteMin?: number;
    beatsPerMinuteMax?: number;
  };
  // (daily-resting-heart-rate + daily-heart-rate-variability are not supported via
  //  dailyRollUp - Google returns UNSUPPORTED_DATA_TYPE_ACTION - so they use the list method)
}

interface GoogleRollupResponse {
  rollupDataPoints?: GoogleRollupDataPoint[];
}

export class GoogleHealthProvider implements DataSourceProvider {
  readonly name: ProviderName = 'google_health';
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly fetcher: typeof fetch;

  constructor(args: GoogleHealthProviderArgs) {
    this.clientId = args.clientId;
    this.clientSecret = args.clientSecret;
    this.fetcher = args.fetcher;
  }

  authorize(args: { redirectUri: string; state: string; codeChallenge: string }): {
    authUrl: string;
  } {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: args.redirectUri,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline', // REQUIRED to receive refresh_token
      prompt: 'consent', // Force refresh_token regeneration on re-auth
      state: args.state,
      code_challenge: args.codeChallenge,
      code_challenge_method: 'S256',
    });
    return { authUrl: `${AUTHORIZE_URL}?${params.toString()}` };
  }

  async handleCallback(args: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<TokenSet> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: args.code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: args.redirectUri,
      code_verifier: args.codeVerifier,
    });
    const res = await this.fetcher(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as GoogleTokenResponse;
    if (!json.refresh_token) {
      throw new Error(
        'Google token exchange returned no refresh_token (was access_type=offline + prompt=consent?)',
      );
    }
    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
      scope: json.scope,
    };
  }

  async refreshTokens(refreshToken: string): Promise<TokenSet> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    const res = await this.fetcher(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as GoogleTokenResponse;
    return {
      // Refresh response typically does NOT include a new refresh_token - reuse the old one
      access_token: json.access_token,
      refresh_token: json.refresh_token ?? refreshToken,
      expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
      scope: json.scope,
    };
  }

  async syncDaily(args: { date: string; accessToken: string }): Promise<DailyMetric[]> {
    const { date, accessToken } = args;
    const out: DailyMetric[] = [];

    // dailyRollUp range is CLOSED-OPEN: start=date, end=date+1day.
    // E.g. yesterday=May 29 → start={civilDate:{2026,5,29}}, end={civilDate:{2026,5,30}}.
    //
    // CivilDateTime is a nested type with civilDate + civilTime sub-objects
    // (NOT flat year/month/day fields - that returned 400 from Google with
    // "Unknown name 'year' at 'range.start'").
    //
    // dailyRollUp HTTP 400 range limits per docs:
    //   - heart-rate: max 14-day range
    //   - other types: max 90-day range
    // We always send 1-day windows so we never hit these.
    // CivilDateTime per Google's Discovery doc ($discovery/rest?version=v4):
    //   { "date": Date, "time": TimeOfDay (optional, defaults to midnight) }
    // where Date is google.type.Date = { year, month, day }.
    // time is omitted → defaults to 00:00:00 (start of day), which is what we want.
    const [year, month, day] = parseDateUtc(date);
    const [endYear, endMonth, endDay] = nextDayUtc(year, month, day);
    const rollupBody = JSON.stringify({
      range: {
        start: { date: { year, month, day } },
        end: { date: { year: endYear, month: endMonth, day: endDay } },
      },
      windowSizeDays: 1,
    });

    // --- 1. Steps (POST :dailyRollUp) ---
    // Response: rollupDataPoints[0].steps.countSum - STRING-encoded int64
    const stepsRes = await this.postRollup(
      `${API_BASE}/steps/dataPoints:dailyRollUp`,
      rollupBody,
      accessToken,
    );
    const stepsCountStr = stepsRes?.rollupDataPoints?.[0]?.steps?.countSum;
    if (stepsCountStr != null) {
      const stepsCount = parseInt(stepsCountStr, 10);
      if (Number.isFinite(stepsCount)) {
        out.push({
          date,
          pillar_id: 'body',
          provider: 'google_health',
          metric: 'steps',
          value: stepsCount,
        });
      }
    }

    // --- 2. Heart rate (POST :dailyRollUp) ---
    // Response: rollupDataPoints[0].heartRate.{beatsPerMinuteAvg,Min,Max} - flat numbers
    // Store the day's avg as the scalar value; min/max in metadata for inspection.
    const hrRes = await this.postRollup(
      `${API_BASE}/heart-rate/dataPoints:dailyRollUp`,
      rollupBody,
      accessToken,
    );
    const hrPoint = hrRes?.rollupDataPoints?.[0]?.heartRate;
    if (hrPoint?.beatsPerMinuteAvg != null) {
      out.push({
        date,
        pillar_id: 'body',
        provider: 'google_health',
        metric: 'heart_rate_avg',
        value: hrPoint.beatsPerMinuteAvg,
        metadata:
          hrPoint.beatsPerMinuteMin != null && hrPoint.beatsPerMinuteMax != null
            ? { min: hrPoint.beatsPerMinuteMin, max: hrPoint.beatsPerMinuteMax }
            : null,
      });
    }

    // --- 3. Daily resting heart rate (GET list - dailyRollUp not supported) ---
    // Response: dataPoints[].dailyRestingHeartRate.{date,beatsPerMinute (string)}.
    // We fetch recent rows and client-side filter by date (avoids filter-syntax
    // discovery; ~5 rows per response is negligible).
    const rhrRes = await this.getListPaged<GoogleDailyRestingHrDataPoint>(
      `${API_BASE}/daily-resting-heart-rate/dataPoints?pageSize=10`,
      accessToken,
    );
    const rhrMatch = rhrRes?.dataPoints?.find((p) =>
      sameDate(p.dailyRestingHeartRate?.date, year, month, day),
    );
    const rhrBpmStr = rhrMatch?.dailyRestingHeartRate?.beatsPerMinute;
    if (rhrBpmStr != null) {
      const bpm = parseInt(rhrBpmStr, 10);
      if (Number.isFinite(bpm)) {
        out.push({
          date,
          pillar_id: 'body',
          provider: 'google_health',
          metric: 'resting_hr',
          value: bpm,
          metadata: rhrMatch?.dailyRestingHeartRate?.dailyRestingHeartRateMetadata
            ? {
                calculationMethod:
                  rhrMatch.dailyRestingHeartRate.dailyRestingHeartRateMetadata.calculationMethod,
              }
            : null,
        });
      }
    }

    // --- 4. Daily HRV (GET list) ---
    // Response: dataPoints[].dailyHeartRateVariability.{date,averageHeartRateVariabilityMilliseconds (number),entropy,deepSleep...}.
    const hrvRes = await this.getListPaged<GoogleDailyHrvDataPoint>(
      `${API_BASE}/daily-heart-rate-variability/dataPoints?pageSize=10`,
      accessToken,
    );
    const hrvMatch = hrvRes?.dataPoints?.find((p) =>
      sameDate(p.dailyHeartRateVariability?.date, year, month, day),
    );
    const hrvMs = hrvMatch?.dailyHeartRateVariability?.averageHeartRateVariabilityMilliseconds;
    if (hrvMs != null) {
      out.push({
        date,
        pillar_id: 'body',
        provider: 'google_health',
        metric: 'hrv_rmssd',
        value: hrvMs,
        metadata: hrvMatch?.dailyHeartRateVariability
          ? {
              entropy: hrvMatch.dailyHeartRateVariability.entropy,
              deep_sleep_rmssd_ms:
                hrvMatch.dailyHeartRateVariability
                  .deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds,
            }
          : null,
      });
    }

    // --- 5. Sleep (GET list - sleep session type, not in dailyRollUp value union) ---
    // Response: dataPoints[].sleep.{interval,stages,summary} (NOT `sleepSession`).
    // Summary fields are string-encoded ints. We use minutesAsleep as the value.
    // "Sleep date" = the date the session ENDED (sleep crosses midnight; ending
    // on day D means it's "D's night sleep"). We pick the session whose interval
    // end-date matches our target. Falls back to last stage's endTime if interval
    // is missing.
    const sleepRes = await this.getListPaged<GoogleSleepDataPoint>(
      `${API_BASE}/sleep/dataPoints?pageSize=10`,
      accessToken,
    );
    const sleepMatch = sleepRes?.dataPoints?.find((p) => {
      const endTime =
        p.sleep?.interval?.endTime ??
        (p.sleep?.stages && p.sleep.stages.length > 0
          ? p.sleep.stages[p.sleep.stages.length - 1]!.endTime
          : undefined);
      if (!endTime) return false;
      return endTime.slice(0, 10) === date;
    });
    const sleepSummary = sleepMatch?.sleep?.summary;
    const sleepMins = sleepSummary?.minutesAsleep;
    if (sleepMins != null) {
      const mins = parseInt(sleepMins, 10);
      if (Number.isFinite(mins) && mins > 0) {
        out.push({
          date,
          pillar_id: 'body',
          provider: 'google_health',
          metric: 'sleep_minutes',
          value: mins,
          metadata: sleepSummary
            ? capMetadata({
                minutes_in_sleep_period: Number(sleepSummary.minutesInSleepPeriod ?? 0),
                minutes_awake: Number(sleepSummary.minutesAwake ?? 0),
                minutes_to_fall_asleep: Number(sleepSummary.minutesToFallAsleep ?? 0),
                stages_summary: sleepSummary.stagesSummary?.map((s) => ({
                  type: s.type,
                  minutes: Number(s.minutes),
                  count: Number(s.count),
                })),
              })
            : null,
        });
      }
    }

    return out;
  }

  private async postRollup(
    url: string,
    body: string,
    accessToken: string,
  ): Promise<GoogleRollupResponse | null> {
    const res = await this.fetcher(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body,
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('UNAUTHORIZED');
      const errBody = await res.text();
      console.warn(
        `[GoogleHealthProvider] POST ${url} returned ${res.status} - request body: ${body} - response: ${errBody}`,
      );
      return null;
    }
    return (await res.json()) as GoogleRollupResponse;
  }

  private async getListPaged<T>(
    url: string,
    accessToken: string,
  ): Promise<GoogleListResponse<T> | null> {
    const res = await this.fetcher(url, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('UNAUTHORIZED');
      const errBody = await res.text();
      console.warn(
        `[GoogleHealthProvider] GET ${url} returned ${res.status} - response: ${errBody}`,
      );
      return null;
    }
    return (await res.json()) as GoogleListResponse<T>;
  }
}

/** True when a Google { year, month, day } object matches the given y/m/d triple. */
function sameDate(
  d: { year?: number; month?: number; day?: number } | undefined,
  y: number,
  m: number,
  day: number,
): boolean {
  return !!d && d.year === y && d.month === m && d.day === day;
}

function parseDateUtc(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y!, m!, d!];
}

function nextDayUtc(year: number, month: number, day: number): [number, number, number] {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + 1);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
}

/** Caps metadata at ~1KB serialized to prevent runaway storage growth. */
function capMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  const json = JSON.stringify(meta);
  if (json.length <= 1024) return meta;
  console.warn('[GoogleHealthProvider] metadata > 1KB, truncating');
  return { _truncated: true, _original_size: json.length };
}
