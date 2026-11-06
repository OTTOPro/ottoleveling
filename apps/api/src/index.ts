import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { DurableObject } from 'cloudflare:workers';
// Cloudflare Workflows (re-exported for wrangler bundle discovery)
export { DailyCycleWorkflow } from './workflows/daily-cycle';
export { ObjectiveMilestoneWorkflow } from './workflows/objective-milestone';
import { accessMiddleware } from './lib/auth-access';
import { healthRouter } from './routes/health';
import { objectivesRouter } from './routes/objectives';
import { questsRouter } from './routes/quests';
import { statsRouter } from './routes/stats';
import { focusRouter } from './routes/focus';
import { stateRouter } from './routes/state';
import { templatesRouter } from './routes/templates';
import { bilansRouter } from './routes/bilans';
import { checkinsRouter } from './routes/checkins';
import { pushPublicRouter, pushAuthRouter } from './routes/push';
import { adminRouter } from './routes/admin';
import { achievementsRouter } from './routes/achievements';
import { arcsRouter } from './routes/arcs';
import { dataSourcesPublicRouter, dataSourcesAuthedRouter } from './routes/data-sources';
import { sourcesRouter } from './routes/sources';
import { calibrationRouter } from './routes/calibration';
import { statsAnalyticsRouter } from './routes/stats-analytics';
import { activeProjectsRouter } from './routes/active-projects';
import { getActiveProjects } from './lib/active-projects';
import {
  getOrInitState,
  saveState,
  bumpLlmCallCounter,
  emptyState,
  pushRecentUnlocks,
  type CurrentFocus,
  type DetectedPattern,
  type FocusHorizon,
  type PillarId,
  type SystemAgentState,
} from './do/state';
import { evaluateOnCompletion, evaluateOnBilan } from './lib/achievements/evaluate';
import { emptyStreak, streakWithOpportunityCheck, type PillarStreak } from './lib/streak';
import { seedInitialEvents, scheduleNextAlarm, rescheduleEvent } from './do/alarms';
import { penaltyAmount, type Difficulty } from './lib/penalty';
import type { CompletionRow, QuestRow, QuestTemplateRow } from './lib/d1';
import type { CreateTemplate, UpdateTemplate } from './schemas/templates';
import { getLLMProvider } from './lib/llm';
import { getPushSender } from './lib/push-sender';
import { QUEST_GENERATION_PROMPT, BILAN_PROMPT, renderPrompt } from './lib/llm/prompts';
import {
  countMissedOpportunities,
  getActiveObjectives,
  getActiveTemplatesForDay,
  getLatestCheckin,
  getPillarLevels,
  getRecentPerformance,
  getTemplateContraindicationRows,
} from './lib/d1-reads';
import {
  forbiddenPatternsFromProfile,
  forbiddenPatternsFromTemplates,
  validateQuests,
} from './lib/quest-validator';
import { getLifetimeStats, recomputeLifetimeStats } from './lib/lifetime-stats';
import { getRecentAchievements, getClosestToThreshold } from './lib/achievements/evaluate';
import { buildGenerationContext } from './do/generation-context';
import { readPlayerConfig } from './lib/player';
import { allowedWebOrigins } from './lib/web-origin';
import {
  GenerationResponseSchema,
  StatRewardSchema,
  type GenerationResponse,
} from './schemas/llm-response';
import { BilanResponseSchema, type BilanResponse } from './schemas/bilan-response';
import {
  getBilanStats,
  getFocusHistoryInPeriod,
  getPreviousBilan,
  countTemplateAttemptsSince,
  type BilanStatsInput,
} from './lib/d1-reads-bilan';
import { buildBilanContext, type PeriodType } from './do/bilan-context';
import {
  detectPatterns,
  prunePatterns,
  type PatternInput,
  type PillarPatternData,
} from './lib/patterns';
import { weeklyPeriodFor, monthlyPeriodFor, yearlyPeriodFor } from './lib/periods';
import { evaluateProgression, type ProgressionRule } from './lib/template-progression';
import { invalidateTodayCache } from './lib/cache';
import { getActiveArcs, checkExpiredArcs, evaluateNewProposal } from './lib/arcs/evaluate';
import { startArc } from './lib/arcs/lifecycle';
import { getDataSourceProvider } from './lib/data-sources/registry';
import { encrypt, decrypt } from './lib/data-sources/encryption';
import {
  getDataSource,
  upsertDailyMetric,
  recordSyncResult,
  getObjectiveMetrics,
} from './lib/data-sources/d1-reads';
import {
  upsertLibrarySaveEvent,
  getCurrentLibrarySaves,
} from './lib/data-sources/library-save-events';
import { getExcludedShowUris } from './lib/data-sources/spotify-show-filters';
import type { ProviderName, SyncStatus } from './lib/data-sources/types';
import {
  runAutoCompleteAfterSync,
  runAutoCompleteAfterGeneration,
} from './lib/auto-complete/runner';
import { insertStatRewards } from './lib/stat-rewards';
import { getYesterdayPillarSummary } from './lib/yesterday-summary';
import { instrumentD1, flushInstrumentation } from './lib/d1-instrument';
import { buildCalibrationSignals } from './lib/calibration/read';
import { formatPerformanceVsPhysiology } from './lib/calibration/bilan-narrative';

export type Bindings = {
  DB: D1Database;
  KV: KVNamespace;
  SYSTEM_AGENT: DurableObjectNamespace<SystemAgent>;
  DEV_TOKEN: string;
  GROQ_API_KEY: string;
  LLM_PROVIDER: 'groq' | 'mock';
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  PUSH_PROVIDER: 'real' | 'mock';
  ENV: string;
  // Player configuration (see lib/player.ts). All optional.
  PLAYER_NAME?: string;
  PLAYER_PROFILE?: string;
  DAY_JOB_EXCLUSIONS?: string;
  // Comma-separated list of web origins allowed by CORS and used as the
  // redirect target after OAuth. Example: https://app.example.com
  WEB_ORIGIN?: string;
  // Google Health OAuth + token encryption.
  GOOGLE_HEALTH_CLIENT_ID: string;
  GOOGLE_HEALTH_CLIENT_SECRET: string;
  GOOGLE_HEALTH_REDIRECT_URI: string;
  ENCRYPTION_KEY: string;
  // Spotify OAuth.
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
  SPOTIFY_REDIRECT_URI: string;
  // Cloudflare Access JWT validation.
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: string;
  CLOUDFLARE_ACCESS_AUD: string;
  CLOUDFLARE_ACCESS_ALLOWED_EMAIL: string;
  // LLM model var (used by /api/config).
  LLM_MODEL: string;
  // Cloudflare Queues (producers bound in wrangler.toml).
  LLM_JOBS_QUEUE: Queue<import('./lib/queue-types').LlmJobMessage>;
  EVENTS_QUEUE: Queue<import('./lib/queue-types').EventMessage>;
  // Analytics Engine.
  ANALYTICS: AnalyticsEngineDataset;
  // Cloudflare Workflows.
  DAILY_CYCLE_WORKFLOW: Workflow;
  OBJECTIVE_MILESTONE_WORKFLOW: Workflow;
};

/** Reported by GET /api/config. Keep in sync with package.json. */
const API_VERSION = '0.1.0';

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', logger());

app.use(
  '/api/*',
  cors({
    origin: (origin, c) => (allowedWebOrigins(c.env).includes(origin) ? origin : null),
    allowHeaders: ['Content-Type', 'x-dev-token', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  }),
);

// Public route - health is intentionally unprotected for uptime checks.
app.route('/api/health', healthRouter);

// Public - vapid-key is needed by the frontend BEFORE the dev-token check
// (the frontend needs it to construct the subscription request).
app.route('/api/push', pushPublicRouter);

// Public - OAuth authorize + callback for data sources cannot carry the
// dev-token header (Google's 302 redirect strips arbitrary headers).
app.route('/api/data-sources', dataSourcesPublicRouter);

// Protect everything else (preflight OPTIONS bypasses this via CORS middleware above).
// accessMiddleware: Cloudflare Access JWT preferred; x-dev-token fallback only outside production.
app.use('/api/*', accessMiddleware());

// Server-side config (version + llm_model) for the /system footer.
app.get('/api/config', (c) => {
  return c.json({
    version: API_VERSION,
    llm_model: c.env.LLM_MODEL,
  });
});

// Protected routes.
app.route('/api/objectives', objectivesRouter);
app.route('/api/quests', questsRouter);
app.route('/api/stats', statsRouter);
app.route('/api/focus', focusRouter);
app.route('/api/state', stateRouter);
app.route('/api/templates', templatesRouter);
app.route('/api/bilans', bilansRouter);
app.route('/api/checkins', checkinsRouter);
app.route('/api/push', pushAuthRouter);
app.route('/api/admin', adminRouter);
app.route('/api/achievements', achievementsRouter);
app.route('/api/arcs', arcsRouter);
app.route('/api/data-sources', dataSourcesAuthedRouter);
app.route('/api/sources', sourcesRouter);
app.route('/api/calibration', calibrationRouter);
app.route('/api/stats', statsAnalyticsRouter);
app.route('/api/projects', activeProjectsRouter);

app.onError((err, c) => {
  console.error('unhandled error', err);
  return c.json({ error: 'internal_error', message: err.message }, 500);
});

export default app;

export type RecordCompletionResult =
  | { ok: true; completion: CompletionRow }
  | { ok: false; error: 'quest_not_found' | 'already_completed' | 'insert_failed' };

export type ProgressionLogEntry =
  | { template_id: number; action: 'progress'; reason: string; from: number; to: number }
  | { template_id: number; action: 'regress'; reason: string; from: number; to: number }
  | { template_id: number; action: 'none'; reason: string } // rule fired but data didn't meet threshold
  | {
      template_id: number;
      action: 'skipped';
      reason: 'rule_type_none' | 'progression_rule_parse_error';
    };

export class SystemAgent extends DurableObject<Bindings> {
  // ----- Read-only RPC -----

  async getState(): Promise<SystemAgentState> {
    return getOrInitState(this.ctx.storage);
  }

  async getFocus(): Promise<CurrentFocus | null> {
    const state = await getOrInitState(this.ctx.storage);
    return state.currentFocus;
  }

  // ----- Mutating RPC -----

  async setFocus(pillarId: PillarId, horizon: FocusHorizon): Promise<CurrentFocus> {
    const state = await getOrInitState(this.ctx.storage);
    const now = new Date().toISOString();

    // Close any open period in D1.
    await this.env.DB.prepare(`UPDATE focus_periods SET ended_at = ? WHERE ended_at IS NULL`)
      .bind(now)
      .run();

    // Open a new period.
    await this.env.DB.prepare(
      `INSERT INTO focus_periods (pillar_id, horizon, started_at) VALUES (?, ?, ?)`,
    )
      .bind(pillarId, horizon, now)
      .run();

    // Update in-memory state.
    const newFocus: CurrentFocus = { pillarId, horizon, startedAt: now };
    state.currentFocus = newFocus;

    // Seed initial alarms on first-ever state mutation.
    if (state.scheduledEvents.length === 0) {
      state.scheduledEvents = seedInitialEvents();
    }

    await saveState(this.ctx.storage, state);
    await scheduleNextAlarm(state.scheduledEvents, this.ctx.storage);

    return newFocus;
  }

  /**
   * Destructive reset. Wipes DO storage entirely (focus, streaks, patterns,
   * counters, scheduled events queue), then re-seeds the 5 recurring alarm
   * events + re-arms the next alarm so the system continues normal operation
   * after reset. Used by POST /api/admin/reset (dev-only).
   */
  async resetState(): Promise<void> {
    await this.ctx.storage.deleteAll();
    const fresh = emptyState();
    fresh.scheduledEvents = seedInitialEvents();
    await saveState(this.ctx.storage, fresh);
    await scheduleNextAlarm(fresh.scheduledEvents, this.ctx.storage);
  }

  /**
   * Admin/debug helper. Manually triggers the auto-complete sweep
   * for today. Same code path as the sync + generation hooks.
   */
  async runAutoCompleteNow(): Promise<{ attempted: number; completed: number }> {
    const today = new Date().toISOString().slice(0, 10);
    const state = await getOrInitState(this.ctx.storage);
    const result = await runAutoCompleteAfterSync(this.env.DB, this.env.KV, state, today);
    if (result.completed > 0) {
      await saveState(this.ctx.storage, state);
    }
    return { attempted: result.attempted, completed: result.completed };
  }

  async recordCompletion(
    questId: number,
    action: 'complete' | 'fail' | 'skip',
    notes: string | null,
    todayOverride?: string,
  ): Promise<RecordCompletionResult> {
    const quest = await this.env.DB.prepare('SELECT * FROM quests WHERE id = ?')
      .bind(questId)
      .first<QuestRow>();
    if (!quest) return { ok: false, error: 'quest_not_found' };

    const existing = await this.env.DB.prepare('SELECT id FROM completions WHERE quest_id = ?')
      .bind(questId)
      .first();
    if (existing) return { ok: false, error: 'already_completed' };

    const status = action === 'complete' ? 'completed' : action === 'fail' ? 'failed' : 'skipped';
    const amount =
      action === 'complete'
        ? quest.xp_value
        : penaltyAmount(
            quest.xp_value,
            quest.difficulty as Difficulty,
            action === 'fail' ? 'fail' : 'skip',
          );
    const sourceType = action === 'complete' ? 'quest_completed' : 'penalty';
    const description = `Quest ${status}: ${quest.title}`;

    const batchResults = await this.env.DB.batch([
      this.env.DB.prepare(
        'INSERT INTO completions (quest_id, status, xp_awarded, notes) VALUES (?, ?, ?, ?) RETURNING *',
      ).bind(questId, status, amount, notes),
      this.env.DB.prepare(
        `INSERT INTO xp_events (pillar_id, amount, source_type, source_id, description)
           VALUES (?, ?, ?, ?, ?)`,
      ).bind(quest.pillar_id, amount, sourceType, questId, description),
    ]);

    const completionRow = batchResults[0]?.results?.[0] as CompletionRow | undefined;
    if (!completionRow) return { ok: false, error: 'insert_failed' };

    // Invalidate today's KV cache. The mutation may not be on today's quest,
    // but the cheapest correct policy is to invalidate for the quest's scheduled date.
    await invalidateTodayCache(this.env.KV, quest.scheduled_for);

    // Streak update only on successful completion.
    if (action === 'complete') {
      const state = await getOrInitState(this.ctx.storage);
      const today = todayOverride ?? new Date().toISOString().slice(0, 10);
      const pillarId = quest.pillar_id as PillarId;
      const currentStreak: PillarStreak = state.streaks[pillarId] ?? emptyStreak();

      // Opportunity-aware streak model: count quests assigned
      // to this pillar in the gap days (strictly between lastSuccess and today)
      // that have NO successful completion. Zero missed opportunities means all
      // gap days were neutral (no quests at all), and the streak survives.
      let missedOpportunities = 0;
      if (currentStreak.lastSuccessDate && currentStreak.lastSuccessDate < today) {
        missedOpportunities = await countMissedOpportunities(
          this.env.DB,
          pillarId,
          currentStreak.lastSuccessDate,
          today,
        );
      }

      state.streaks[pillarId] = streakWithOpportunityCheck(
        currentStreak,
        today,
        missedOpportunities,
      );
      await saveState(this.ctx.storage, state);

      // Arc-step advancement on a successful arc-tagged completion.
      // Wrapped in try/catch so an arc failure doesn't void the completion itself.
      if (quest.arc_id != null) {
        const questArcId = quest.arc_id;
        try {
          // Increment completed_steps atomically (UPDATE-guarded by status='active').
          await this.env.DB.prepare(
            `UPDATE quest_arcs SET completed_steps = completed_steps + 1 WHERE id = ? AND status = 'active'`,
          )
            .bind(questArcId)
            .run();

          // Re-read to check for final-step transition.
          const arcRow = await this.env.DB.prepare(
            `SELECT id, pillar_id, total_steps, completed_steps, total_xp_reward, title, status FROM quest_arcs WHERE id = ?`,
          )
            .bind(questArcId)
            .first<{
              id: number;
              pillar_id: string;
              total_steps: number;
              completed_steps: number;
              total_xp_reward: number;
              title: string;
              status: string;
            }>();

          if (
            arcRow &&
            arcRow.status === 'active' &&
            arcRow.completed_steps >= arcRow.total_steps
          ) {
            // Final step - atomic transition + bonus xp_event.
            const nowIso = new Date().toISOString();
            await this.env.DB.batch([
              this.env.DB.prepare(
                `UPDATE quest_arcs SET status = 'completed', completed_at = ? WHERE id = ?`,
              ).bind(nowIso, arcRow.id),
              this.env.DB.prepare(
                `INSERT INTO xp_events (pillar_id, amount, source_type, source_id, description)
                 VALUES (?, ?, 'arc_completion', ?, ?)`,
              ).bind(
                arcRow.pillar_id,
                arcRow.total_xp_reward,
                arcRow.id,
                `Arc completed: ${arcRow.title}`,
              ),
            ]);

            // Decrement the DO cached counter.
            state.activeArcCount = Math.max(0, (state.activeArcCount ?? 0) - 1);
            await saveState(this.ctx.storage, state);
          }
        } catch (err) {
          console.error('[recordCompletion] arc advancement failed:', err);
        }
      }

      // Evaluate achievements AFTER completion + streak + saveState.
      // Wrapped in try/catch so an evaluator failure does NOT void the completion.
      try {
        const unlocks = await evaluateOnCompletion(this.env.DB, pillarId, state);
        if (unlocks.length > 0) {
          pushRecentUnlocks(state, unlocks);
          await saveState(this.ctx.storage, state);
        }
      } catch (err) {
        console.error('[SystemAgent.recordCompletion] evaluateOnCompletion failed:', err);
      }

      // Stat rewards: read quest.metadata._stats (LLM-emitted) and INSERT.
      // Wrapped in try/catch - failure does NOT void the completion.
      try {
        const questMeta = quest.metadata
          ? (JSON.parse(quest.metadata) as Record<string, unknown>)
          : null;
        const rawStats = questMeta?._stats;
        if (Array.isArray(rawStats) && rawStats.length > 0) {
          const validated = rawStats
            .map((s) => StatRewardSchema.safeParse(s))
            .filter((r) => r.success)
            .map(
              (r) =>
                (
                  r as {
                    success: true;
                    data: {
                      type: 'END' | 'STR' | 'FLEX' | 'INT' | 'WIS' | 'CAP' | 'CRAFT';
                      value: number;
                    };
                  }
                ).data,
            );
          if (validated.length > 0) {
            await insertStatRewards(
              this.env.DB,
              completionRow.id,
              validated,
              completionRow.completed_at,
            );
          }
        }
      } catch (err) {
        console.error('[StatRewards] insertStatRewards failed:', err);
      }

      // FOCUS is NOT awarded here: the DailyCycleWorkflow 'close' step
      // (workflowCloseDay, 23:59 UTC) is the single FOCUS award path, so the
      // check sees the whole day's completions.
    }

    // Dispatch auto-complete re-check via events queue
    // (best-effort: a queue dispatch failure must NOT void the completion).
    try {
      const completionDate = quest.scheduled_for;
      await this.env.EVENTS_QUEUE.send({ type: 'auto_complete_check', date: completionDate });
    } catch (queueErr) {
      console.error('[recordCompletion] EVENTS_QUEUE dispatch failed (non-fatal):', queueErr);
    }

    return { ok: true, completion: completionRow };
  }

  // ----- Data sources RPC -----

  /**
   * Pulls daily metrics from the named provider for the given date
   * (defaults to yesterday UTC). Handles 401 with one refresh attempt; if
   * refresh fails, marks status=reauth_required. Persists metrics via
   * upsertDailyMetric (idempotent). Updates data_sources.last_sync_*.
   * Returns the count of metrics persisted + the final sync status.
   */
  async syncDataSource(
    providerName: ProviderName,
    dateOverride?: string,
  ): Promise<{ metrics_persisted: number; sync_status: SyncStatus; error_message?: string }> {
    const date = dateOverride ?? yesterdayUtc();
    const ds = await getDataSource(this.env.DB, providerName);
    if (!ds)
      return { metrics_persisted: 0, sync_status: 'failed', error_message: 'provider_not_found' };
    if (ds.status === 'disconnected')
      return { metrics_persisted: 0, sync_status: 'failed', error_message: 'not_connected' };

    const tokenRow = await this.env.DB.prepare(
      `SELECT access_token_encrypted, refresh_token_encrypted, expires_at FROM data_source_tokens WHERE provider = ?`,
    )
      .bind(providerName)
      .first<{
        access_token_encrypted: string;
        refresh_token_encrypted: string;
        expires_at: string;
      }>();
    if (!tokenRow) {
      await recordSyncResult(this.env.DB, providerName, 'error', 'failed', 'no_tokens_stored');
      return { metrics_persisted: 0, sync_status: 'failed', error_message: 'no_tokens_stored' };
    }

    let accessToken = await decrypt(tokenRow.access_token_encrypted, this.env, providerName);
    const refreshToken = await decrypt(tokenRow.refresh_token_encrypted, this.env, providerName);
    const provider = getDataSourceProvider(providerName, this.env);

    // Try sync with current token. On 401, refresh + retry once.
    let metrics: Awaited<ReturnType<typeof provider.syncDaily>>;
    try {
      metrics = await provider.syncDaily({ date, accessToken });
    } catch (err) {
      if (err instanceof Error && err.message === 'UNAUTHORIZED') {
        try {
          const refreshed = await provider.refreshTokens(refreshToken);
          accessToken = refreshed.access_token;
          await this.env.DB.prepare(
            `UPDATE data_source_tokens SET access_token_encrypted = ?, refresh_token_encrypted = ?, expires_at = ?, updated_at = datetime('now') WHERE provider = ?`,
          )
            .bind(
              await encrypt(refreshed.access_token, this.env, providerName),
              await encrypt(refreshed.refresh_token, this.env, providerName),
              refreshed.expires_at,
              providerName,
            )
            .run();
          metrics = await provider.syncDaily({ date, accessToken });
        } catch (refreshErr) {
          console.error('[syncDataSource] refresh failed:', refreshErr);
          await recordSyncResult(
            this.env.DB,
            providerName,
            'reauth_required',
            'failed',
            'refresh_token_expired_reauth_required',
          );
          return {
            metrics_persisted: 0,
            sync_status: 'failed',
            error_message: 'refresh_token_expired_reauth_required',
          };
        }
      } else {
        console.error('[syncDataSource] sync failed:', err);
        await recordSyncResult(
          this.env.DB,
          providerName,
          'error',
          'failed',
          err instanceof Error ? err.message : 'unknown',
        );
        return {
          metrics_persisted: 0,
          sync_status: 'failed',
          error_message: err instanceof Error ? err.message : 'unknown',
        };
      }
    }

    for (const m of metrics) {
      await upsertDailyMetric(this.env.DB, m);
    }

    // Spotify-specific: persist per-entry library-save events
    // from the library_saves_episodes + library_saves_audiobooks metadata. The
    // metric rows already live in daily_metrics (aggregated counts per type);
    // library_save_events captures per-entry detail for the /system [ READING ] UI
    // + {CURRENT_LISTENING} placeholder.
    if (providerName === 'spotify') {
      type LibrarySaveMetaItem = {
        show_or_book_spotify_uri: string;
        show_or_book_title: string;
        show_or_book_author: string | null;
        listening_type: 'episode_save' | 'audiobook_save';
      };
      const saveMetrics = metrics.filter(
        (m) => m.metric === 'library_saves_episodes' || m.metric === 'library_saves_audiobooks',
      );
      for (const sm of saveMetrics) {
        const items = (sm.metadata as { items?: LibrarySaveMetaItem[] } | null | undefined)?.items;
        if (!items || items.length === 0) continue;
        for (const item of items) {
          try {
            await upsertLibrarySaveEvent(this.env.DB, {
              date,
              show_or_book_title: item.show_or_book_title,
              show_or_book_author: item.show_or_book_author,
              show_or_book_spotify_uri: item.show_or_book_spotify_uri,
              listening_type: item.listening_type,
            });
          } catch (err) {
            console.error(
              '[syncDataSource] library_save_events upsert failed:',
              item.show_or_book_spotify_uri,
              err,
            );
          }
        }
      }
    }

    // Auto-complete sweep. Runs AFTER metrics are persisted (and after
    // Spotify library_save_events are persisted) so the evaluator reads fully-
    // upserted daily_metrics. Try/catch-guarded - auto-complete failure does
    // NOT change the sync_status reported to the caller.
    try {
      const state = await getOrInitState(this.ctx.storage);
      const autoResult = await runAutoCompleteAfterSync(this.env.DB, this.env.KV, state, date);
      if (autoResult.completed > 0) {
        await saveState(this.ctx.storage, state);
        console.log(
          `[syncDataSource] auto-completed ${autoResult.completed} quest(s) via ${providerName} sync`,
        );
      }
    } catch (err) {
      console.error('[syncDataSource] runAutoCompleteAfterSync failed:', err);
    }

    const status: SyncStatus =
      metrics.length >= 5
        ? 'success'
        : providerName === 'spotify'
          ? metrics.length > 0
            ? 'partial'
            : 'partial'
          : metrics.length > 0
            ? 'partial'
            : 'failed';
    await recordSyncResult(
      this.env.DB,
      providerName,
      status === 'failed' ? 'error' : 'connected',
      status,
    );
    return { metrics_persisted: metrics.length, sync_status: status };
  }

  // ----- Generation RPC -----

  async generateDaily(todayOverride?: string): Promise<{
    generation_id: string;
    quests: QuestRow[];
    reasoning: string;
    source: 'cached' | 'llm' | 'fallback';
  }> {
    const today = todayOverride ?? new Date().toISOString().slice(0, 10);

    // Idempotency: if today already has system-generated quests, return them.
    const existing = await this.env.DB.prepare(
      `SELECT * FROM quests WHERE scheduled_for = ? AND source = 'system' ORDER BY id`,
    )
      .bind(today)
      .all<QuestRow>();

    if (existing.results.length > 0) {
      const firstId = existing.results[0]?.generation_id ?? 'unknown';
      return {
        generation_id: firstId,
        quests: existing.results,
        reasoning: 'Already generated today; returning existing batch (idempotent).',
        source: 'cached',
      };
    }

    return await this.generateDailyInternal(today);
  }

  /**
   * Public RPC method for the queue consumer to invoke.
   * Performs the idempotency check + delegates to generateDailyInternal.
   * Called by the consumer worker after it picks up a 'generate_daily' message
   * from ottoleveling-llm-jobs.
   */
  async generateDailyFromQueue(date: string): Promise<void> {
    // Idempotency: if today already has system-generated quests, skip.
    const existing = await this.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM quests WHERE scheduled_for = ? AND source = 'system'`,
    )
      .bind(date)
      .first<{ n: number }>();
    if (existing && existing.n > 0) {
      console.log(`[generateDailyFromQueue] already generated for ${date}, skipping`);
      return;
    }
    await this.generateDailyInternal(date);
  }

  /**
   * Public RPC method: re-evaluates auto-complete rules
   * for a given date. Dispatched by the consumer from the events queue.
   */
  async processAutoCompleteFromQueue(date: string): Promise<void> {
    const state = await getOrInitState(this.ctx.storage);
    const result = await runAutoCompleteAfterSync(this.env.DB, this.env.KV, state, date);
    if (result.completed > 0) {
      await saveState(this.ctx.storage, state);
      console.log(
        `[processAutoCompleteFromQueue] auto-completed ${result.completed} quest(s) for ${date}`,
      );
    }
  }

  /**
   * Public RPC method: triggers Spotify library sync.
   * Dispatched by the consumer from the events queue.
   */
  async syncSpotifyFromQueue(reason: string): Promise<void> {
    console.log(`[syncSpotifyFromQueue] triggered, reason=${reason}`);
    const result = await this.syncDataSource('spotify');
    console.log(`[syncSpotifyFromQueue] result:`, result);
  }

  /**
   * Public RPC method: triggers Google Health sync.
   * Dispatched by the consumer from the events queue.
   */
  async syncGoogleHealthFromQueue(reason: string): Promise<void> {
    console.log(`[syncGoogleHealthFromQueue] triggered, reason=${reason}`);
    const result = await this.syncDataSource('google_health');
    console.log(`[syncGoogleHealthFromQueue] result:`, result);
  }

  /**
   * Shared by generateDailyFromQueue (after idempotency check) and
   * regenerateDaily (after deleting uncompleted quests).
   */
  async generateDailyInternal(today: string): Promise<{
    generation_id: string;
    quests: QuestRow[];
    reasoning: string;
    source: 'llm' | 'fallback';
  }> {
    const state = await getOrInitState(this.ctx.storage);

    // Instrument all D1 calls in this method (round-trip count is logged at the end).
    const db = instrumentD1(this.env.DB, 'generateDailyInternal');

    // Defensive forward-fill: older persisted DO state may lack the
    // google_health_sync scheduled event. Seed it if missing.
    if (!state.scheduledEvents.some((e) => e.type === 'google_health_sync')) {
      const next = new Date();
      next.setUTCDate(next.getUTCDate() + 1);
      next.setUTCHours(5, 30, 0, 0);
      state.scheduledEvents.push({
        id: crypto.randomUUID(),
        type: 'google_health_sync',
        scheduledFor: next.toISOString(),
      });
      await saveState(this.ctx.storage, state);
    }

    // Defensive forward-fill: older persisted DO state may lack the
    // spotify_sync scheduled event. Seed it if missing.
    if (!state.scheduledEvents.some((e) => e.type === 'spotify_sync')) {
      const next = new Date();
      next.setUTCDate(next.getUTCDate() + 1);
      next.setUTCHours(5, 31, 0, 0);
      state.scheduledEvents.push({
        id: crypto.randomUUID(),
        type: 'spotify_sync',
        scheduledFor: next.toISOString(),
      });
      await saveState(this.ctx.storage, state);
    }

    // Auto-fail expired arcs BEFORE we read the active set.
    // Wrapped in try/catch so a sweep failure does NOT void daily generation.
    try {
      const swept = await checkExpiredArcs(db, today);
      if (swept.failed > 0) {
        console.log('[generateDailyInternal] auto-failed expired arcs:', swept.failed_arc_ids);
      }
    } catch (err) {
      console.error('[generateDailyInternal] checkExpiredArcs failed:', err);
    }

    // Refresh lifetime_stats before the parallel reads so {LIFETIME_SNAPSHOT}
    // includes yesterday's writes; running it afterwards made today's prompt one
    // day stale (LIFETIME_PROXIMITY_FLAG misfired when a personal record broke
    // overnight). Wrapped in try/catch - recompute failure does NOT void the
    // generation; the fallback is to read what's already in the table.
    try {
      await recomputeLifetimeStats(db);
    } catch (err) {
      console.error(
        '[SystemAgent.generateDaily] recomputeLifetimeStats failed (start-of-day):',
        err,
      );
    }

    // Compute yesterday's ISO date once (UTC) for the {YESTERDAY_SUMMARY} reads.
    const yesterdayIso = (() => {
      const y = new Date(today + 'T00:00:00Z');
      y.setUTCDate(y.getUTCDate() - 1);
      return y.toISOString().slice(0, 10);
    })();

    // Gather D1 reads in parallel.
    const [
      activeObjectives,
      pillarLevels,
      recentPerformance,
      activeTemplates,
      latestCheckin,
      lifetimeStats,
      recentAchievements,
      closestToThreshold,
      activeArcs,
      objectiveMetrics,
      currentListening,
      excludedShowUris,
      yesterdayPillarSummary,
      yesterdayMissedRows,
      yesterdayCheckinRow,
      calibrationSignals,
      activeProjects,
      contraindicationRows,
    ] = await Promise.all([
      getActiveObjectives(db),
      getPillarLevels(db),
      getRecentPerformance(db, daysAgo(today, 14), today),
      getActiveTemplatesForDay(db, isoDayOfWeek(today)),
      getLatestCheckin(db),
      getLifetimeStats(db),
      getRecentAchievements(db, today),
      getClosestToThreshold(db, state),
      getActiveArcs(db),
      getObjectiveMetrics(db, today, 7),
      getCurrentLibrarySaves(db, today, 14),
      getExcludedShowUris(db), // for {CURRENT_LISTENING} filtering
      getYesterdayPillarSummary(db, today),
      // Missed quests from yesterday (cap at 3 in helper too)
      db
        .prepare(
          `SELECT q.pillar_id, q.title
         FROM quests q
         LEFT JOIN completions c ON c.quest_id = q.id
         WHERE q.scheduled_for = ?
           AND (c.status IS NULL OR c.status IN ('failed', 'skipped'))
         ORDER BY q.pillar_id, q.id
         LIMIT 3`,
        )
        .bind(yesterdayIso)
        .all<{ pillar_id: string; title: string }>(),
      db
        .prepare(`SELECT notes FROM daily_checkins WHERE date = ? LIMIT 1`)
        .bind(yesterdayIso)
        .first<{ notes: string | null }>(),
      // {CALIBRATION_SIGNALS}; a failure degrades to null instead of voiding generation.
      buildCalibrationSignals(this.env.DB, today).catch((err: unknown) => {
        console.error('[generateDailyInternal] buildCalibrationSignals failed:', err);
        return null;
      }),
      // {ACTIVE_PROJECTS}
      getActiveProjects(db, { statusFilter: 'active' }),
      getTemplateContraindicationRows(db),
    ]);

    // Forward-fill the cached counter from authoritative D1.
    state.activeArcCount = activeArcs.length;

    // Build context + render prompt.
    const pillarLevelsForTitles: Record<PillarId, number> = {
      body: 0,
      mind: 0,
      finance: 0,
      projects: 0,
    };
    for (const pl of pillarLevels) {
      pillarLevelsForTitles[pl.pillarId] = pl.level;
    }

    // Map yesterday reads into the shape buildGenerationContext expects.
    const yesterdayPerPillar = (['body', 'mind', 'finance', 'projects'] as const).map((p) => ({
      pillar: p as PillarId,
      assigned: yesterdayPillarSummary[p].assigned,
      completed: yesterdayPillarSummary[p].completed,
    }));
    const yesterdayMissed = (yesterdayMissedRows.results ?? []).map((r) => ({
      pillar: r.pillar_id as PillarId,
      questTitle: r.title,
    }));

    const player = readPlayerConfig(this.env);
    const ctxVars = buildGenerationContext({
      player,
      state,
      today,
      activeObjectives,
      pillarLevels,
      recentPerformance,
      activeTemplates,
      latestCheckin,
      lifetimeStats,
      pillarLevelsForTitles,
      recentAchievements,
      closestToThreshold,
      activeArcs,
      objectiveMetrics,
      currentListening,
      excludedShowUris,
      yesterdayIso,
      yesterdayPerPillar,
      yesterdayMissed,
      yesterdayCheckinNotes: yesterdayCheckinRow?.notes ?? null,
      yesterdayCheckinRowExists: yesterdayCheckinRow !== null,
      calibrationSignals,
      activeProjects,
    });
    const systemPrompt = renderPrompt(QUEST_GENERATION_PROMPT, ctxVars);

    // Call LLM with safe fallback on any error.
    let parsed: GenerationResponse;
    let source: 'llm' | 'fallback' = 'llm';
    try {
      const provider = getLLMProvider(this.env);
      const raw = await provider.complete(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: "Generate today's quests." },
        ],
        { jsonMode: true, temperature: 0.7, maxTokens: 3500 },
      );
      const json = JSON.parse(raw) as unknown;
      parsed = GenerationResponseSchema.parse(json);
      bumpLlmCallCounter(state, today);
    } catch (err) {
      console.error('[SystemAgent.generateDaily] LLM call/parse failed, using fallback:', err);
      parsed = buildFallbackResponse();
      source = 'fallback';
    }

    // Deterministic safety net: reject LLM quests that match a forbidden
    // pattern from the player profile or a template contraindication, before
    // anything reaches D1. The fallback batch is inert and skips this step.
    if (source === 'llm') {
      const patterns = [
        ...forbiddenPatternsFromProfile(player.profile),
        ...forbiddenPatternsFromTemplates(contraindicationRows),
      ];
      const inert = buildFallbackResponse().quests;
      const checked = validateQuests(
        parsed.quests,
        patterns,
        (pillarId) => inert.find((q) => q.pillar_id === pillarId) ?? null,
      );
      if (checked.rejected.length > 0) {
        console.warn(
          '[quest-validator] rejected generated quests',
          JSON.stringify({ date: today, rejected: checked.rejected }),
        );
        parsed = { ...parsed, quests: checked.quests };
      }
    }

    // Insert all quests with a shared generation_id.
    const generation_id = uuidV4();
    const insertStatements = parsed.quests.map((q) =>
      db
        .prepare(
          `INSERT INTO quests
            (pillar_id, title, description, xp_value, difficulty, source,
             objective_id, template_id, arc_id, arc_step, scheduled_for, generation_id, metadata)
           VALUES (?, ?, ?, ?, ?, 'system', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          q.pillar_id,
          q.title,
          q.description ?? null,
          q.xp_value,
          q.difficulty,
          q.objective_link ?? null,
          q.template_link ?? null,
          q.arc_id ?? null,
          q.arc_step ?? null,
          today,
          generation_id,
          // Merge LLM-emitted stats into metadata for later retrieval at completion.
          // stats is stripped from the quest's top-level field; stored under metadata._stats.
          (() => {
            const base = q.metadata ?? {};
            const merged =
              q.stats && q.stats.length > 0
                ? { ...base, _stats: q.stats }
                : Object.keys(base).length > 0
                  ? base
                  : null;
            return merged ? JSON.stringify(merged) : null;
          })(),
        ),
    );

    await db.batch(insertStatements);

    // Re-fetch the inserted rows (D1 batch doesn't return generated IDs reliably).
    const { results: insertedRows } = await db
      .prepare(`SELECT * FROM quests WHERE generation_id = ? ORDER BY id`)
      .bind(generation_id)
      .all<QuestRow>();

    // Process the LLM's proposed_arc (if any) AFTER the quests INSERT.
    // Wrapped in try/catch so a proposal failure doesn't void the generation.
    if (parsed.proposed_arc) {
      try {
        const evalResult = evaluateNewProposal(parsed.proposed_arc, activeArcs);
        if (evalResult.ok) {
          const nowIso = new Date().toISOString();
          const newArc = startArc(parsed.proposed_arc, nowIso, 30, 30);
          await db
            .prepare(
              `INSERT INTO quest_arcs
                (pillar_id, title, description, total_steps, completed_steps,
                 status, started_at, expected_end, total_xp_reward, metadata)
               VALUES (?, ?, ?, ?, 0, 'active', ?, ?, ?, ?)`,
            )
            .bind(
              newArc.pillar_id,
              newArc.title,
              newArc.description,
              newArc.total_steps,
              newArc.started_at,
              newArc.expected_end,
              newArc.total_xp_reward,
              newArc.metadata,
            )
            .run();
          state.activeArcCount += 1;
        } else {
          console.warn('[generateDailyInternal] arc proposal rejected:', evalResult.reason);
        }
      } catch (err) {
        console.error('[generateDailyInternal] arc proposal persist failed:', err);
      }
    }

    // Persist state (counters) + invalidate KV.
    await saveState(this.ctx.storage, state);
    await invalidateTodayCache(this.env.KV, today);

    // Auto-complete sweep after fresh quests land.
    // Catches the case where today's quest was just generated AND a matching
    // daily_metric already exists (e.g., from a sync that ran before generation).
    // Try/catch-guarded.
    try {
      const autoResult = await runAutoCompleteAfterGeneration(db, this.env.KV, state, today);
      if (autoResult.completed > 0) {
        await saveState(this.ctx.storage, state);
        console.log(
          `[generateDailyInternal] auto-completed ${autoResult.completed} quest(s) post-generation`,
        );
      }
    } catch (err) {
      console.error('[generateDailyInternal] runAutoCompleteAfterGeneration failed:', err);
    }

    flushInstrumentation('generateDailyInternal');

    return {
      generation_id,
      quests: insertedRows,
      reasoning: parsed.reasoning,
      source,
    };
  }

  async regenerateDaily(todayOverride?: string): Promise<{
    generation_id: string;
    quests: QuestRow[];
    reasoning: string;
    source: 'llm' | 'fallback';
  }> {
    const today = todayOverride ?? new Date().toISOString().slice(0, 10);

    // Delete today's UNCOMPLETED system quests. Completed quests stay as history
    // (they have FK refs from completions + xp_events; SQL excludes them).
    await this.env.DB.prepare(
      `DELETE FROM quests
         WHERE scheduled_for = ?
           AND source = 'system'
           AND id NOT IN (SELECT quest_id FROM completions)`,
    )
      .bind(today)
      .run();

    return await this.generateDailyInternal(today);
  }

  // ----- Bilan RPC -----

  async generateBilan(
    periodType: PeriodType,
    periodStartOverride?: string,
    periodEndOverride?: string,
  ): Promise<{
    id: number;
    period_type: PeriodType;
    period_start: string;
    period_end: string;
    stats: BilanStatsInput;
    narrative: string;
    source: 'cached' | 'llm' | 'fallback';
  }> {
    const now = new Date();
    const period =
      periodStartOverride && periodEndOverride
        ? {
            start: periodStartOverride,
            end: periodEndOverride,
            days: daysInPeriod(periodStartOverride, periodEndOverride),
          }
        : periodType === 'weekly'
          ? weeklyPeriodFor(now)
          : periodType === 'monthly'
            ? monthlyPeriodFor(now)
            : yearlyPeriodFor(now);

    // Idempotency.
    const existing = await this.env.DB.prepare(
      `SELECT id, stats, narrative FROM bilans WHERE period_type = ? AND period_start = ?`,
    )
      .bind(periodType, period.start)
      .first<{ id: number; stats: string; narrative: string }>();

    if (existing) {
      let parsed: BilanStatsInput;
      try {
        parsed = JSON.parse(existing.stats) as BilanStatsInput;
      } catch {
        parsed = await getBilanStats(this.env.DB, period.start, period.end);
      }
      return {
        id: existing.id,
        period_type: periodType,
        period_start: period.start,
        period_end: period.end,
        stats: parsed,
        narrative: existing.narrative,
        source: 'cached',
      };
    }

    // Fetch raw inputs.
    const [stats, focusHistory, previousBilan, state] = await Promise.all([
      getBilanStats(this.env.DB, period.start, period.end),
      getFocusHistoryInPeriod(this.env.DB, period.start, period.end),
      getPreviousBilan(this.env.DB, periodType, period.start),
      getOrInitState(this.ctx.storage),
    ]);

    // Streaks.current is canonical from DO state.
    for (const p of ['body', 'mind', 'finance', 'projects'] as const) {
      stats.streaks[p].current = state.streaks[p].current;
    }

    // Pattern detection.
    const patternInput: PatternInput = {
      byPillar: pillarPatternDataFromStats(stats),
      previousByPillar: previousBilan ? pillarPatternDataFromStats(previousBilan.stats) : null,
      focusHistory: focusHistory.map((f) => ({
        pillarId: f.pillarId,
        startedAt: f.startedAt,
        endedAt: f.endedAt,
      })),
      now: now.toISOString(),
    };
    const detectedPatterns = detectPatterns(patternInput);

    // Compute {PERFORMANCE_VS_PHYSIOLOGY} section.
    // Wrapped in try/catch so a D1 failure here does NOT void bilan generation.
    const performanceVsPhysiology = await formatPerformanceVsPhysiology(this.env.DB, {
      periodStart: period.start,
      periodEnd: period.end,
      globalCompletionRate: stats.global.completion_rate,
    }).catch((err: unknown) => {
      console.error('[generateBilan] formatPerformanceVsPhysiology failed:', err);
      return '(insufficient calibration data - no recovery analysis possible)';
    });

    // Build context + render prompt.
    const ctxVars = buildBilanContext({
      player: readPlayerConfig(this.env),
      state,
      periodType,
      periodStart: period.start,
      periodEnd: period.end,
      periodDays: period.days,
      stats,
      focusHistory,
      previousBilan,
      detectedPatterns,
      performanceVsPhysiology,
    });
    const systemPrompt = renderPrompt(BILAN_PROMPT, ctxVars);

    // Call LLM with safe fallback.
    let parsed: BilanResponse;
    let source: 'llm' | 'fallback' = 'llm';
    try {
      const provider = getLLMProvider(this.env);
      const raw = await provider.complete(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate the ${periodType} bilan.` },
        ],
        { jsonMode: true, temperature: 0.6, maxTokens: 4000 },
      );
      const json = JSON.parse(raw) as unknown;
      parsed = BilanResponseSchema.parse(json);
      bumpLlmCallCounter(state, today(now));
    } catch (err) {
      console.error('[SystemAgent.generateBilan] LLM call/parse failed, using fallback:', err);
      parsed = synthesizeFallbackBilan(
        periodType,
        period.start,
        period.end,
        stats,
        detectedPatterns,
      );
      source = 'fallback';
    }

    // Lifecycle: merge new detections into existing state.patterns, then apply
    // TTL + min-confidence + cap. Prevents unbounded growth across weekly bilans.
    state.patterns = prunePatterns(state.patterns, detectedPatterns, { now: now.toISOString() });
    await saveState(this.ctx.storage, state);

    // Insert bilan row.
    // Mirror global.completion_rate at the top level so the
    // bilan_streak achievement evaluator (which reads top-level
    // completion_rate from r.stats) sees the right value. Additive - does not
    // change the BilanStatsInput-shaped reading by getPreviousBilan or the
    // /api/bilans/:id consumers.
    //
    // TODO: once all readers migrate to
    // `stats.global.completion_rate` (specifically the bilan_streak achievement
    // evaluator in lib/achievements/evaluate.ts), deprecate this top-level
    // mirror. Tracked: remove `completion_rate: parsed.stats.global.completion_rate`
    // from `statsForStorage` and update the evaluator to read
    // `parsed.global?.completion_rate ?? parsed.completion_rate ?? 0`.
    const statsForStorage = {
      ...parsed.stats,
      completion_rate: parsed.stats.global.completion_rate,
    };
    const row = await this.env.DB.prepare(
      `INSERT INTO bilans (period_type, period_start, period_end, stats, narrative)
         VALUES (?, ?, ?, ?, ?)
         RETURNING id`,
    )
      .bind(periodType, period.start, period.end, JSON.stringify(statsForStorage), parsed.narrative)
      .first<{ id: number }>();

    if (!row) throw new Error('generateBilan: insert returned no row');

    // Evaluate bilan-streak + composite achievements AFTER the bilan row is committed.
    try {
      const unlocks = await evaluateOnBilan(
        this.env.DB,
        {
          id: row.id,
          period_type: periodType,
          stats: parsed.stats as unknown as Record<string, unknown>,
        },
        state,
      );
      if (unlocks.length > 0) {
        pushRecentUnlocks(state, unlocks);
        await saveState(this.ctx.storage, state);
      }
    } catch (err) {
      console.error('[SystemAgent.generateBilan] evaluateOnBilan failed:', err);
    }

    return {
      id: row.id,
      period_type: periodType,
      period_start: period.start,
      period_end: period.end,
      stats: bilanStatsFromResponse(parsed, stats),
      narrative: parsed.narrative,
      source,
    };
  }

  // ----- Template progression RPC -----

  async evaluateTemplateProgression(todayOverride?: string): Promise<{
    adjusted: number;
    log: ProgressionLogEntry[];
  }> {
    const today = todayOverride ?? new Date().toISOString().slice(0, 10);

    const { results: templates } = await this.env.DB.prepare(
      `SELECT id, current_value, starting_value, progression_rule, last_progressed_at, created_at
         FROM quest_templates WHERE active = 1`,
    ).all<{
      id: number;
      current_value: number;
      starting_value: number;
      progression_rule: string;
      last_progressed_at: string | null;
      created_at: string;
    }>();

    let adjusted = 0;
    const log: ProgressionLogEntry[] = [];

    for (const t of templates) {
      let rule: ProgressionRule;
      try {
        rule = JSON.parse(t.progression_rule) as ProgressionRule;
      } catch {
        log.push({ template_id: t.id, action: 'skipped', reason: 'progression_rule_parse_error' });
        continue;
      }

      // rule.type === 'none' is an audit-only entry - distinct from "rule
      // fired but didn't meet threshold" (which logs action: 'none').
      if (rule.type === 'none') {
        log.push({ template_id: t.id, action: 'skipped', reason: 'rule_type_none' });
        continue;
      }

      const sinceRaw = t.last_progressed_at ?? t.created_at;
      const since = sinceRaw.slice(0, 10);
      const attempts = await countTemplateAttemptsSince(this.env.DB, t.id, since);
      const decision = evaluateProgression(
        {
          current_value: t.current_value,
          starting_value: t.starting_value,
          progression_rule: rule,
        },
        attempts,
      );

      if (decision.action === 'progress' || decision.action === 'regress') {
        await this.env.DB.prepare(
          `UPDATE quest_templates SET current_value = ?, last_progressed_at = ? WHERE id = ?`,
        )
          .bind(decision.newValue, new Date().toISOString(), t.id)
          .run();
        adjusted++;
        log.push({
          template_id: t.id,
          action: decision.action,
          reason: decision.reason,
          from: t.current_value,
          to: decision.newValue,
        });
      } else {
        log.push({ template_id: t.id, action: 'none', reason: decision.reason });
      }
    }

    // Touch unused param so TS strict mode doesn't complain when todayOverride is provided for tests.
    void today;

    return { adjusted, log };
  }

  // ----- Template CRUD RPC -----

  async createTemplate(input: CreateTemplate): Promise<QuestTemplateRow> {
    const row = await this.env.DB.prepare(
      `INSERT INTO quest_templates
           (pillar_id, title, description, base_metric, current_value, starting_value,
            progression_rule, schedule, schedule_config, base_xp, difficulty,
            active, created_by, metadata, auto_complete_rule)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'manual', ?, ?)
         RETURNING *`,
    )
      .bind(
        input.pillar_id,
        input.title,
        input.description ?? null,
        input.base_metric,
        input.starting_value, // current_value starts at starting_value
        input.starting_value,
        JSON.stringify(input.progression_rule ?? { type: 'none' }),
        input.schedule,
        input.schedule_config ? JSON.stringify(input.schedule_config) : null,
        input.base_xp,
        input.difficulty,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.auto_complete_rule != null ? JSON.stringify(input.auto_complete_rule) : null,
      )
      .first<QuestTemplateRow>();
    if (!row) throw new Error('createTemplate: insert returned no row');
    return row;
  }

  async updateTemplate(id: number, patch: UpdateTemplate): Promise<QuestTemplateRow | null> {
    // Build dynamic SET clause from defined patch keys.
    const sets: string[] = [];
    const values: Array<string | number | boolean | null> = [];
    if (patch.title !== undefined) {
      sets.push('title = ?');
      values.push(patch.title);
    }
    if (patch.description !== undefined) {
      sets.push('description = ?');
      values.push(patch.description ?? null);
    }
    if (patch.current_value !== undefined) {
      sets.push('current_value = ?');
      values.push(patch.current_value);
    }
    if (patch.progression_rule !== undefined) {
      sets.push('progression_rule = ?');
      values.push(JSON.stringify(patch.progression_rule));
    }
    if (patch.schedule !== undefined) {
      sets.push('schedule = ?');
      values.push(patch.schedule);
    }
    if (patch.schedule_config !== undefined) {
      sets.push('schedule_config = ?');
      values.push(patch.schedule_config ? JSON.stringify(patch.schedule_config) : null);
    }
    if (patch.base_xp !== undefined) {
      sets.push('base_xp = ?');
      values.push(patch.base_xp);
    }
    if (patch.difficulty !== undefined) {
      sets.push('difficulty = ?');
      values.push(patch.difficulty);
    }
    if (patch.active !== undefined) {
      sets.push('active = ?');
      values.push(patch.active ? 1 : 0);
    }
    if (patch.metadata !== undefined) {
      sets.push('metadata = ?');
      values.push(patch.metadata ? JSON.stringify(patch.metadata) : null);
    }
    // 'auto_complete_rule' in patch (not just truthy) - explicit null must clear the rule.
    if ('auto_complete_rule' in patch) {
      sets.push('auto_complete_rule = ?');
      values.push(
        patch.auto_complete_rule != null ? JSON.stringify(patch.auto_complete_rule) : null,
      );
    }

    if (sets.length === 0) {
      // No-op patch - return current row.
      return await this.env.DB.prepare(`SELECT * FROM quest_templates WHERE id = ?`)
        .bind(id)
        .first<QuestTemplateRow>();
    }

    values.push(id);
    return await this.env.DB.prepare(
      `UPDATE quest_templates SET ${sets.join(', ')} WHERE id = ? RETURNING *`,
    )
      .bind(...values)
      .first<QuestTemplateRow>();
  }

  async deactivateTemplate(id: number): Promise<QuestTemplateRow | null> {
    return await this.env.DB.prepare(
      `UPDATE quest_templates SET active = 0 WHERE id = ? RETURNING *`,
    )
      .bind(id)
      .first<QuestTemplateRow>();
  }

  // ----- Push RPC -----

  /**
   * Send a Web Push notification to all subscribed devices.
   *
   * Failure handling:
   * - 410 Gone → DELETE subscription immediately (the user-agent revoked it).
   * - Non-410 error → increment failure_count. When > 5, DELETE proactively.
   * - Each call wrapped in try/catch so one bad subscription doesn't block the rest.
   *
   * Returns counters for logging / observability.
   */
  async sendPush(payload: {
    type: 'daily_assigned' | 'bilan_ready';
    title: string;
    body: string;
    url: string;
  }): Promise<{ sent: number; failed: number; deleted: number }> {
    const { results: subs } = await this.env.DB.prepare(
      `SELECT id, endpoint, p256dh, auth, failure_count FROM push_subscriptions`,
    ).all<{ id: number; endpoint: string; p256dh: string; auth: string; failure_count: number }>();

    if (subs.length === 0) {
      return { sent: 0, failed: 0, deleted: 0 };
    }

    const sender = getPushSender(this.env);
    const payloadJson = JSON.stringify(payload);

    let sent = 0;
    let failed = 0;
    let deleted = 0;

    for (const sub of subs) {
      try {
        const result = await sender.send({
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
          payload: payloadJson,
          vapid: {
            publicKey: this.env.VAPID_PUBLIC_KEY,
            privateKey: this.env.VAPID_PRIVATE_KEY,
            subject: this.env.VAPID_SUBJECT,
          },
        });

        if (result.ok) {
          sent++;
          await this.env.DB.prepare(
            `UPDATE push_subscriptions SET last_used_at = datetime('now'), failure_count = 0 WHERE id = ?`,
          )
            .bind(sub.id)
            .run();
        } else if (result.gone) {
          // 410 Gone - user-agent revoked. Delete immediately.
          await this.env.DB.prepare(`DELETE FROM push_subscriptions WHERE id = ?`)
            .bind(sub.id)
            .run();
          deleted++;
        } else {
          // Non-410 failure. Increment failure_count. Auto-delete if > 5.
          failed++;
          const newCount = sub.failure_count + 1;
          if (newCount > 5) {
            await this.env.DB.prepare(`DELETE FROM push_subscriptions WHERE id = ?`)
              .bind(sub.id)
              .run();
            deleted++;
            console.error(
              `[sendPush] auto-deleted subscription ${sub.id} after ${newCount} failures (status=${result.status}, reason=${result.reason})`,
            );
          } else {
            await this.env.DB.prepare(
              `UPDATE push_subscriptions SET failure_count = ? WHERE id = ?`,
            )
              .bind(newCount, sub.id)
              .run();
            console.warn(
              `[sendPush] subscription ${sub.id} failed (status=${result.status}, count=${newCount}/5)`,
            );
          }
        }
      } catch (err) {
        // Truly unexpected - log + count as failed but don't try to update D1
        // (might be the source of the error).
        failed++;
        console.error(`[sendPush] uncaught error for subscription ${sub.id}:`, err);
      }
    }

    return { sent, failed, deleted };
  }

  /**
   * Build + send a test notification to all current subscriptions. No LLM
   * call, no D1 quest mutation - just exercises the push path so the user
   * can verify their device subscription works without waiting for a 06:00
   * UTC alarm. Returns the same counters as sendPush.
   *
   * Called from POST /api/push/test.
   */
  async sendPushTest(
    type: 'daily' | 'weekly',
  ): Promise<{ sent: number; failed: number; deleted: number }> {
    const state = await getOrInitState(this.ctx.storage);
    const payload =
      type === 'daily' ? buildDailyPushPayload(state) : await buildWeeklyPushPayload(this.env.DB);
    return this.sendPush(payload);
  }

  // ----- Objective milestone RPC -----

  /**
   * Called by ObjectiveMilestoneWorkflow at each phase boundary.
   *
   * Updates the objective_workflow_state row to track the current phase.
   * Emits a console log for observability (visible via wrangler tail).
   *
   * Non-fatal: if the objective has been deleted or the state row is missing,
   * just logs + returns. The workflow instance continues to the next step.
   */
  async objectivePhaseTransition(objectiveId: number, phase: number, total: number): Promise<void> {
    try {
      await this.env.DB.prepare(
        `UPDATE objective_workflow_state
           SET current_phase = ?, transitioned_at = datetime('now')
           WHERE objective_id = ?`,
      )
        .bind(phase, objectiveId)
        .run();
    } catch (err) {
      console.error(
        `[objectivePhaseTransition] D1 update failed for objective ${objectiveId}:`,
        err,
      );
    }
    console.log(
      `[ObjectiveMilestone] objective ${objectiveId} transitioned to phase ${phase}/${total}`,
    );
  }

  // ----- Workflow close RPC -----

  /**
   * Called by DailyCycleWorkflow's 'close' step at 23:59 UTC.
   *
   * Checks whether today's completions span ≥3 distinct pillars. If so, awards
   * FOCUS +1 (idempotent - one row per day). This is the SOLE production FOCUS
   * award path; recordCompletion does not award FOCUS.
   *
   * Returns { focus_awarded: boolean } for observability / workflow logs.
   */
  async workflowCloseDay(date: string): Promise<{ focus_awarded: boolean }> {
    // Count distinct pillars with at least one 'completed' completion today.
    const distinctPillars = await this.env.DB.prepare(
      `SELECT COUNT(DISTINCT q.pillar_id) as n
         FROM completions c JOIN quests q ON c.quest_id = q.id
         WHERE c.status = 'completed' AND date(c.completed_at) = ?`,
    )
      .bind(date)
      .first<{ n: number }>();

    if ((distinctPillars?.n ?? 0) < 3) {
      return { focus_awarded: false };
    }

    // Idempotency: one FOCUS per day maximum.
    const existing = await this.env.DB.prepare(
      `SELECT 1 FROM stat_rewards WHERE stat_type = 'FOCUS' AND date(awarded_at) = ?`,
    )
      .bind(date)
      .first<{ 1: number }>();
    if (existing) {
      return { focus_awarded: false };
    }

    // Find the most-recent completion of the day as the triggering completion.
    const recent = await this.env.DB.prepare(
      `SELECT id FROM completions WHERE status = 'completed' AND date(completed_at) = ? ORDER BY completed_at DESC LIMIT 1`,
    )
      .bind(date)
      .first<{ id: number }>();
    if (!recent) {
      return { focus_awarded: false };
    }

    await this.env.DB.prepare(
      `INSERT INTO stat_rewards (completion_id, stat_type, stat_value, awarded_at)
         VALUES (?, 'FOCUS', 1, ?)`,
    )
      .bind(recent.id, `${date}T23:59:00.000Z`)
      .run();

    console.log(
      `[workflowCloseDay] FOCUS awarded for date=${date}, triggeringCompletionId=${recent.id}`,
    );
    return { focus_awarded: true };
  }

  // ----- Alarm handler -----

  override async alarm(): Promise<void> {
    const state = await getOrInitState(this.ctx.storage);
    const now = Date.now();

    const due = state.scheduledEvents.filter((e) => new Date(e.scheduledFor).getTime() <= now);
    const future = state.scheduledEvents.filter((e) => new Date(e.scheduledFor).getTime() > now);

    for (const event of due) {
      console.log(`[SystemAgent.alarm] firing ${event.type} (scheduled ${event.scheduledFor})`);
      try {
        switch (event.type) {
          // ── Primary spawn alarm ───────────────────────────────────────────
          case 'daily_cycle_spawn': {
            // Spawn the DailyCycleWorkflow instance for today. The workflow handles:
            // morning generation dispatch, data source syncs, evening bilan check,
            // and close (FOCUS award). Idempotent: same ID for same date → no-op.
            const today = new Date().toISOString().slice(0, 10);
            const instanceId = `daily-cycle-${today}`;
            try {
              await this.env.DAILY_CYCLE_WORKFLOW.create({
                id: instanceId,
                params: { date: today },
              });
              console.log(`[alarm:daily_cycle_spawn] created workflow instance ${instanceId}`);
            } catch (wfErr) {
              if (String(wfErr).includes('already exists')) {
                // Idempotent - workflow for today already running.
                console.log(
                  `[alarm:daily_cycle_spawn] instance ${instanceId} already exists, skipping`,
                );
              } else {
                // Workflow creation failed - fall back to inline queue dispatch so
                // user always gets their quests (graceful degradation).
                console.error(
                  '[alarm:daily_cycle_spawn] workflow create failed, falling back to queue dispatch:',
                  wfErr,
                );
                try {
                  await this.env.LLM_JOBS_QUEUE.send({ type: 'generate_daily', date: today });
                  console.log(
                    `[alarm:daily_cycle_spawn] fallback: queued generate_daily for ${today}`,
                  );
                } catch (queueErr) {
                  console.error(
                    '[alarm:daily_cycle_spawn] fallback queue dispatch also failed:',
                    queueErr,
                  );
                }
              }
            }
            break;
          }
          // ── Legacy alarm types - backward-compat with existing persisted DO state ──
          // DO state persisted before the daily-cycle workflow existed may still
          // hold these events in state.scheduledEvents.
          // Handle them gracefully: run the expected behavior, reschedule as
          // daily_cycle_spawn on the next reschedule() pass.
          case 'daily_generation': {
            // Migrate: dispatch generation via the LLM jobs queue.
            const today = new Date().toISOString().slice(0, 10);
            try {
              await this.env.LLM_JOBS_QUEUE.send({ type: 'generate_daily', date: today });
              console.log(`[alarm:daily_generation] legacy: queued generate_daily for ${today}`);
            } catch (queueErr) {
              console.error('[alarm:daily_generation] legacy: queue dispatch failed:', queueErr);
            }
            break;
          }
          case 'weekly_bilan': {
            const result = await this.generateBilan('weekly');
            // Only push when this is a fresh bilan (not the idempotency-cached return).
            if (result.source !== 'cached') {
              try {
                await this.sendPush({
                  type: 'bilan_ready',
                  title: '[ THE SYSTEM ]',
                  body: `Weekly bilan available. Week ${isoWeekNumber(new Date(result.period_start + 'T00:00:00Z'))}.`,
                  url: `/bilans/${result.id}`,
                });
              } catch (err) {
                console.error('[alarm:weekly_bilan] push failed:', err);
              }
            }
            break;
          }
          case 'monthly_bilan':
            await this.generateBilan('monthly');
            break;
          case 'yearly_bilan':
            await this.generateBilan('yearly');
            break;
          case 'template_progression_check':
            await this.evaluateTemplateProgression();
            break;
          case 'google_health_sync': {
            // Legacy - now handled by DailyCycleWorkflow step 2a-2b.
            // Still functional as fallback if workflow isn't running.
            try {
              await this.env.EVENTS_QUEUE.send({
                type: 'google_health_sync',
                reason: 'legacy-alarm',
              });
              console.log('[alarm:google_health_sync] legacy: dispatched to events queue');
            } catch (err) {
              console.error('[alarm:google_health_sync] legacy: failed:', err);
            }
            break;
          }
          case 'spotify_sync': {
            // Legacy - now handled by DailyCycleWorkflow step 2c-2d.
            try {
              await this.env.EVENTS_QUEUE.send({ type: 'spotify_sync', reason: 'legacy-alarm' });
              console.log('[alarm:spotify_sync] legacy: dispatched to events queue');
            } catch (err) {
              console.error('[alarm:spotify_sync] legacy: failed:', err);
            }
            break;
          }
        }
      } catch (err) {
        console.error(`[SystemAgent.alarm] handler for ${event.type} threw:`, err);
      }
      future.push(rescheduleEvent(event, now));
    }

    state.scheduledEvents = future;
    await saveState(this.ctx.storage, state);
    await scheduleNextAlarm(state.scheduledEvents, this.ctx.storage);
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers (used by generateDailyInternal)
// ---------------------------------------------------------------------------

function daysAgo(today: string, n: number): string {
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * UTC yesterday in YYYY-MM-DD format. Used as the default sync date
 * for syncDataSource (syncs run in the morning UTC, after the previous UTC day
 * has fully closed).
 */
function yesterdayUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function isoDayOfWeek(today: string): 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun' {
  const map: Record<number, 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> = {
    0: 'sun',
    1: 'mon',
    2: 'tue',
    3: 'wed',
    4: 'thu',
    5: 'fri',
    6: 'sat',
  };
  const d = new Date(today + 'T00:00:00Z');
  return map[d.getUTCDay()] ?? 'mon';
}

/**
 * UUID v4 generator using Web Crypto API (available in Workers runtime).
 * Avoids relying on `crypto.randomUUID()` which some TS lib configurations
 * don't expose on the global `crypto` object.
 */
function uuidV4(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Medically inert fallback batch, used when the LLM call fails or its response
 * fails validation. Observational only: no movement is prescribed for any
 * pillar, so it cannot conflict with whatever constraints the player profile
 * declares. The post-generation validator also uses these quests as
 * replacements for rejected ones.
 *
 * generate-daily-fallback.test.ts asserts that no body fallback title contains
 * exercise keywords.
 */
function buildFallbackResponse(): GenerationResponse {
  return {
    reasoning:
      'Fallback batch: LLM response failed validation. Generated 4 observational quests (medically inert - no movement prescribed). Investigate logs.',
    focus_acknowledged: null,
    quests: [
      {
        pillar_id: 'body',
        title: 'Log how your body feels today',
        description: 'Note sleep quality, soreness, energy level. 5 min. No movement prescribed.',
        difficulty: 'easy',
        xp_value: 25,
        objective_link: null,
        template_link: null,
        metadata: { fallback: true, observational: true },
      },
      {
        pillar_id: 'mind',
        title: 'Read for 10 minutes',
        description: 'Any topic. Book, article, paper.',
        difficulty: 'easy',
        xp_value: 25,
        objective_link: null,
        template_link: null,
        metadata: { fallback: true },
      },
      {
        pillar_id: 'finance',
        title: "Review yesterday's expenses",
        description: 'Just review - no decisions. Passive observation.',
        difficulty: 'easy',
        xp_value: 25,
        objective_link: null,
        template_link: null,
        metadata: { fallback: true, observational: true },
      },
      {
        pillar_id: 'projects',
        title: "Open dev environment and review yesterday's progress",
        description: 'Read the diff. 5 min. No commits required.',
        difficulty: 'easy',
        xp_value: 25,
        objective_link: null,
        template_link: null,
        metadata: { fallback: true, observational: true },
      },
    ],
  };
}

function today(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function daysInPeriod(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00Z').getTime();
  const e = new Date(end + 'T00:00:00Z').getTime();
  return Math.round((e - s) / 86_400_000) + 1;
}

function pillarPatternDataFromStats(stats: BilanStatsInput): Record<PillarId, PillarPatternData> {
  const out = {} as Record<PillarId, PillarPatternData>;
  for (const p of ['body', 'mind', 'finance', 'projects'] as const) {
    const s = stats.byPillar[p];
    out[p] = {
      assigned: s.assigned,
      completed: s.completed,
      rate: s.rate,
      streakCurrent: stats.streaks[p].current,
    };
  }
  return out;
}

/**
 * Returns BilanStatsInput shape from the LLM response. The LLM may not echo
 * objectivesProgress / templatesProgress / checkinsSummary exactly; merge those
 * in from our deterministic stats so consumers see complete data.
 */
function bilanStatsFromResponse(
  parsed: BilanResponse,
  deterministicStats: BilanStatsInput,
): BilanStatsInput {
  return {
    ...deterministicStats,
    global: parsed.stats.global,
    byPillar: Object.fromEntries(
      (['body', 'mind', 'finance', 'projects'] as const).map((p) => {
        const llm = parsed.stats.by_pillar[p];
        const det = deterministicStats.byPillar[p];
        return [
          p,
          llm
            ? {
                ...det,
                xp: llm.xp,
                completed: llm.completed,
                failed: llm.failed,
                skipped: llm.skipped,
                rate: llm.rate,
              }
            : det,
        ];
      }),
    ) as Record<PillarId, BilanStatsInput['byPillar'][PillarId]>,
    streaks: Object.fromEntries(
      (['body', 'mind', 'finance', 'projects'] as const).map((p) => {
        const llm = parsed.stats.streaks[p];
        const det = deterministicStats.streaks[p];
        return [p, llm ?? det];
      }),
    ) as Record<PillarId, { current: number; longest_in_period: number }>,
  };
}

/**
 * Build a deterministic fallback bilan from raw stats. Narrative explicitly
 * declares the degraded state in The System's voice - distinct `## Report state`
 * header signals "this is not a normal report" to the user without burying
 * the lede. Statistical sections and pattern detection still appear (both
 * are computed deterministically before the LLM call). Recommendations
 * section also flags degradation rather than silently emitting nothing.
 */
function synthesizeFallbackBilan(
  periodType: PeriodType,
  periodStart: string,
  periodEnd: string,
  stats: BilanStatsInput,
  detectedPatterns: DetectedPattern[],
): BilanResponse {
  const g = stats.global;
  const ratePct = (g.completion_rate * 100).toFixed(1);
  const lines: string[] = [
    `## Report state`,
    `LLM-driven narrative degraded. Statistical summary and pattern detection computed deterministically from data. Investigate Worker logs for the underlying cause.`,
    ``,
    `## Period summary`,
    `${periodType[0]!.toUpperCase() + periodType.slice(1)} period closed (${periodStart} → ${periodEnd}). ${g.completed}/${g.total_quests} quests cleared (${ratePct}%).`,
    ``,
    `## Performance per pillar`,
  ];
  for (const p of ['body', 'mind', 'finance', 'projects'] as const) {
    const ps = stats.byPillar[p];
    const pct = (ps.rate * 100).toFixed(0);
    lines.push(
      `- **${p}**: ${ps.completed}/${ps.assigned} (${pct}%), xp ${ps.xp}, streak ${stats.streaks[p].current}.`,
    );
  }
  lines.push(``, `## Detected patterns`);
  if (detectedPatterns.length === 0) {
    lines.push(`No patterns detected.`);
  } else {
    for (const dp of detectedPatterns) {
      lines.push(`- **${dp.type}**: ${dp.description}`);
    }
  }
  lines.push(``, `## Critical failures`, `No critical failure detected.`);
  lines.push(``, `## Recommendations for next period`);
  lines.push(
    `Generation degraded. No forward guidance issued this period. Once LLM analysis is restored, the next bilan will include recommendations.`,
  );

  const by_pillar = Object.fromEntries(
    (['body', 'mind', 'finance', 'projects'] as const).map((p) => {
      const ps = stats.byPillar[p];
      return [
        p,
        {
          xp: ps.xp,
          completed: ps.completed,
          failed: ps.failed,
          skipped: ps.skipped,
          rate: ps.rate,
        },
      ];
    }),
  ) as BilanResponse['stats']['by_pillar'];

  const streaks = Object.fromEntries(
    (['body', 'mind', 'finance', 'projects'] as const).map((p) => [p, stats.streaks[p]]),
  ) as BilanResponse['stats']['streaks'];

  return {
    stats: {
      global: g,
      by_pillar,
      streaks,
      objectives_progress: stats.objectivesProgress.map((o) => ({
        id: o.id,
        title: o.title,
        progress_pct: o.progress_pct,
        delta_in_period: o.delta_in_period,
      })),
      patterns_detected: detectedPatterns.map((dp) => ({
        type: dp.type,
        description: dp.description,
        confidence: dp.confidence,
      })),
    },
    narrative: lines.join('\n'),
    suggested_focus_next_period: null,
    suggested_template_adjustments: [],
  };
}

/**
 * Build the daily push payload. Appends
 * a single non-sensitive context bit (the focus pillar). Falls back to "balanced"
 * if no focus is currently set. No quest content, no XP, no LLM reasoning.
 */
function buildDailyPushPayload(state: SystemAgentState): {
  type: 'daily_assigned';
  title: string;
  body: string;
  url: string;
} {
  const focusLabel = state.currentFocus?.pillarId ?? 'balanced';
  return {
    type: 'daily_assigned',
    title: '[ THE SYSTEM ]',
    body: `Daily quests assigned. Focus: ${focusLabel}.`,
    url: '/',
  };
}

/**
 * Build the weekly bilan push payload. Looks up the latest weekly bilan in D1
 * so the notification URL points at it. If no weekly bilan exists yet (early
 * lifecycle), falls back to the list view at /bilans. ISO week number computed
 * from the bilan's period_start (or today if no bilan).
 */
async function buildWeeklyPushPayload(db: D1Database): Promise<{
  type: 'bilan_ready';
  title: string;
  body: string;
  url: string;
}> {
  const latest = await db
    .prepare(
      `SELECT id, period_start FROM bilans WHERE period_type = 'weekly' ORDER BY period_start DESC LIMIT 1`,
    )
    .first<{ id: number; period_start: string }>();
  const url = latest ? `/bilans/${latest.id}` : '/bilans';
  const refDateIso = latest?.period_start ?? new Date().toISOString().slice(0, 10);
  const week = isoWeekNumber(new Date(refDateIso + 'T00:00:00Z'));
  return {
    type: 'bilan_ready',
    title: '[ THE SYSTEM ]',
    body: `Weekly bilan available. Week ${week}.`,
    url,
  };
}

/**
 * ISO 8601 week-of-year (1-53) for a UTC date. Standard formula - Thursday
 * of the same week determines the year, week 1 is the week containing the
 * first Thursday.
 */
function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Monday=1 .. Sunday=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}
