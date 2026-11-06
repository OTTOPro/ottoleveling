import type { PillarId } from '../d1';

export type HrvStatus = 'stable' | 'declining' | 'improving';
export type SleepStatus = 'severe' | 'mild' | 'none';
export type SleepCause = 'acute' | 'chronic' | 'both';
export type ReadingTrend = 'drought' | 'normal' | 'engaged';

/** Result of computeSleepDeficit - discriminated union enables format helper to pick the correct wording variant. */
export type SleepDeficit =
  | { status: 'none' }
  | {
      status: 'severe';
      cause: SleepCause;
      previousNightMinutes?: number;
      sevenDayAvgMinutes?: number;
    }
  | {
      status: 'mild';
      cause: SleepCause;
      previousNightMinutes?: number;
      sevenDayAvgMinutes?: number;
    };

/** Calibration signals surfaced into the {CALIBRATION_SIGNALS} placeholder. */
export interface CalibrationSignals {
  hrv: HrvStatus;
  sleep: SleepDeficit;
  reading: ReadingTrend;
  // Raw numbers preserved for format helper + debug surfacing
  hrvRecentAvg?: number;
  hrvBaselineAvg?: number;
  hrvDeltaPct?: number;
  sleepPreviousNightMinutes?: number;
  sleepSevenDayAvgMinutes?: number;
  episodeSaves7dFiltered?: number;
}

/** Bilan correlation line for the {PERFORMANCE_VS_PHYSIOLOGY} placeholder. */
export interface BilanCorrelation {
  pillar: PillarId;
  /** Completion-rate delta vs prior period, e.g., -0.15 = -15%. */
  completionRateDelta: number;
  /** Correlation summary line, e.g., "Body completion -15% ↔ sleep -23% (period vs prior)". */
  line: string;
}
