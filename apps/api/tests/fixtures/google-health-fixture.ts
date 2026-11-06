// Synthetic, shape-compatible Google Health API v4 responses for unit tests.
//
// The values are invented round numbers. The shapes follow the API's
// Discovery document; field names and string-encoded integers match what the
// live API returns.
//
// 2 of 5 metrics use dailyRollUp (POST):
//   POST https://health.googleapis.com/v4/users/me/dataTypes/{dataType}/dataPoints:dailyRollUp
//   Body: { "range": { "start": {date:{year,month,day}}, "end": {date:{...}} }, "windowSizeDays": 1 }
//   Response: { "rollupDataPoints": [{ "civilStartTime": {...}, "civilEndTime": {...}, <metric-specific union field> }] }
//   dataTypes: steps, heart-rate
//
// 3 of 5 metrics use the list method (GET):
//   GET https://health.googleapis.com/v4/users/me/dataTypes/{dataType}/dataPoints?pageSize=10
//   Response: { "dataPoints": [{ <type-specific nested object> }], "nextPageToken"?: string }
//   dataTypes: daily-resting-heart-rate, daily-heart-rate-variability, sleep
//   (Google rejects dailyRollUp for these - UNSUPPORTED_DATA_TYPE_ACTION,
//    allowed=[list, reconcile]. Sleep isn't in the dailyRollUp value union either.)

// --- POST :dailyRollUp responses ---

export const STEPS_ROLLUP_FIXTURE = {
  rollupDataPoints: [
    {
      civilStartTime: { year: 2026, month: 5, day: 29, hours: 0, minutes: 0, seconds: 0 },
      civilEndTime: { year: 2026, month: 5, day: 30, hours: 0, minutes: 0, seconds: 0 },
      // StepsRollupValue.countSum is a STRING-encoded int64 (NOT a `count` number)
      steps: { countSum: '8000' },
    },
  ],
};

export const HEART_RATE_ROLLUP_FIXTURE = {
  rollupDataPoints: [
    {
      civilStartTime: { year: 2026, month: 5, day: 29, hours: 0, minutes: 0, seconds: 0 },
      civilEndTime: { year: 2026, month: 5, day: 30, hours: 0, minutes: 0, seconds: 0 },
      // HeartRateRollupValue has FLAT fields, not nested under `beatsPerMinute`
      heartRate: { beatsPerMinuteAvg: 70, beatsPerMinuteMin: 50, beatsPerMinuteMax: 150 },
    },
  ],
};

// --- GET /dataPoints (list) responses ---

export const DAILY_RESTING_HR_LIST_FIXTURE = {
  dataPoints: [
    {
      dailyRestingHeartRate: {
        date: { year: 2026, month: 5, day: 29 },
        beatsPerMinute: '60', // string-encoded int
        dailyRestingHeartRateMetadata: { calculationMethod: 'SLEEP' },
      },
    },
  ],
};

export const DAILY_HRV_LIST_FIXTURE = {
  dataPoints: [
    {
      dailyHeartRateVariability: {
        date: { year: 2026, month: 5, day: 29 },
        averageHeartRateVariabilityMilliseconds: 50.5, // number (NOT string)
        entropy: 1.5,
        deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds: 55.5,
      },
    },
  ],
};

export const SLEEP_LIST_FIXTURE = {
  dataPoints: [
    {
      // Top-level field is `sleep` (NOT `sleepSession`)
      sleep: {
        interval: {
          startTime: '2026-05-29T23:00:00Z',
          endTime: '2026-05-30T07:00:00Z', // end-date matches when querying for 2026-05-30
        },
        type: 'STAGES',
        stages: [
          { startTime: '2026-05-29T23:00:00Z', endTime: '2026-05-30T07:00:00Z', type: 'LIGHT' },
        ],
        summary: {
          minutesInSleepPeriod: '480',
          minutesAfterWakeUp: '0',
          minutesToFallAsleep: '5',
          minutesAsleep: '465',
          minutesAwake: '15',
          stagesSummary: [
            { type: 'LIGHT', minutes: '270', count: '10' },
            { type: 'DEEP', minutes: '90', count: '5' },
            { type: 'REM', minutes: '105', count: '4' },
            { type: 'AWAKE', minutes: '15', count: '2' },
          ],
        },
      },
    },
  ],
};

export const EMPTY_ROLLUP_FIXTURE = { rollupDataPoints: [] };
export const EMPTY_LIST_FIXTURE = { dataPoints: [] };

export const TOKEN_FIXTURE = {
  access_token: 'ya29.test_access_token_value',
  expires_in: 3600,
  refresh_token: '1//test_refresh_token_value',
  scope:
    'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly https://www.googleapis.com/auth/googlehealth.sleep.readonly https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly https://www.googleapis.com/auth/googlehealth.profile.readonly',
  token_type: 'Bearer',
};

export const REFRESH_RESPONSE_FIXTURE = {
  access_token: 'ya29.refreshed_access_token',
  expires_in: 3600,
  scope: 'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  token_type: 'Bearer',
  // Note: refresh response usually does NOT include a new refresh_token
};
