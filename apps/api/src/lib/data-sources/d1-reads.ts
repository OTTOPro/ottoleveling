import type { PillarId } from '../../do/state';
import type {
  ConnectionStatus,
  DailyMetric,
  DailyMetricRow,
  DataSourceRow,
  MetricSummary,
  ProviderName,
  SyncStatus,
} from './types';

const PILLARS: PillarId[] = ['body', 'mind', 'finance', 'projects'];

export async function getDataSourceStatus(db: D1Database): Promise<DataSourceRow[]> {
  const { results } = await db
    .prepare(
      `SELECT provider, status, last_sync_at, last_sync_status, error_message, created_at FROM data_sources ORDER BY provider`,
    )
    .all<DataSourceRow>();
  return results;
}

export async function getDataSource(
  db: D1Database,
  provider: ProviderName,
): Promise<DataSourceRow | null> {
  return db
    .prepare(
      `SELECT provider, status, last_sync_at, last_sync_status, error_message, created_at FROM data_sources WHERE provider = ?`,
    )
    .bind(provider)
    .first<DataSourceRow>();
}

/**
 * Idempotent INSERT via UNIQUE(date, provider, metric) conflict resolution.
 * Re-running sync for the same date overwrites with the new value.
 */
export async function upsertDailyMetric(db: D1Database, m: DailyMetric): Promise<void> {
  await db
    .prepare(
      `INSERT INTO daily_metrics (date, pillar_id, provider, metric, value, metadata)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(date, provider, metric) DO UPDATE SET
         value = excluded.value,
         metadata = excluded.metadata,
         pillar_id = excluded.pillar_id,
         recorded_at = datetime('now')`,
    )
    .bind(
      m.date,
      m.pillar_id,
      m.provider,
      m.metric,
      m.value,
      m.metadata != null ? JSON.stringify(m.metadata) : null,
    )
    .run();
}

export async function recordSyncResult(
  db: D1Database,
  provider: ProviderName,
  status: ConnectionStatus,
  syncStatus: SyncStatus,
  errorMessage: string | null = null,
): Promise<void> {
  await db
    .prepare(
      `UPDATE data_sources
       SET status = ?, last_sync_at = datetime('now'), last_sync_status = ?, error_message = ?
       WHERE provider = ?`,
    )
    .bind(status, syncStatus, errorMessage, provider)
    .run();
}

/**
 * Reads last `days`-day metrics for `today`, groups by pillar, computes
 * per-metric MetricSummary (avg / latest / trend). Trend rule:
 * compare avg(last 3 days) vs avg(prior 4 days) within the `days`-day window,
 * ±5% deadband. The 'resting_hr' metric inverts semantic at format time.
 */
export async function getObjectiveMetrics(
  db: D1Database,
  today: string, // YYYY-MM-DD UTC
  days: number = 7,
): Promise<Record<PillarId, MetricSummary[]>> {
  const since = new Date(today + 'T00:00:00Z');
  since.setUTCDate(since.getUTCDate() - days);
  const sinceIso = since.toISOString().slice(0, 10);

  const { results } = await db
    .prepare(
      `SELECT id, date, pillar_id, provider, metric, value, metadata, recorded_at
       FROM daily_metrics
       WHERE date >= ? AND date <= ?
       ORDER BY metric, date`,
    )
    .bind(sinceIso, today)
    .all<DailyMetricRow>();

  const out: Record<PillarId, MetricSummary[]> = {
    body: [],
    mind: [],
    finance: [],
    projects: [],
  };
  const byKey = new Map<string, DailyMetricRow[]>();
  for (const r of results) {
    const key = `${r.pillar_id ?? 'null'}|${r.metric}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(r);
  }

  for (const [key, rows] of byKey) {
    const [pillarStr, metric] = key.split('|');
    if (!pillarStr || pillarStr === 'null') continue; // skip cross-pillar for now
    const pillar = pillarStr as PillarId;
    if (!PILLARS.includes(pillar)) continue;
    rows.sort((a, b) => a.date.localeCompare(b.date));
    const values = rows.map((r) => r.value);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const latest = values[values.length - 1]!;
    const trend = computeTrend(values);
    out[pillar].push({ metric: metric!, avg, latest, trend });
  }

  for (const p of PILLARS) {
    out[p].sort((a, b) => a.metric.localeCompare(b.metric));
  }
  return out;
}

function computeTrend(values: number[]): 'up' | 'down' | 'flat' {
  if (values.length < 4) return 'flat';
  const last3 = values.slice(-3);
  const prior = values.slice(0, values.length - 3);
  const avgLast = last3.reduce((a, b) => a + b, 0) / last3.length;
  const avgPrior = prior.reduce((a, b) => a + b, 0) / prior.length;
  if (avgPrior === 0) return 'flat';
  const ratio = avgLast / avgPrior;
  if (ratio >= 1.05) return 'up';
  if (ratio <= 0.95) return 'down';
  return 'flat';
}
