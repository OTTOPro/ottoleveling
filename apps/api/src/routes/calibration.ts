import { Hono } from 'hono';
import type { Bindings } from '../index';
import { buildCalibrationSignals } from '../lib/calibration/read';

export const calibrationRouter = new Hono<{ Bindings: Bindings }>();

/**
 * GET /api/calibration/current
 *
 * Returns the latest calibration signals derived from daily_metrics and
 * library_save_events for today's date (UTC). Thin wrapper over
 * buildCalibrationSignals - no additional computation.
 *
 * Response:
 *   { signals: CalibrationSignals | null, computed_at: string }
 *
 * signals is null when there is no Google Health AND no Spotify data for
 * the relevant windows (i.e., both integrations have never synced, or data
 * is genuinely absent).
 */
calibrationRouter.get('/current', async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const signals = await buildCalibrationSignals(c.env.DB, today);
  return c.json({
    signals,
    computed_at: new Date().toISOString(),
  });
});
