/**
 * apps/api/src/workflows/objective-milestone.ts
 *
 * ObjectiveMilestoneWorkflow: one long-running instance per active objective
 * with a target_date. Divides the objective's duration into equal phases and
 * fires a phase-transition RPC to the DO at the end of each phase.
 *
 * Example: 8-week running program (phases_count=4):
 *   Phase 1 end = start + 2 weeks → step 1 wakes, fires phase 1 transition
 *   Phase 2 end = start + 4 weeks → step 2 wakes, fires phase 2 transition
 *   Phase 3 end = start + 6 weeks → step 3 wakes, fires phase 3 transition
 *   Phase 4 end = target_date     → step 4 wakes, fires phase 4 transition
 *   Close step                    → marks workflow complete in D1
 *
 * Phases count is extracted from objective.notes JSON ({ "phases_count": N })
 * or defaults to 4. Min phases = 1, max = 12.
 */
import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import type { Bindings } from '../index';

export interface ObjectiveMilestoneParams {
  /** FK reference to objectives.id */
  objective_id: number;
  /** YYYY-MM-DD start of the objective (created_at date or explicit start) */
  start_date: string;
  /** YYYY-MM-DD target / deadline of the objective */
  target_date: string;
  /** Number of milestone phases to divide the objective into (1-12, default 4) */
  phases_count: number;
}

export class ObjectiveMilestoneWorkflow extends WorkflowEntrypoint<
  Bindings,
  ObjectiveMilestoneParams
> {
  override async run(
    event: WorkflowEvent<ObjectiveMilestoneParams>,
    step: WorkflowStep,
  ): Promise<void> {
    const { objective_id, start_date, target_date, phases_count } = event.payload;

    const startMs = new Date(`${start_date}T00:00:00Z`).getTime();
    const endMs = new Date(`${target_date}T23:59:59Z`).getTime();
    const totalDuration = endMs - startMs;

    if (totalDuration <= 0) {
      console.warn(
        `[ObjectiveMilestoneWorkflow] objective ${objective_id}: target_date <= start_date, skipping phases`,
      );
      return;
    }

    const phaseMs = Math.floor(totalDuration / phases_count);

    // Fire one step per phase. step.sleepUntil is durable - workflow instance
    // persists through reboots + restarts.
    for (let phase = 1; phase <= phases_count; phase++) {
      const phaseEnd = new Date(startMs + phase * phaseMs);

      await step.sleepUntil(`phase-${phase}-end`, phaseEnd);

      await step.do(`phase-${phase}-transition`, async () => {
        const stub = this.env.SYSTEM_AGENT.get(this.env.SYSTEM_AGENT.idFromName('main'));
        await stub.objectivePhaseTransition(objective_id, phase, phases_count);
        try {
          this.env.ANALYTICS?.writeDataPoint({
            blobs: ['ottoleveling-objective-milestone', `phase-${phase}-transition`, 'success'],
            doubles: [phase, phases_count],
            indexes: ['objective-milestone'],
          });
        } catch {
          /* analytics failure is non-fatal */
        }
      });
    }

    // Close: mark workflow complete in objective_workflow_state.
    await step.do('close', async () => {
      await this.env.DB.prepare(
        `UPDATE objective_workflow_state SET completed_at = datetime('now') WHERE objective_id = ?`,
      )
        .bind(objective_id)
        .run();
      console.log(
        `[ObjectiveMilestoneWorkflow] objective ${objective_id} workflow complete (${phases_count} phases)`,
      );
    });
  }
}
