import { describe, it, expect } from 'vitest';
import { formatActiveArcsSnapshot } from '../../src/lib/arcs/format';
import type { ArcRow } from '../../src/lib/arcs/types';

function arc(overrides: Partial<ArcRow> = {}): ArcRow {
  return {
    id: 1,
    pillar_id: 'body',
    title: 'Trial of Discipline',
    description: 'D',
    total_steps: 7,
    completed_steps: 0,
    status: 'active',
    started_at: '2026-05-28T08:00:00Z',
    expected_end: '2026-06-04T08:00:00Z',
    completed_at: null,
    total_xp_reward: 500,
    metadata: null,
    ...overrides,
  };
}

describe('formatActiveArcsSnapshot', () => {
  it('returns "None active." when no arcs are active', () => {
    expect(formatActiveArcsSnapshot([])).toBe('None active.');
  });

  it('returns "None active." when arcs exist but all are terminated', () => {
    const arcs = [arc({ status: 'completed' }), arc({ status: 'failed' })];
    expect(formatActiveArcsSnapshot(arcs)).toBe('None active.');
  });

  it('renders one line per active arc with [arc N] handle, pillar, title, progress, end-date', () => {
    const arcs = [
      arc({
        id: 3,
        pillar_id: 'body',
        title: 'Trial of Discipline',
        completed_steps: 4,
        total_steps: 7,
        expected_end: '2026-06-10T08:00:00Z',
      }),
      arc({
        id: 5,
        pillar_id: 'projects',
        title: 'Recipe App Sprint',
        completed_steps: 2,
        total_steps: 14,
        expected_end: '2026-06-22T08:00:00Z',
      }),
    ];
    const out = formatActiveArcsSnapshot(arcs);
    const lines = out.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('[arc 3]');
    expect(lines[0]).toContain('body');
    expect(lines[0]).toContain('Trial of Discipline');
    expect(lines[0]).toContain('4/7 steps');
    expect(lines[0]).toContain('ends 2026-06-10');
    expect(lines[1]).toContain('[arc 5]');
    expect(lines[1]).toContain('Recipe App Sprint');
  });

  it('shows em-dash when expected_end is NULL', () => {
    const arcs = [arc({ expected_end: null })];
    expect(formatActiveArcsSnapshot(arcs)).toContain('ends -');
  });

  it('each rendered line stays at or under 80 chars for typical titles', () => {
    const arcs = [
      arc({
        id: 12,
        pillar_id: 'projects',
        title: 'Recipe app: Search Module',
        completed_steps: 14,
        total_steps: 30,
        expected_end: '2026-06-27T08:00:00Z',
      }),
    ];
    for (const line of formatActiveArcsSnapshot(arcs).split('\n')) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });
});
