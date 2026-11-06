import { describe, it, expect } from 'vitest';
import { formatObjectiveMetricsSnapshot } from '../../src/lib/data-sources/format';
import type { MetricSummary } from '../../src/lib/data-sources/types';
import type { PillarId } from '../../src/do/state';

const empty: Record<PillarId, MetricSummary[]> = { body: [], mind: [], finance: [], projects: [] };

describe('formatObjectiveMetricsSnapshot', () => {
  it('returns the empty-state string when no metrics exist', () => {
    expect(formatObjectiveMetricsSnapshot(empty)).toBe('No objective metrics connected.');
  });

  it('renders per-pillar header + per-metric line for the populated pillar', () => {
    const out = formatObjectiveMetricsSnapshot({
      ...empty,
      body: [
        { metric: 'steps', avg: 8200, latest: 9600, trend: 'up' },
        { metric: 'sleep_minutes', avg: 412, latest: 380, trend: 'down' },
      ],
    });
    expect(out).toContain('- body (last 7d):');
    expect(out).toContain('steps');
    expect(out).toContain('avg 8,200');
    expect(out).toContain('latest 9,600');
    expect(out).toContain('↑');
    expect(out).toContain('sleep_minutes');
    expect(out).toContain('↓');
    expect(out).toContain('- mind: no objective sources connected');
  });

  it('inverts trend annotation for resting_hr (lower-is-better semantic)', () => {
    const out = formatObjectiveMetricsSnapshot({
      ...empty,
      body: [{ metric: 'resting_hr', avg: 58, latest: 56, trend: 'down' }],
    });
    expect(out).toContain('↓ (improving)');
    expect(out).not.toContain('↓ (worsening)');
  });

  it('marks resting_hr as worsening when trending up', () => {
    const out = formatObjectiveMetricsSnapshot({
      ...empty,
      body: [{ metric: 'resting_hr', avg: 58, latest: 62, trend: 'up' }],
    });
    expect(out).toContain('↑ (worsening)');
  });

  it('keeps every line at or under 80 chars for typical Google Health metric set', () => {
    const out = formatObjectiveMetricsSnapshot({
      ...empty,
      body: [
        { metric: 'steps', avg: 8200, latest: 9600, trend: 'up' },
        { metric: 'heart_rate_avg', avg: 72, latest: 70, trend: 'flat' },
        { metric: 'sleep_minutes', avg: 412, latest: 380, trend: 'down' },
        { metric: 'hrv_rmssd', avg: 48.3, latest: 51.2, trend: 'flat' },
        { metric: 'resting_hr', avg: 58, latest: 56, trend: 'down' },
      ],
    });
    for (const line of out.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });
});
