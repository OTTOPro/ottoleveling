import type { CalibrationSignals, SleepDeficit } from './types';

/**
 * Renders the {CALIBRATION_SIGNALS} placeholder.
 *
 * Format (4-6 lines, one per signal):
 *   ## Calibration signals (derived)
 *   - HRV: <status> (recent <X>ms vs baseline <Y>ms, <Δ>% delta)
 *   - Sleep: <wording variant - see below>
 *   - Reading: <status> (<N> episode saves last 7d after filter)
 *
 * The sleep line uses these LOCKED variants (sentinel-tested):
 *   SEVERE both:           "Sleep: SEVERE (acute + chronic, X min last night, Y min avg)"
 *   SEVERE acute only:     "Sleep: SEVERE (acute deficit, X min last night)"
 *   SEVERE chronic only:   "Sleep: SEVERE (chronic deficit, Y min 7-day avg)"
 *   MILD both:             "Sleep: MILD (X min last night, Y min avg - cap difficulty)"
 *   MILD acute only:       "Sleep: MILD (acute deficit, X min last night - cap difficulty)"
 *   MILD chronic only:     "Sleep: MILD (chronic deficit, Y min avg - cap difficulty)"
 *   NONE:                  "Sleep: NONE"
 *
 * Empty case (no metrics at all): "(no calibration signals available - insufficient data)"
 *
 * SENTINEL: this helper MUST NEVER emit a "min today" or "min listened" string -
 * that's PODCAST_LISTENING_SEMANTICS (strictness rule 7) hygiene. Unit test
 * enforces via .not.toMatch(/\d+\s*min today/) on every rendered case.
 */
export function formatCalibrationSignals(signals: CalibrationSignals | null): string {
  if (signals == null) return '(no calibration signals available - insufficient data)';

  const lines: string[] = ['## Calibration signals (derived)'];

  // HRV line
  if (
    signals.hrvRecentAvg != null &&
    signals.hrvBaselineAvg != null &&
    signals.hrvDeltaPct != null
  ) {
    const pct = (signals.hrvDeltaPct * 100).toFixed(0);
    const sign = signals.hrvDeltaPct >= 0 ? '+' : '';
    lines.push(
      `- HRV: ${signals.hrv} (recent ${signals.hrvRecentAvg.toFixed(0)}ms vs baseline ${signals.hrvBaselineAvg.toFixed(0)}ms, ${sign}${pct}% delta)`,
    );
  } else {
    lines.push(`- HRV: ${signals.hrv} (insufficient data)`);
  }

  // Sleep line - locked wording variants
  lines.push(`- ${formatSleepLine(signals.sleep)}`);

  // Reading line
  const saves = signals.episodeSaves7dFiltered ?? 0;
  lines.push(
    `- Reading: ${signals.reading} (${saves} episode save${saves === 1 ? '' : 's'} last 7d after filter)`,
  );

  return lines.join('\n');
}

function formatSleepLine(sleep: SleepDeficit): string {
  if (sleep.status === 'none') return 'Sleep: NONE';

  // Round minute values to nearest integer for readable prompt output.
  const night =
    sleep.previousNightMinutes != null ? Math.round(sleep.previousNightMinutes) : undefined;
  const avg = sleep.sevenDayAvgMinutes != null ? Math.round(sleep.sevenDayAvgMinutes) : undefined;

  if (sleep.status === 'severe') {
    if (sleep.cause === 'both' && night != null && avg != null) {
      return `Sleep: SEVERE (acute + chronic, ${night} min last night, ${avg} min avg)`;
    }
    if (sleep.cause === 'acute' && night != null) {
      return `Sleep: SEVERE (acute deficit, ${night} min last night)`;
    }
    if (sleep.cause === 'chronic' && avg != null) {
      return `Sleep: SEVERE (chronic deficit, ${avg} min 7-day avg)`;
    }
    return 'Sleep: SEVERE (insufficient data)';
  }

  // MILD
  if (sleep.cause === 'both' && night != null && avg != null) {
    return `Sleep: MILD (${night} min last night, ${avg} min avg - cap difficulty)`;
  }
  if (sleep.cause === 'acute' && night != null) {
    return `Sleep: MILD (acute deficit, ${night} min last night - cap difficulty)`;
  }
  if (sleep.cause === 'chronic' && avg != null) {
    return `Sleep: MILD (chronic deficit, ${avg} min avg - cap difficulty)`;
  }
  return 'Sleep: MILD (insufficient data - cap difficulty)';
}
