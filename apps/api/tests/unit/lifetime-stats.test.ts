import { describe, it, expect } from 'vitest';
import { formatLifetimeSnapshot, type LifetimeStatsRow } from '../../src/lib/lifetime-stats';

function row(
  pillar_id: 'body' | 'mind' | 'finance' | 'projects',
  overrides: Partial<LifetimeStatsRow> = {},
): LifetimeStatsRow {
  return {
    pillar_id,
    total_xp: 0,
    total_completed: 0,
    total_failed: 0,
    longest_streak: 0,
    highest_level: 0,
    first_quest_at: null,
    last_updated_at: null,
    ...overrides,
  };
}

describe('formatLifetimeSnapshot', () => {
  it('renders 4 lines in fixed pillar order (body, mind, finance, projects)', () => {
    const out = formatLifetimeSnapshot([row('finance'), row('body'), row('projects'), row('mind')]);
    const lines = out.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('body:');
    expect(lines[1]).toContain('mind:');
    expect(lines[2]).toContain('finance:');
    expect(lines[3]).toContain('projects:');
  });

  it('shows "-" for first_quest_at when NULL', () => {
    const out = formatLifetimeSnapshot([row('body'), row('mind'), row('finance'), row('projects')]);
    expect(out).toContain('first -');
  });

  it('formats first_quest_at as YYYY-MM-DD (strips timestamp tail)', () => {
    const out = formatLifetimeSnapshot([
      row('body', { first_quest_at: '2026-01-05 10:34:22' }),
      row('mind'),
      row('finance'),
      row('projects'),
    ]);
    expect(out).toContain('first 2026-01-05');
    expect(out).not.toContain('10:34:22');
  });

  it('renders representative populated row with compact labels', () => {
    const out = formatLifetimeSnapshot([
      row('body', {
        total_xp: 1234,
        total_completed: 56,
        total_failed: 7,
        longest_streak: 14,
        highest_level: 3,
        first_quest_at: '2026-01-05',
      }),
      row('mind'),
      row('finance'),
      row('projects'),
    ]);
    const first = out.split('\n')[0];
    expect(first).toContain('body:');
    expect(first).toContain('xp 1234');
    expect(first).toContain('done 56');
    expect(first).toContain('fail 7');
    expect(first).toContain('streak 14d');
    expect(first).toContain('lvl 3');
    expect(first).toContain('first 2026-01-05');
    // Negative assertions - guard against the old verbose label set
    expect(first).not.toContain('total_xp');
    expect(first).not.toContain('completed ');
    expect(first).not.toContain('longest_streak');
    expect(first).not.toContain('peak_lvl');
    expect(first).not.toContain('since ');
  });

  it('clamps total_xp ≥ 100000 with compact "k" suffix to keep ≤ 80 chars per line', () => {
    const out = formatLifetimeSnapshot([
      row('body', {
        total_xp: 123_456,
        total_completed: 999,
        total_failed: 99,
        longest_streak: 365,
        highest_level: 12,
        first_quest_at: '2026-01-05',
      }),
      row('mind'),
      row('finance'),
      row('projects'),
    ]);
    const first = out.split('\n')[0];
    expect(first).toContain('xp 123k');
    for (const line of out.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });

  it('all 4 zero rows fit under 80 chars per line', () => {
    const out = formatLifetimeSnapshot([row('body'), row('mind'), row('finance'), row('projects')]);
    for (const line of out.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });
});
