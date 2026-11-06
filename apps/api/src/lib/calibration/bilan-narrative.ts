/**
 * {PERFORMANCE_VS_PHYSIOLOGY} bilan section helper.
 *
 * Pairs the period's global completion rate with a fresh CalibrationSignals
 * snapshot at period_end and emits one of 5 narrative branches:
 *
 *   1. Aligned positive  - rate ≥ 65% + HRV stable/improving + sleep none
 *   2. Unsustainable     - rate ≥ 65% + HRV declining OR sleep not-none
 *   3. Aligned negative  - rate < 40% + HRV declining OR sleep not-none
 *   4. Steady-state      - rate in 40..65% range (physiology neutral or stressed)
 *   5. Insufficient data - no calibration data at all
 *
 * Returns a markdown subsection ready for insertion at the {PERFORMANCE_VS_PHYSIOLOGY}
 * position in prompts/bilan.md.
 */

import { buildCalibrationSignals } from './read';
import type { CalibrationSignals } from './types';

export interface PerformanceVsPhysiologyInput {
  /** ISO date YYYY-MM-DD - the START of the bilan period (inclusive). */
  periodStart: string;
  /** ISO date YYYY-MM-DD - the END of the bilan period (exclusive). */
  periodEnd: string;
  /** Period's global completion rate 0..1. */
  globalCompletionRate: number;
}

/**
 * Builds the {PERFORMANCE_VS_PHYSIOLOGY} bilan section.
 *
 * Queries calibration signals at `periodEnd` (the "snapshot date" for the
 * end-of-period physiological state) and compares them against the period's
 * aggregate completion rate.
 *
 * If D1 read fails or returns no data, returns the insufficient-data branch
 * (never throws - calibration is best-effort in bilans too).
 */
export async function formatPerformanceVsPhysiology(
  db: D1Database,
  input: PerformanceVsPhysiologyInput,
): Promise<string> {
  let signals: CalibrationSignals | null;
  try {
    signals = await buildCalibrationSignals(db, input.periodEnd);
  } catch {
    // Calibration is best-effort; don't void the bilan.
    signals = null;
  }

  return renderPerformanceVsPhysiology(input.globalCompletionRate, signals);
}

/**
 * Pure render helper - separated from D1 so unit tests can call it directly
 * without needing vitest-pool-workers.
 */
export function renderPerformanceVsPhysiology(
  globalCompletionRate: number,
  signals: CalibrationSignals | null,
): string {
  const header = '## Performance vs physiology';

  // Branch 5 - no calibration data
  if (signals == null) {
    return [header, '(insufficient calibration data - no recovery analysis possible)'].join('\n');
  }

  const rate = globalCompletionRate;
  const hrvDecl = signals.hrv === 'declining';
  const sleepStressed = signals.sleep.status !== 'none';

  // Branch 1 - aligned positive
  if (rate >= 0.65 && !hrvDecl && !sleepStressed) {
    const rateStr = pct(rate);
    const hrvNote = signals.hrv === 'improving' ? 'improving HRV' : 'stable HRV';
    return [header, `Performance held: rate ${rateStr} with ${hrvNote} and adequate sleep.`].join(
      '\n',
    );
  }

  // Branch 2 - unsustainable (high rate + physiology stressed)
  if (rate >= 0.65 && (hrvDecl || sleepStressed)) {
    const rateStr = pct(rate);
    const stressors: string[] = [];
    if (hrvDecl && signals.hrvDeltaPct != null) {
      stressors.push(`HRV declining ${pct(Math.abs(signals.hrvDeltaPct))}`);
    } else if (hrvDecl) {
      stressors.push('HRV declining');
    }
    if (sleepStressed) {
      const sleepStat = signals.sleep.status.toUpperCase();
      stressors.push(`sleep ${sleepStat}${signals.sleep.status === 'mild' ? ' chronic' : ''}`);
    }
    const stressorStr = stressors.join(' + ');
    return [
      header,
      `Performance up despite physiology: rate ${rateStr} but ${stressorStr} - sustaining on reserves.`,
    ].join('\n');
  }

  // Branch 3 - aligned negative (low rate + physiology stressed)
  if (rate < 0.4 && (hrvDecl || sleepStressed)) {
    const rateStr = pct(rate);
    const stressors: string[] = [];
    if (hrvDecl) stressors.push('HRV declining');
    if (sleepStressed) {
      const sleepStat = signals.sleep.status.toUpperCase();
      const cause =
        signals.sleep.status !== 'none' && 'cause' in signals.sleep
          ? ` ${signals.sleep.cause}`
          : '';
      stressors.push(`sleep ${sleepStat}${cause}`);
    }
    const stressorStr = stressors.join(' + ');
    return [
      header,
      `Performance dropped: rate ${rateStr}, ${stressorStr} - recover before next cycle.`,
    ].join('\n');
  }

  // Branch 4 - steady-state / mixed (40..65% OR low rate but physiology ok)
  const rateStr = pct(rate);
  const physiologyNote = hrvDecl
    ? ' Physiology under stress despite moderate performance.'
    : sleepStressed
      ? ' Sleep deficit flagged - monitor recovery.'
      : ' Physiology nominal.';
  return [header, `Steady-state performance: rate ${rateStr}.${physiologyNote}`].join('\n');
}

// ============================================================
// Internal helpers
// ============================================================

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}
