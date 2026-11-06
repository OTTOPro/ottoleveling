import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import {
  evaluateNewProposal,
  getActiveArcs,
  checkExpiredArcs,
  MAX_ACTIVE_PER_PILLAR,
  MAX_ACTIVE_TOTAL,
} from '../../src/lib/arcs/evaluate';
import type { ArcRow, ProposedArc } from '../../src/lib/arcs/types';

function arc(overrides: Partial<ArcRow> = {}): ArcRow {
  return {
    id: 1,
    pillar_id: 'body',
    title: 'T',
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

function proposal(overrides: Partial<ProposedArc> = {}): ProposedArc {
  return {
    pillar_id: 'body',
    title: 'New trial',
    description: 'desc',
    total_steps: 7,
    expected_days: 7,
    total_xp_reward: 500,
    ...overrides,
  };
}

describe('evaluateNewProposal (concurrency gate)', () => {
  it('accepts a proposal when no active arcs exist', () => {
    const res = evaluateNewProposal(proposal(), []);
    expect(res.ok).toBe(true);
  });

  it('rejects a body proposal when 2 body arcs already active (per-pillar cap)', () => {
    const active = [arc({ id: 1, pillar_id: 'body' }), arc({ id: 2, pillar_id: 'body' })];
    const res = evaluateNewProposal(proposal({ pillar_id: 'body' }), active);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('per_pillar_cap_reached');
  });

  it('accepts a mind proposal even with 2 body arcs active', () => {
    const active = [arc({ id: 1, pillar_id: 'body' }), arc({ id: 2, pillar_id: 'body' })];
    const res = evaluateNewProposal(proposal({ pillar_id: 'mind' }), active);
    expect(res.ok).toBe(true);
  });

  it('rejects any proposal when 5 active arcs already total (total cap)', () => {
    const active: ArcRow[] = [
      arc({ id: 1, pillar_id: 'body' }),
      arc({ id: 2, pillar_id: 'mind' }),
      arc({ id: 3, pillar_id: 'finance' }),
      arc({ id: 4, pillar_id: 'projects' }),
      arc({ id: 5, pillar_id: 'mind' }),
    ];
    const res = evaluateNewProposal(proposal({ pillar_id: 'finance' }), active);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('total_cap_reached');
  });

  it('only counts ACTIVE arcs toward the caps (completed/failed/abandoned ignored)', () => {
    const active: ArcRow[] = [
      arc({ id: 1, pillar_id: 'body', status: 'completed' }),
      arc({ id: 2, pillar_id: 'body', status: 'abandoned' }),
    ];
    const res = evaluateNewProposal(proposal({ pillar_id: 'body' }), active);
    expect(res.ok).toBe(true);
  });

  it('exposes the limit constants', () => {
    expect(MAX_ACTIVE_PER_PILLAR).toBe(2);
    expect(MAX_ACTIVE_TOTAL).toBe(5);
  });
});

describe('getActiveArcs / checkExpiredArcs against D1', () => {
  it('getActiveArcs returns only status=active rows', async () => {
    await env.DB.prepare(
      `INSERT INTO quest_arcs (id, pillar_id, title, description, total_steps, completed_steps, status, started_at, expected_end, total_xp_reward)
       VALUES (1, 'body', 'A', 'D', 7, 0, 'active', '2026-05-28T08:00:00Z', '2026-06-04T08:00:00Z', 500),
              (2, 'mind', 'B', 'D', 7, 7, 'completed', '2026-05-01T08:00:00Z', '2026-05-08T08:00:00Z', 500),
              (3, 'finance', 'C', 'D', 7, 3, 'abandoned', '2026-05-10T08:00:00Z', '2026-05-17T08:00:00Z', 500)`,
    ).run();
    const active = await getActiveArcs(env.DB);
    expect(active).toHaveLength(1);
    expect(active[0]!.id).toBe(1);
  });

  it('checkExpiredArcs flips expired-but-incomplete active arcs to failed', async () => {
    await env.DB.prepare(
      `INSERT INTO quest_arcs (id, pillar_id, title, description, total_steps, completed_steps, status, started_at, expected_end, total_xp_reward)
       VALUES (10, 'body', 'Expired', 'D', 7, 3, 'active', '2026-05-01T08:00:00Z', '2026-05-15T08:00:00Z', 500),
              (11, 'mind', 'On time', 'D', 7, 2, 'active', '2026-05-25T08:00:00Z', '2026-06-02T08:00:00Z', 500)`,
    ).run();
    const res = await checkExpiredArcs(env.DB, '2026-05-28');
    expect(res.failed).toBe(1);
    expect(res.failed_arc_ids).toEqual([10]);
    const after = await env.DB.prepare(`SELECT id, status FROM quest_arcs ORDER BY id`).all<{
      id: number;
      status: string;
    }>();
    expect(after.results.find((r) => r.id === 10)!.status).toBe('failed');
    expect(after.results.find((r) => r.id === 11)!.status).toBe('active');
  });

  it('checkExpiredArcs does NOT fail arcs that have completed_steps == total_steps even if past expected_end (safety against race)', async () => {
    await env.DB.prepare(
      `INSERT INTO quest_arcs (id, pillar_id, title, description, total_steps, completed_steps, status, started_at, expected_end, total_xp_reward)
       VALUES (20, 'body', 'Done late', 'D', 7, 7, 'active', '2026-05-01T08:00:00Z', '2026-05-15T08:00:00Z', 500)`,
    ).run();
    const res = await checkExpiredArcs(env.DB, '2026-05-28');
    expect(res.failed).toBe(0);
    expect(res.failed_arc_ids).toEqual([]);
  });
});
