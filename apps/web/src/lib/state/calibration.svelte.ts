import { getCalibrationCurrent } from '$lib/api/client';
import type { CalibrationSignals } from '$lib/api/types';

/**
 * Singleton state store for calibration signals.
 * Backs the [ CALIBRATION ] card in the /system STATUS section.
 */
class CalibrationState {
  signals = $state<CalibrationSignals | null>(null);
  computedAt = $state<string | null>(null);
  loading = $state(false);
  error = $state<string | null>(null);

  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await getCalibrationCurrent();
      this.signals = result.signals;
      this.computedAt = result.computed_at;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }
}

export const calibrationState = new CalibrationState();
