import { Hono } from 'hono';
import { z } from 'zod';
import type { Bindings } from '../index';
import { getAgent } from '../lib/agent';
import { recomputeLifetimeStats } from '../lib/lifetime-stats';
import { getLLMProvider } from '../lib/llm';
import { insertStatRewards } from '../lib/stat-rewards';
import { StatRewardSchema } from '../schemas/llm-response';

export const adminRouter = new Hono<{ Bindings: Bindings }>();

interface ResetBody {
  confirm?: unknown;
}

/**
 * POST /api/admin/reset - destructive dev-only reset.
 *
 * Wipes all transactional data:
 *   1. SystemAgent DO storage (focus, streaks, patterns, counters, scheduledEvents)
 *      - then re-seeds the 5 recurring alarm events + reschedules next alarm.
 *   2. D1: xp_events, completions, quests, focus_periods, daily_checkins, bilans
 *      - run as a single batch (atomic transaction per D1 spec). Also resets
 *      quest_templates.current_value -> starting_value and clears last_progressed_at.
 *   3. KV: every key under the `today:*` prefix (paginated).
 *
 * Preserved (seeded reference data + device state):
 *   - pillars, penalty_rules, objectives, push_subscriptions.
 *
 * Body: {confirm: true} REQUIRED - anything else returns 400 with the exact
 * error message "Pass {confirm: true} to confirm reset". The wording is part
 * of the contract, so we parse + check manually instead of using zValidator's
 * default error shape.
 */
adminRouter.post('/reset', async (c) => {
  let body: ResetBody;
  try {
    body = (await c.req.json<ResetBody>()) ?? {};
  } catch {
    return c.json({ error: 'Pass {confirm: true} to confirm reset' }, 400);
  }
  if (body.confirm !== true) {
    return c.json({ error: 'Pass {confirm: true} to confirm reset' }, 400);
  }

  // 1. DO reset - deleteAll + re-seed alarm events + re-arm next alarm.
  const agent = getAgent(c.env);
  await agent.resetState();

  // 2. D1 batch - single transaction per D1 spec.
  const batchResults = await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM xp_events'),
    c.env.DB.prepare('DELETE FROM completions'),
    c.env.DB.prepare('DELETE FROM quests'),
    c.env.DB.prepare('DELETE FROM focus_periods'),
    c.env.DB.prepare('DELETE FROM daily_checkins'),
    c.env.DB.prepare('DELETE FROM bilans'),
    c.env.DB.prepare(
      'UPDATE quest_templates SET current_value = starting_value, last_progressed_at = NULL',
    ),
  ]);

  const changesAt = (i: number): number => batchResults[i]?.meta?.changes ?? 0;

  // 3. KV cleanup - paginate through 'today:' prefix.
  let kvDeleted = 0;
  let cursor: string | undefined = undefined;

  while (true) {
    const listResult: KVNamespaceListResult<unknown, string> = await c.env.KV.list({
      prefix: 'today:',
      cursor,
    });
    for (const key of listResult.keys) {
      await c.env.KV.delete(key.name);
      kvDeleted++;
    }
    if (listResult.list_complete) break;
    cursor = listResult.cursor;
  }

  // 4. Preserved counts - separate read-only batch so the writes above remain
  // atomic together. Single-user app, no concurrency concerns.
  const preservedRows = await c.env.DB.batch<{ n: number }>([
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM pillars'),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM penalty_rules'),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM objectives'),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions'),
  ]);
  const countOf = (i: number): number => preservedRows[i]?.results?.[0]?.n ?? 0;

  return c.json({
    ok: true,
    reset_at: new Date().toISOString(),
    preserved: [
      `pillars (${countOf(0)})`,
      `penalty_rules (${countOf(1)})`,
      `objectives (${countOf(2)})`,
      `push_subscriptions (${countOf(3)})`,
    ],
    cleared: {
      xp_events: changesAt(0),
      completions: changesAt(1),
      quests: changesAt(2),
      focus_periods: changesAt(3),
      daily_checkins: changesAt(4),
      bilans: changesAt(5),
      do_storage: 'deleted',
      kv_today_cache: kvDeleted,
    },
    templates_reset: `current_value -> starting_value for ${changesAt(6)} templates`,
  });
});

/**
 * POST /api/admin/recompute-lifetime
 *
 * Manual one-shot trigger for recomputeLifetimeStats(). Used for initial
 * backfill (after the migration created 4 zero rows) and for force-recompute
 * if a bug ever puts the lifetime_stats table out of sync with xp_events /
 * completions / quests. Idempotent.
 *
 * Auth: x-dev-token (devTokenMiddleware). Same gate as /api/admin/reset.
 *
 * Response: { ok: true, rows: LifetimeStatsRow[], recomputed_at: ISO }.
 */
adminRouter.post('/recompute-lifetime', async (c) => {
  const rows = await recomputeLifetimeStats(c.env.DB);
  return c.json({
    ok: true,
    rows,
    recomputed_at: new Date().toISOString(),
  });
});

/**
 * POST /api/admin/auto-complete-now
 *
 * Manually triggers the auto-complete sweep for today. Same code path
 * as the post-sync and post-generation hooks. Useful for debugging and
 * for testing the auto-complete logic without waiting for a sync.
 *
 * Auth: x-dev-token (devTokenMiddleware).
 * Response: { ok: true, ran_at: ISO, attempted: number, completed: number }.
 */
adminRouter.post('/auto-complete-now', async (c) => {
  const stub = getAgent(c.env);
  const result = await stub.runAutoCompleteNow();
  return c.json({ ok: true, ran_at: new Date().toISOString(), ...result });
});

const BackfillBodySchema = z.object({
  batch_size: z.number().int().min(1).max(50).optional().default(20),
  dry_run: z.boolean().optional().default(false),
});

const BackfillLLMOutputSchema = z.array(
  z.object({
    completion_id: z.number().int().positive(),
    stats: z.array(StatRewardSchema).min(1).max(3),
  }),
);

/**
 * POST /api/admin/backfill-stat-rewards
 *
 * LLM-powered historical backfill of stat rewards for existing
 * completions that predate the stat_rewards table.
 *
 * Selects up to `batch_size` completed quests that have no non-FOCUS stat
 * rewards yet, sends a single batch call to the LLM, and INSERTs the results.
 * awarded_at = completion.completed_at (historical accuracy).
 *
 * Idempotent: WHERE id NOT IN (SELECT DISTINCT completion_id FROM stat_rewards
 *   WHERE stat_type != 'FOCUS') ensures already-backfilled rows are skipped.
 *
 * Body: { batch_size?: 20, dry_run?: false }
 * Response: { processed: N, has_more: boolean, tokens_used?: number }
 *
 * Auth: x-dev-token (devTokenMiddleware). Same gate as /api/admin/reset.
 */
adminRouter.post('/backfill-stat-rewards', async (c) => {
  let rawBody: unknown = {};
  try {
    rawBody = await c.req.json();
  } catch {
    // empty body is fine; use defaults
  }
  const parsed = BackfillBodySchema.safeParse(rawBody);
  const batchSize = parsed.success ? parsed.data.batch_size : 20;
  const dryRun = parsed.success ? parsed.data.dry_run : false;

  // Find completions that need backfill: status='completed', no non-FOCUS stat_rewards yet
  const completions = await c.env.DB.prepare(
    `SELECT c.id, c.completed_at, q.title, q.pillar_id
       FROM completions c
       JOIN quests q ON c.quest_id = q.id
       WHERE c.status = 'completed'
         AND c.id NOT IN (
           SELECT DISTINCT completion_id FROM stat_rewards WHERE stat_type != 'FOCUS'
         )
       ORDER BY c.id ASC
       LIMIT ?`,
  )
    .bind(batchSize)
    .all<{ id: number; completed_at: string; title: string; pillar_id: string }>();

  if (!completions.results || completions.results.length === 0) {
    return c.json({ processed: 0, has_more: false, message: 'no completions need backfill' });
  }

  const batch = completions.results;

  // Check if more completions need backfill after this batch
  const moreCheck = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM completions c
       WHERE c.status = 'completed'
         AND c.id NOT IN (
           SELECT DISTINCT completion_id FROM stat_rewards WHERE stat_type != 'FOCUS'
         )
         AND c.id > ?`,
  )
    .bind(batch[batch.length - 1]!.id)
    .first<{ n: number }>();
  const hasMore = (moreCheck?.n ?? 0) > 0;

  // Build the LLM prompt for batch extraction
  const systemPrompt = `Extract 1-3 Solo Leveling stat rewards per quest completion.
Stat types: END (Endurance), STR (Strength), FLEX (Flexibility), INT (Intelligence), WIS (Wisdom), CAP (Capital), CRAFT (Craftsmanship).
Pillar mapping defaults: END/STR/FLEX->body, INT/WIS->mind, CAP->finance, CRAFT->projects.
Do NOT emit FOCUS (that type is system-awarded separately).
Value: 1 = standard effort (default), 2 = above average, 3 = unusually high-effort.
Output: JSON array in the SAME ORDER as input: [{"completion_id": <id>, "stats": [{"type": "<type>", "value": <1-3>}, ...]}, ...]
Return ONLY the JSON array, no preamble.`;

  const userPrompt = JSON.stringify(
    batch.map((c) => ({
      completion_id: c.id,
      quest_title: c.title,
      pillar_id: c.pillar_id,
      completed_at: c.completed_at,
    })),
    null,
    2,
  );

  const llm = getLLMProvider(c.env);
  let rawText: string;
  try {
    rawText = await llm.complete(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { jsonMode: true },
    );
  } catch (err) {
    return c.json({ error: 'LLM call failed', detail: String(err) }, 500);
  }

  let llmOutput: z.infer<typeof BackfillLLMOutputSchema>;
  try {
    llmOutput = BackfillLLMOutputSchema.parse(JSON.parse(rawText));
  } catch (err) {
    return c.json(
      { error: 'LLM output parse failed', detail: String(err), raw: rawText.slice(0, 500) },
      500,
    );
  }

  if (dryRun) {
    return c.json({ processed: 0, has_more: hasMore, dry_run: true, preview: llmOutput });
  }

  // INSERT stat rewards
  const validCompletionIds = new Set(batch.map((b) => b.id));
  let processed = 0;
  for (const entry of llmOutput) {
    if (!validCompletionIds.has(entry.completion_id)) continue; // safety: only known ids
    const completionRow = batch.find((b) => b.id === entry.completion_id);
    if (!completionRow) continue;
    try {
      await insertStatRewards(
        c.env.DB,
        entry.completion_id,
        entry.stats,
        completionRow.completed_at, // historical accuracy: use completion's timestamp
      );
      processed++;
    } catch (err) {
      // Log but continue - partial batch is still progress
      console.error(`[backfill-stat-rewards] failed for completion ${entry.completion_id}:`, err);
    }
  }

  return c.json({ processed, has_more: hasMore });
});

/**
 * POST /api/admin/backfill-objective-workflows
 *
 * Spawn ObjectiveMilestoneWorkflow instances for existing active objectives
 * that never got one (objectives created before the workflow existed are not
 * picked up by the POST /api/objectives create hook).
 *
 * Idempotent: queries objective_id NOT IN (SELECT objective_id FROM objective_workflow_state).
 * Running twice produces no duplicate state rows.
 *
 * Auth: x-dev-token / Cloudflare Access JWT (same gate as /api/admin/reset).
 * Response: { ok: true, spawned: number, processed: number }
 */
adminRouter.post('/backfill-objective-workflows', async (c) => {
  // Find active objectives without a workflow state row yet.
  const result = await c.env.DB.prepare(
    `SELECT o.id, o.created_at, o.target_date, o.metadata
       FROM objectives o
       WHERE o.status = 'active' AND o.deleted_at IS NULL
         AND o.id NOT IN (SELECT objective_id FROM objective_workflow_state)`,
  ).all<{ id: number; created_at: string; target_date: string | null; metadata: string | null }>();

  let spawned = 0;
  const candidateCount = result.results?.length ?? 0;

  for (const obj of result.results ?? []) {
    if (!obj.target_date) continue;

    let parsedMeta: Record<string, unknown> | null = null;
    try {
      if (obj.metadata) parsedMeta = JSON.parse(obj.metadata) as Record<string, unknown>;
    } catch {
      /* malformed JSON - use defaults */
    }

    const phasesCount = extractPhasesFromObjectiveMeta(parsedMeta);
    const startDate = obj.created_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const instanceId = `objective-milestone-${obj.id}`;

    try {
      await c.env.OBJECTIVE_MILESTONE_WORKFLOW.create({
        id: instanceId,
        params: {
          objective_id: obj.id,
          start_date: startDate,
          target_date: obj.target_date,
          phases_count: phasesCount,
        },
      });
      await c.env.DB.prepare(
        `INSERT INTO objective_workflow_state (objective_id, workflow_run_id) VALUES (?, ?)`,
      )
        .bind(obj.id, instanceId)
        .run();
      spawned++;
    } catch (e) {
      // 'already exists' from Workflow API is expected when retrying idempotently.
      // For all other errors: log + continue so one failure doesn't block the rest.
      if (String(e).includes('already exists')) {
        // Workflow instance exists - ensure state row is present.
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO objective_workflow_state (objective_id, workflow_run_id) VALUES (?, ?)`,
        )
          .bind(obj.id, instanceId)
          .run();
      } else {
        console.error(`[backfill-objective-workflows] failed for objective ${obj.id}:`, e);
      }
    }
  }

  return c.json({ ok: true, spawned, processed: candidateCount });
});

// ─── Orchestration dashboard endpoints ────────────────────────────────────────

/**
 * GET /api/admin/orchestration/queue-depth
 *
 * Returns recent produce vs. consume counts from the DLQ tables as a queue-depth
 * proxy. Real-time queue depth requires the Cloudflare Queues HTTP API (bearer
 * token), which is not wired up. The DLQ tables track failed messages
 * and give the operator a sense of queue health.
 *
 * Also returns counts from both DLQ tables so the operator can see if messages
 * are backing up.
 */
adminRouter.get('/orchestration/queue-depth', async (c) => {
  const [llmDlq, eventsDlq] = await c.env.DB.batch<{ n: number }>([
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM llm_jobs_dlq`),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM events_dlq`),
  ]);
  return c.json({
    queues: [
      {
        name: 'ottoleveling-llm-jobs',
        dlq_count: llmDlq?.results?.[0]?.n ?? 0,
        note: 'DLQ count only - real-time depth requires Cloudflare Queues HTTP API',
      },
      {
        name: 'ottoleveling-events',
        dlq_count: eventsDlq?.results?.[0]?.n ?? 0,
        note: 'DLQ count only',
      },
    ],
  });
});

/**
 * GET /api/admin/orchestration/dlq
 *
 * Returns the top 10 messages from each DLQ table for operator inspection.
 * Ordered by failed_at DESC (most recent failures first).
 */
adminRouter.get('/orchestration/dlq', async (c) => {
  // Schema columns per migration 0017: id, message_body, error_message,
  // attempts, failed_at, original_queue. The "type" is inside the JSON
  // message_body - extract it server-side via SQLite json_extract so the
  // frontend keeps a stable {message_type, attempt_count} shape.
  const [llmDlqRows, eventsDlqRows] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT id,
              json_extract(message_body, '$.type') AS message_type,
              error_message,
              attempts AS attempt_count,
              failed_at,
              message_body
       FROM llm_jobs_dlq ORDER BY failed_at DESC LIMIT 10`,
    ),
    c.env.DB.prepare(
      `SELECT id,
              json_extract(message_body, '$.type') AS message_type,
              error_message,
              attempts AS attempt_count,
              failed_at,
              message_body
       FROM events_dlq ORDER BY failed_at DESC LIMIT 10`,
    ),
  ]);
  return c.json({
    llm_dlq: llmDlqRows?.results ?? [],
    events_dlq: eventsDlqRows?.results ?? [],
  });
});

/**
 * GET /api/admin/orchestration/workflows
 *
 * Returns all active (not-yet-completed) objective-milestone workflow instances
 * with their current phase and progress.
 */
adminRouter.get('/orchestration/workflows', async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT s.objective_id, s.workflow_run_id, s.current_phase,
              s.transitioned_at, s.completed_at, o.title
       FROM objective_workflow_state s
       JOIN objectives o ON s.objective_id = o.id
       WHERE s.completed_at IS NULL
       ORDER BY s.objective_id ASC`,
  ).all<{
    objective_id: number;
    workflow_run_id: string;
    current_phase: number;
    transitioned_at: string | null;
    completed_at: string | null;
    title: string;
  }>();
  return c.json({ active_objective_workflows: result?.results ?? [] });
});

/**
 * POST /api/admin/orchestration/dlq/retry/:id?queue=llm_jobs|events
 *
 * Replays a single DLQ message by re-sending it to the appropriate queue,
 * then deletes the DLQ row. The queue consumer will retry processing it.
 *
 * query param `queue` must be 'llm_jobs' or 'events'.
 */
adminRouter.post('/orchestration/dlq/retry/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id) || id <= 0) {
    return c.json({ error: 'invalid id' }, 400);
  }

  const queueName = c.req.query('queue');
  if (queueName !== 'llm_jobs' && queueName !== 'events') {
    return c.json({ error: "queue must be 'llm_jobs' or 'events'" }, 400);
  }

  const table = queueName === 'llm_jobs' ? 'llm_jobs_dlq' : 'events_dlq';
  const queue = queueName === 'llm_jobs' ? c.env.LLM_JOBS_QUEUE : c.env.EVENTS_QUEUE;

  const row = await c.env.DB.prepare(`SELECT message_body FROM ${table} WHERE id = ?`)
    .bind(id)
    .first<{ message_body: string }>();

  if (!row) {
    return c.json({ error: 'not found' }, 404);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try {
    body = JSON.parse(row.message_body);
  } catch {
    return c.json({ error: 'message_body is not valid JSON' }, 422);
  }

  await queue.send(body);
  await c.env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();

  return c.json({ ok: true, replayed_to: queueName });
});

/**
 * Extract phases_count from objective metadata JSON.
 * Shared between routes/objectives.ts create hook and this backfill endpoint.
 */
function extractPhasesFromObjectiveMeta(meta: Record<string, unknown> | null | undefined): number {
  if (!meta) return 4;
  const raw = meta['phases_count'];
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 12) {
    return raw;
  }
  return 4;
}
