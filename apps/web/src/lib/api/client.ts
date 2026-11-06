import { API_BASE, DEV_TOKEN } from '$lib/config/env';
import { accessJwtStore } from '$lib/state/access-jwt.svelte';
import type {
  Objective,
  CreateObjectiveInput,
  UpdateObjectiveInput,
  Quest,
  CreateManualQuestInput,
  Completion,
  PillarStats,
  CompositeTitleResponse,
  PillarId,
  CurrentFocus,
  FocusHorizon,
  SystemAgentSnapshot,
  QuestTemplate,
  CreateTemplateInput,
  UpdateTemplateInput,
  TodayResponse,
  GenerationBatchResponse,
  Bilan,
  BilanListItem,
  Checkin,
  CreateCheckinInput,
  PeriodType,
  PushSubscriptionStatus,
  SubscribePushInput,
  Achievement,
  Arc,
  DataSourceRow,
  ProviderName,
  LibrarySaveSummary,
  ConfigResponse,
  SpotifyShowFilter,
  CalibrationCurrentResponse,
  ActiveProject,
  ListProjectsResponse,
  ProjectResponse,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectStatus,
} from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API ${status}`);
  }
}

/**
 * Auth headers for an API call. Production uses the Cloudflare Access JWT
 * (read from the CF_Authorization cookie by hooks.server.ts). Under
 * `vite dev`, when no JWT is present, the shared PUBLIC_DEV_TOKEN is sent as
 * x-dev-token instead; the API only accepts it outside production.
 */
export async function authHeaders(init?: HeadersInit): Promise<Headers> {
  const headers = new Headers(init);
  // Wait for the root layout to seed the JWT, so early onMount fetches do not
  // race it. Resolved after the first seed, so this costs nothing afterwards.
  await accessJwtStore.ready();
  const jwt = accessJwtStore.get();
  if (jwt) {
    headers.set('authorization', `Bearer ${jwt}`);
  } else if (DEV_TOKEN) {
    headers.set('x-dev-token', DEV_TOKEN);
  } else {
    throw new Error('Not authenticated: no Access JWT and no development token');
  }
  return headers;
}

/** Authenticated fetch against the API that returns the raw Response. */
export async function apiRequest(path: string, init?: RequestInit): Promise<Response> {
  if (!API_BASE) throw new Error('PUBLIC_API_BASE not configured');
  const headers = await authHeaders(init?.headers);
  if (init?.body) headers.set('content-type', 'application/json');
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiRequest(path, init);
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<T>;
}

export async function getObjectives(opts?: {
  pillar_id?: PillarId;
  show?: 'trash';
}): Promise<Objective[]> {
  const params = new URLSearchParams();
  if (opts?.pillar_id) params.set('pillar_id', opts.pillar_id);
  if (opts?.show === 'trash') params.set('show', 'trash');
  const qs = params.toString() ? `?${params.toString()}` : '';
  const data = await apiFetch<{ objectives: Objective[] }>(`/api/objectives${qs}`);
  return data.objectives;
}

/** @deprecated Use getObjectives({ pillar_id }) instead */
export async function getObjectivesByPillar(pillar_id?: PillarId): Promise<Objective[]> {
  return getObjectives(pillar_id ? { pillar_id } : undefined);
}

export async function createObjective(input: CreateObjectiveInput): Promise<Objective> {
  const data = await apiFetch<{ objective: Objective }>('/api/objectives', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.objective;
}

export async function updateObjective(id: number, patch: UpdateObjectiveInput): Promise<Objective> {
  const data = await apiFetch<{ objective: Objective }>(`/api/objectives/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return data.objective;
}

export async function softDeleteObjective(
  id: number,
): Promise<{ ok: boolean; idempotent?: boolean }> {
  return apiFetch<{ ok: boolean; idempotent?: boolean }>(`/api/objectives/${id}`, {
    method: 'DELETE',
  });
}

export async function restoreObjective(id: number): Promise<{ ok: boolean; idempotent?: boolean }> {
  return apiFetch<{ ok: boolean; idempotent?: boolean }>(`/api/objectives/${id}/restore`, {
    method: 'POST',
  });
}

export async function hardDeleteObjective(id: number): Promise<{ ok: boolean; purged: boolean }> {
  return apiFetch<{ ok: boolean; purged: boolean }>(`/api/objectives/${id}?permanent=true`, {
    method: 'DELETE',
  });
}

export async function createManualQuest(input: CreateManualQuestInput): Promise<Quest> {
  const data = await apiFetch<{ quest: Quest }>('/api/quests/manual', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.quest;
}

export async function completeQuest(id: number, notes?: string): Promise<Completion> {
  const data = await apiFetch<{ completion: Completion }>(`/api/quests/${id}/complete`, {
    method: 'POST',
    body: JSON.stringify({ notes: notes ?? null }),
  });
  return data.completion;
}

export async function failQuest(id: number, notes?: string): Promise<Completion> {
  const data = await apiFetch<{ completion: Completion }>(`/api/quests/${id}/fail`, {
    method: 'POST',
    body: JSON.stringify({ notes: notes ?? null }),
  });
  return data.completion;
}

export async function skipQuest(id: number, notes?: string): Promise<Completion> {
  const data = await apiFetch<{ completion: Completion }>(`/api/quests/${id}/skip`, {
    method: 'POST',
    body: JSON.stringify({ notes: notes ?? null }),
  });
  return data.completion;
}

export async function getPillarStats(): Promise<PillarStats[]> {
  const data = await apiFetch<{ pillars: PillarStats[] }>('/api/stats/pillars');
  return data.pillars;
}

export async function getCompositeTitle(): Promise<CompositeTitleResponse> {
  return await apiFetch<CompositeTitleResponse>('/api/stats/composite');
}

export async function getFocus(): Promise<CurrentFocus | null> {
  const data = await apiFetch<{ focus: CurrentFocus | null }>('/api/focus');
  return data.focus;
}

export async function setFocus(pillar_id: PillarId, horizon: FocusHorizon): Promise<CurrentFocus> {
  const data = await apiFetch<{ focus: CurrentFocus }>('/api/focus', {
    method: 'POST',
    body: JSON.stringify({ pillar_id, horizon }),
  });
  return data.focus;
}

export async function getSystemState(): Promise<SystemAgentSnapshot> {
  const data = await apiFetch<{ state: SystemAgentSnapshot }>('/api/state');
  return data.state;
}

// ─────────────────────────────────────────────────────────────────────
// Today + generation + templates
// ─────────────────────────────────────────────────────────────────────

export async function getToday(): Promise<TodayResponse> {
  return await apiFetch<TodayResponse>('/api/quests/today');
}

export async function generateDaily(): Promise<GenerationBatchResponse> {
  return await apiFetch<GenerationBatchResponse>('/api/quests/generate', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function regenerateDaily(): Promise<GenerationBatchResponse> {
  return await apiFetch<GenerationBatchResponse>('/api/quests/regenerate', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function getTemplates(opts?: {
  activeOnly?: boolean;
  show?: 'trash';
}): Promise<QuestTemplate[]> {
  let qs = '';
  if (opts?.show === 'trash') {
    qs = '?show=trash';
  } else if (opts?.activeOnly !== false) {
    qs = '?active=true';
  }
  const data = await apiFetch<{ templates: QuestTemplate[] }>(`/api/templates${qs}`);
  return data.templates;
}

export async function createTemplate(input: CreateTemplateInput): Promise<QuestTemplate> {
  const data = await apiFetch<{ template: QuestTemplate }>('/api/templates', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.template;
}

export async function updateTemplate(
  id: number,
  patch: UpdateTemplateInput,
): Promise<QuestTemplate> {
  const data = await apiFetch<{ template: QuestTemplate }>(`/api/templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return data.template;
}

export async function softDeleteTemplate(
  id: number,
): Promise<{ ok: boolean; idempotent?: boolean }> {
  return apiFetch<{ ok: boolean; idempotent?: boolean }>(`/api/templates/${id}`, {
    method: 'DELETE',
  });
}

export async function restoreTemplate(id: number): Promise<{ ok: boolean; idempotent?: boolean }> {
  return apiFetch<{ ok: boolean; idempotent?: boolean }>(`/api/templates/${id}/restore`, {
    method: 'POST',
  });
}

export async function hardDeleteTemplate(id: number): Promise<{ ok: boolean; purged: boolean }> {
  return apiFetch<{ ok: boolean; purged: boolean }>(`/api/templates/${id}?permanent=true`, {
    method: 'DELETE',
  });
}

export async function getTemplateCompletionCount(id: number): Promise<{ count: number }> {
  return apiFetch<{ count: number }>(`/api/templates/${id}/completion-count`);
}

/** @deprecated Use softDeleteTemplate instead */
export async function deactivateTemplate(id: number): Promise<{ ok: boolean }> {
  return softDeleteTemplate(id);
}

// ─────────────────────────────────────────────────────────────────────
// Bilans + checkins
// ─────────────────────────────────────────────────────────────────────

export async function getBilans(periodType?: PeriodType): Promise<BilanListItem[]> {
  const qs = periodType ? `?period_type=${periodType}` : '';
  const data = await apiFetch<{ bilans: BilanListItem[] }>(`/api/bilans${qs}`);
  return data.bilans;
}

export async function getBilan(id: number): Promise<Bilan> {
  const data = await apiFetch<{ bilan: Bilan }>(`/api/bilans/${id}`);
  return data.bilan;
}

export async function generateBilan(
  period_type: PeriodType,
  period_start?: string,
  period_end?: string,
): Promise<Bilan> {
  const body: Record<string, unknown> = { period_type };
  if (period_start) body.period_start = period_start;
  if (period_end) body.period_end = period_end;
  const data = await apiFetch<{ bilan: Bilan }>(`/api/bilans/generate`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return data.bilan;
}

export async function getRecentCheckins(): Promise<Checkin[]> {
  const data = await apiFetch<{ checkins: Checkin[] }>('/api/checkins/recent');
  return data.checkins;
}

export async function createCheckin(input: CreateCheckinInput): Promise<Checkin> {
  const data = await apiFetch<{ checkin: Checkin }>('/api/checkins', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.checkin;
}

// ─────────────────────────────────────────────────────────────────────
// Push notifications
// ─────────────────────────────────────────────────────────────────────

/**
 * Fetch the VAPID public key. Public endpoint - does NOT include the
 * x-dev-token header (the frontend needs this before the user has even
 * granted notification permission).
 */
export async function getVapidPublicKey(): Promise<string> {
  if (!API_BASE) throw new Error('PUBLIC_API_BASE not configured');
  const res = await fetch(`${API_BASE}/api/push/vapid-key`);
  if (!res.ok) throw new ApiError(res.status, await res.text());
  const data = (await res.json()) as { publicKey: string };
  return data.publicKey;
}

export async function subscribePush(
  sub: SubscribePushInput,
): Promise<{ id: number; endpoint: string }> {
  const data = await apiFetch<{ subscription: { id: number; endpoint: string } }>(
    '/api/push/subscribe',
    {
      method: 'POST',
      body: JSON.stringify(sub),
    },
  );
  return data.subscription;
}

export async function unsubscribePush(endpoint: string): Promise<number> {
  const data = await apiFetch<{ deleted: number }>('/api/push/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint }),
  });
  return data.deleted;
}

export async function getPushStatus(endpoint?: string): Promise<PushSubscriptionStatus> {
  const qs = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : '';
  return await apiFetch<PushSubscriptionStatus>(`/api/push/status${qs}`);
}

/**
 * Fire a test notification to all current subscriptions (patch 1).
 * No LLM call, no D1 quest mutation - exercises the push path only.
 */
export async function sendTestPush(
  type: 'daily' | 'weekly',
): Promise<{ sent: number; failed: number; deleted: number }> {
  return await apiFetch<{ sent: number; failed: number; deleted: number }>('/api/push/test', {
    method: 'POST',
    body: JSON.stringify({ type }),
  });
}

// ─────────────────────────────────────────────────────────────────────
// Achievements
// ─────────────────────────────────────────────────────────────────────

export async function getAchievements(filter?: 'unlocked' | 'locked'): Promise<Achievement[]> {
  let url = '/api/achievements';
  if (filter === 'unlocked') url += '?unlocked=true';
  else if (filter === 'locked') url += '?unlocked=false';
  const data = await apiFetch<{ achievements: Achievement[] }>(url);
  return data.achievements;
}

// ─────────────────────────────────────────────────────────────────────
// Quest arcs
// ─────────────────────────────────────────────────────────────────────

export async function getArcs(
  filter?: 'active' | 'completed' | 'failed' | 'abandoned',
): Promise<Arc[]> {
  let url = '/api/arcs';
  if (filter) url += `?status=${filter}`;
  const data = await apiFetch<{ arcs: Arc[] }>(url);
  return data.arcs;
}

export async function abandonArc(id: number): Promise<Arc> {
  const data = await apiFetch<{ arc: Arc }>(`/api/arcs/${id}/abandon`, { method: 'POST' });
  return data.arc;
}

// ─────────────────────────────────────────────────────────────────────
// Data sources
// ─────────────────────────────────────────────────────────────────────

export async function getDataSourcesStatus(): Promise<DataSourceRow[]> {
  const data = await apiFetch<{ data_sources: DataSourceRow[] }>('/api/data-sources/status');
  return data.data_sources;
}

export async function disconnectDataSource(provider: ProviderName): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/data-sources/${provider}`, { method: 'DELETE' });
}

// ─────────────────────────────────────────────────────────────────────
// Library save activity (Spotify)
// ─────────────────────────────────────────────────────────────────────

export async function getCurrentListening(): Promise<LibrarySaveSummary[]> {
  const data = await apiFetch<{ items: LibrarySaveSummary[] }>(
    '/api/data-sources/current-listening',
  );
  return data.items;
}

// ─────────────────────────────────────────────────────────────────────
// Auto-complete admin trigger
// ─────────────────────────────────────────────────────────────────────

export async function triggerAutoCompleteNow(): Promise<{
  attempted: number;
  completed: number;
  ran_at: string;
}> {
  return apiFetch<{ attempted: number; completed: number; ran_at: string }>(
    '/api/admin/auto-complete-now',
    { method: 'POST' },
  );
}

// ─────────────────────────────────────────────────────────────────────
// Server config
// ─────────────────────────────────────────────────────────────────────

export async function getConfig(): Promise<ConfigResponse> {
  return apiFetch<ConfigResponse>('/api/config');
}

// ─────────────────────────────────────────────────────────────────────
// Calibration signals
// ─────────────────────────────────────────────────────────────────────

export async function getCalibrationCurrent(): Promise<CalibrationCurrentResponse> {
  return apiFetch<CalibrationCurrentResponse>('/api/calibration/current');
}

// ─────────────────────────────────────────────────────────────────────
// Stats analytics
// ─────────────────────────────────────────────────────────────────────

export interface HeatmapCell {
  day: string;
  count: number;
}
export interface HeatmapResponse {
  cells: HeatmapCell[];
  days: number;
  today: string;
}
export interface XpSeriesPoint {
  day: string;
  xp: number;
}
export interface XpSeriesResponse {
  series: XpSeriesPoint[];
  days: number;
  today: string;
}
export interface RecentAchievement {
  id: string;
  name: string;
  pillar_id: string | null;
  unlocked_at: string;
}
export interface RecentAchievementsResponse {
  achievements: RecentAchievement[];
  days: number;
}
export interface LifetimeTotalsResponse {
  total_xp: number;
  total_quests: number;
  active_days: number;
  hunter_since: string | null;
}

export async function getStatsHeatmap(days = 90): Promise<HeatmapResponse> {
  return apiFetch<HeatmapResponse>(`/api/stats/heatmap?days=${days}`);
}
export async function getStatsXpSeries(days = 30): Promise<XpSeriesResponse> {
  return apiFetch<XpSeriesResponse>(`/api/stats/xp-series?days=${days}`);
}
export async function getStatsRecentAchievements(days = 30): Promise<RecentAchievementsResponse> {
  return apiFetch<RecentAchievementsResponse>(`/api/stats/recent-achievements?days=${days}`);
}
export async function getStatsLifetime(): Promise<LifetimeTotalsResponse> {
  return apiFetch<LifetimeTotalsResponse>('/api/stats/lifetime');
}

// Stat distribution for the Radar chart
export type StatType = 'END' | 'STR' | 'FLEX' | 'INT' | 'WIS' | 'CAP' | 'CRAFT' | 'FOCUS';
export interface StatDistributionEntry {
  type: StatType;
  total: number;
}
export interface StatDistributionResponse {
  distribution: StatDistributionEntry[];
}

export async function getStatsDistribution(): Promise<StatDistributionResponse> {
  return apiFetch<StatDistributionResponse>('/api/stats/distribution');
}

// ─────────────────────────────────────────────────────────────────────
// Spotify show filters
// ─────────────────────────────────────────────────────────────────────

export async function listSpotifyShowFilters(): Promise<{ filters: SpotifyShowFilter[] }> {
  return apiFetch<{ filters: SpotifyShowFilter[] }>('/api/sources/spotify/filters');
}

export async function setSpotifyShowFilter(
  uri: string,
  include: boolean,
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/sources/spotify/filters/${encodeURIComponent(uri)}`, {
    method: 'PATCH',
    body: JSON.stringify({ include_in_mind_learning: include }),
  });
}

// ─────────────────────────────────────────────────────────────────────
// Active projects
// ─────────────────────────────────────────────────────────────────────

export type {
  ActiveProject,
  ListProjectsResponse,
  ProjectResponse,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectStatus,
};

export async function listProjects(
  opts: { show?: 'trash'; status?: ProjectStatus } = {},
): Promise<ListProjectsResponse> {
  const params = new URLSearchParams();
  if (opts.show) params.set('show', opts.show);
  if (opts.status) params.set('status', opts.status);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<ListProjectsResponse>(`/api/projects${qs}`);
}

export async function getProject(id: number): Promise<ProjectResponse> {
  return apiFetch<ProjectResponse>(`/api/projects/${id}`);
}

export async function createProject(input: CreateProjectInput): Promise<ProjectResponse> {
  return apiFetch<ProjectResponse>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateProject(
  id: number,
  input: UpdateProjectInput,
): Promise<ProjectResponse> {
  return apiFetch<ProjectResponse>(`/api/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function softDeleteProject(id: number): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/projects/${id}`, { method: 'DELETE' });
}

export async function permanentDeleteProject(id: number): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/projects/${id}?permanent=true`, { method: 'DELETE' });
}

export async function restoreProject(id: number): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/projects/${id}/restore`, { method: 'POST' });
}

// ─────────────────────────────────────────────────────────────────────
// Orchestration admin endpoints
// ─────────────────────────────────────────────────────────────────────

export interface QueueDepthEntry {
  name: string;
  dlq_count: number;
  note: string;
}

export interface QueueDepthResponse {
  queues: QueueDepthEntry[];
}

export interface DlqRow {
  id: number;
  message_type: string;
  error_message: string | null;
  attempt_count: number;
  failed_at: string;
  message_body: string;
}

export interface DlqResponse {
  llm_dlq: DlqRow[];
  events_dlq: DlqRow[];
}

export interface ActiveWorkflow {
  objective_id: number;
  workflow_run_id: string;
  current_phase: number;
  transitioned_at: string | null;
  completed_at: string | null;
  title: string;
}

export interface WorkflowsResponse {
  active_objective_workflows: ActiveWorkflow[];
}

export async function getOrchestrationQueueDepth(): Promise<QueueDepthResponse> {
  return apiFetch<QueueDepthResponse>('/api/admin/orchestration/queue-depth');
}

export async function getOrchestrationDlq(): Promise<DlqResponse> {
  return apiFetch<DlqResponse>('/api/admin/orchestration/dlq');
}

export async function getOrchestrationWorkflows(): Promise<WorkflowsResponse> {
  return apiFetch<WorkflowsResponse>('/api/admin/orchestration/workflows');
}

export async function retryDlqMessage(
  id: number,
  queue: 'llm_jobs' | 'events',
): Promise<{ ok: true; replayed_to: string }> {
  return apiFetch<{ ok: true; replayed_to: string }>(
    `/api/admin/orchestration/dlq/retry/${id}?queue=${queue}`,
    { method: 'POST' },
  );
}
