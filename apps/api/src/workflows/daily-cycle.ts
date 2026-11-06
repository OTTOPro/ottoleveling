/**
 * apps/api/src/workflows/daily-cycle.ts
 *
 * DailyCycleWorkflow: one instance per calendar day (UTC), spawned by the DO's
 * daily_cycle_spawn alarm. Owns daily generation, the data-source syncs and the
 * day-close FOCUS check.
 *
 * Steps:
 *   1. morning-generation-dispatch   - queue.send generate_daily → LLM consumer
 *   2a. wait-google-health           - sleep until 06:30 UTC
 *   2b. google-health-sync           - queue.send google_health_sync → events consumer
 *   2c. wait-spotify                 - sleep until 06:31 UTC
 *   2d. spotify-sync                 - queue.send spotify_sync → events consumer
 *   3.  wait-evening-bilan           - sleep until 21:00 UTC
 *   4.  evening-bilan-check          - Sunday → queue.send generate_bilan_weekly; else no-op
 *   5.  wait-close                   - sleep until 23:59 UTC
 *   6.  close                        - workflowCloseDay DO RPC (FOCUS check + cycle complete)
 */
import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import type { Bindings } from '../index';

export interface DailyCycleParams {
  /** YYYY-MM-DD UTC date this workflow instance covers. */
  date: string;
}

export class DailyCycleWorkflow extends WorkflowEntrypoint<Bindings, DailyCycleParams> {
  override async run(event: WorkflowEvent<DailyCycleParams>, step: WorkflowStep): Promise<void> {
    const { date } = event.payload;

    // Helper: build a UTC Date from date + time suffix.
    const dateObj = (suffix: string): Date => new Date(`${date}T${suffix}Z`);

    // ── Step 1: morning generation dispatch ──────────────────────────────────
    // Send a generate_daily message to the LLM jobs queue. The consumer worker
    // picks it up, calls generateDailyFromQueue(date), and writes the quests
    // to D1. DO stays reactive (<100ms) - no inline Groq call.
    await step.do('morning-generation-dispatch', async () => {
      await this.env.LLM_JOBS_QUEUE.send({ type: 'generate_daily', date });
      try {
        this.env.ANALYTICS?.writeDataPoint({
          blobs: ['ottoleveling-daily-cycle', 'morning-generation-dispatch', 'success'],
          indexes: ['daily-cycle'],
        });
      } catch {
        /* analytics failure is non-fatal */
      }
    });

    // ── Step 2a-2d: data source syncs (offset to avoid thundering-herd) ─────
    // Google Health targets yesterday's data; Spotify targets today's snapshot.
    // 1-minute stagger for sequencing visibility + independent failure isolation.
    await step.sleepUntil('wait-google-health', dateObj('06:30:00'));

    await step.do('google-health-sync', async () => {
      await this.env.EVENTS_QUEUE.send({ type: 'google_health_sync', reason: 'scheduled' });
    });

    await step.sleepUntil('wait-spotify', dateObj('06:31:00'));

    await step.do('spotify-sync', async () => {
      await this.env.EVENTS_QUEUE.send({ type: 'spotify_sync', reason: 'scheduled' });
    });

    // ── Step 3-4: evening bilan check (Sunday only) ──────────────────────────
    await step.sleepUntil('wait-evening-bilan', dateObj('21:00:00'));

    await step.do('evening-bilan-check', async () => {
      // UTC day-of-week: 0 = Sunday
      const day = new Date(`${date}T00:00:00Z`).getUTCDay();
      if (day === 0) {
        // Sunday: dispatch weekly bilan generation via the LLM jobs queue.
        await this.env.LLM_JOBS_QUEUE.send({ type: 'generate_bilan_weekly', week_start: date });
        try {
          this.env.ANALYTICS?.writeDataPoint({
            blobs: ['ottoleveling-daily-cycle', 'evening-bilan-check', 'weekly-dispatched'],
            indexes: ['daily-cycle'],
          });
        } catch {
          /* analytics failure is non-fatal */
        }
      }
      // Weekdays: no per-day evening bilan.
    });

    // ── Step 5-6: day close ──────────────────────────────────────────────────
    // Sleep until 23:59 UTC to allow user-driven completions to accumulate,
    // then run the FOCUS award check (≥3 distinct pillars completed today).
    await step.sleepUntil('wait-close', dateObj('23:59:00'));

    await step.do('close', async () => {
      const stub = this.env.SYSTEM_AGENT.get(this.env.SYSTEM_AGENT.idFromName('main'));
      await stub.workflowCloseDay(date);
      try {
        this.env.ANALYTICS?.writeDataPoint({
          blobs: ['ottoleveling-daily-cycle', 'close', 'success'],
          indexes: ['daily-cycle'],
        });
      } catch {
        /* analytics failure is non-fatal */
      }
    });
  }
}
