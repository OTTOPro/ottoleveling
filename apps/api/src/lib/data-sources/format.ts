import type { PillarId } from '../../do/state';
import type { MetricSummary } from './types';

const PILLARS: PillarId[] = ['body', 'mind', 'finance', 'projects'];

const TREND_ARROWS: Record<'up' | 'down' | 'flat', string> = {
  up: '↑',
  down: '↓',
  flat: '→',
};

const RESTING_HR_TREND_ANNOTATIONS: Record<'up' | 'down' | 'flat', string> = {
  up: '↑ (worsening)',
  down: '↓ (improving)',
  flat: '→',
};

/**
 * Renders the {OBJECTIVE_METRICS} placeholder.
 * Per-pillar grouping, per-metric `avg / latest / trend-arrow` summary.
 * Empty (no providers connected at all): "No objective metrics connected."
 * Per-line cap target: 80 chars.
 */
export function formatObjectiveMetricsSnapshot(metrics: Record<PillarId, MetricSummary[]>): string {
  const total = PILLARS.reduce((sum, p) => sum + metrics[p].length, 0);
  if (total === 0) return 'No objective metrics connected.';

  const lines: string[] = [];
  for (const p of PILLARS) {
    if (metrics[p].length === 0) {
      lines.push(`- ${p}: no objective sources connected`);
      continue;
    }
    lines.push(`- ${p} (last 7d):`);
    for (const m of metrics[p]) {
      const arrow =
        m.metric === 'resting_hr' ? RESTING_HR_TREND_ANNOTATIONS[m.trend] : TREND_ARROWS[m.trend];
      const avgStr = formatValue(m.avg);
      const latestStr = formatValue(m.latest);
      const label = m.metric.padEnd(20);
      lines.push(`  - ${label} avg ${avgStr} / latest ${latestStr} / ${arrow}`);
    }
  }
  return lines.join('\n');
}

function formatValue(v: number): string {
  if (Number.isInteger(v)) return v.toLocaleString('en-US');
  return v.toFixed(1);
}
