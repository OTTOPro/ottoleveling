import { describe, it, expect } from 'vitest';
import {
  startArc,
  progressArc,
  completeArc,
  failArc,
  abandonArc,
} from '../../src/lib/arcs/lifecycle';
import type { ArcRow, ProposedArc } from '../../src/lib/arcs/types';

function activeArc(overrides: Partial<ArcRow> = {}): ArcRow {
  return {
    id: 1,
    pillar_id: 'body',
    title: 'Trial of Discipline',
    description: 'Body discipline arc',
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

describe('startArc', () => {
  it('produces a fresh ArcRow with status active and completed_steps 0', () => {
    const proposal: ProposedArc = {
      pillar_id: 'body',
      title: 'Trial of Discipline',
      description: 'desc',
      total_steps: 7,
      expected_days: 7,
      total_xp_reward: 500,
    };
    const row = startArc(proposal, '2026-05-28T08:00:00Z', 30, 30);
    expect(row.status).toBe('active');
    expect(row.completed_steps).toBe(0);
    expect(row.id).toBe(0); // D1 assigns the real id
    expect(row.title).toBe('Trial of Discipline');
    expect(row.pillar_id).toBe('body');
    // started_at + 7 days
    expect(row.expected_end).toBe('2026-06-04T08:00:00.000Z');
  });

  it('clamps total_steps at max cap', () => {
    const proposal: ProposedArc = {
      pillar_id: 'mind',
      title: 'Long arc',
      description: 'desc',
      total_steps: 100,
      expected_days: 30,
      total_xp_reward: 1000,
    };
    const row = startArc(proposal, '2026-05-28T08:00:00Z', 30, 30);
    expect(row.total_steps).toBe(30);
  });

  it('clamps expected_days at max cap', () => {
    const proposal: ProposedArc = {
      pillar_id: 'projects',
      title: 'Long arc',
      description: 'desc',
      total_steps: 30,
      expected_days: 90,
      total_xp_reward: 2000,
    };
    const row = startArc(proposal, '2026-05-28T08:00:00Z', 30, 30);
    expect(row.expected_end).toBe('2026-06-27T08:00:00.000Z');
  });

  it('persists step_criteria into metadata when present', () => {
    const proposal: ProposedArc = {
      pillar_id: 'mind',
      title: 'Study arc',
      description: 'desc',
      total_steps: 3,
      expected_days: 3,
      total_xp_reward: 300,
      step_criteria: ['Read chapter 1', 'Read chapter 2', 'Read chapter 3'],
    };
    const row = startArc(proposal, '2026-05-28T08:00:00Z', 30, 30);
    expect(row.metadata).not.toBeNull();
    const parsed = JSON.parse(row.metadata!) as { step_criteria: string[] };
    expect(parsed.step_criteria).toHaveLength(3);
    expect(parsed.step_criteria[0]).toBe('Read chapter 1');
  });

  it('metadata is null when step_criteria not provided', () => {
    const proposal: ProposedArc = {
      pillar_id: 'body',
      title: 'arc',
      description: 'desc',
      total_steps: 7,
      expected_days: 7,
      total_xp_reward: 500,
    };
    const row = startArc(proposal, '2026-05-28T08:00:00Z', 30, 30);
    expect(row.metadata).toBeNull();
  });
});

describe('progressArc', () => {
  it('increments completed_steps by 1', () => {
    const arc = activeArc({ completed_steps: 2 });
    const next = progressArc(arc);
    expect(next.completed_steps).toBe(3);
    expect(next.status).toBe('active');
  });

  it('does NOT mutate the input row (pure)', () => {
    const arc = activeArc({ completed_steps: 2 });
    progressArc(arc);
    expect(arc.completed_steps).toBe(2);
  });

  it('on the final step, completed_steps reaches total_steps but status stays active', () => {
    const arc = activeArc({ completed_steps: 6, total_steps: 7 });
    const next = progressArc(arc);
    expect(next.completed_steps).toBe(7);
    expect(next.status).toBe('active');
  });
});

describe('completeArc', () => {
  it('flips status to completed and sets completed_at', () => {
    const arc = activeArc({ completed_steps: 7, total_steps: 7 });
    const next = completeArc(arc, '2026-06-04T20:00:00Z');
    expect(next.status).toBe('completed');
    expect(next.completed_at).toBe('2026-06-04T20:00:00Z');
  });

  it('does NOT mutate the input row (pure)', () => {
    const arc = activeArc({ completed_steps: 7, total_steps: 7 });
    completeArc(arc, '2026-06-04T20:00:00Z');
    expect(arc.status).toBe('active');
    expect(arc.completed_at).toBeNull();
  });
});

describe('failArc', () => {
  it('flips status to failed and sets completed_at to the failure timestamp', () => {
    const arc = activeArc({ completed_steps: 3, total_steps: 7 });
    const next = failArc(arc, '2026-06-04T08:00:00Z');
    expect(next.status).toBe('failed');
    expect(next.completed_at).toBe('2026-06-04T08:00:00Z');
    // completed_steps preserved as historical record
    expect(next.completed_steps).toBe(3);
  });
});

describe('abandonArc', () => {
  it('flips status to abandoned and sets completed_at', () => {
    const arc = activeArc({ completed_steps: 2, total_steps: 7 });
    const next = abandonArc(arc, '2026-06-01T12:00:00Z');
    expect(next.status).toBe('abandoned');
    expect(next.completed_at).toBe('2026-06-01T12:00:00Z');
  });

  it('is idempotent on already-abandoned arcs (preserves original completed_at)', () => {
    const arc = activeArc({ status: 'abandoned', completed_at: '2026-06-01T12:00:00Z' });
    const next = abandonArc(arc, '2026-06-02T08:00:00Z');
    expect(next.status).toBe('abandoned');
    expect(next.completed_at).toBe('2026-06-01T12:00:00Z');
  });
});
