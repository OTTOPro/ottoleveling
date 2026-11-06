import { describe, it, expect } from 'vitest';
import { weeklyPeriodFor, monthlyPeriodFor, yearlyPeriodFor } from '../../src/lib/periods';

describe('weeklyPeriodFor', () => {
  it('Sunday trigger → covers the Mon→Sun ending that Sunday', () => {
    // Sunday 2026-05-31 20:00 UTC → period Mon 2026-05-25 → Sun 2026-05-31
    const p = weeklyPeriodFor(new Date('2026-05-31T20:00:00Z'));
    expect(p.start).toBe('2026-05-25');
    expect(p.end).toBe('2026-05-31');
    expect(p.days).toBe(7);
  });

  it('Wednesday trigger → still covers most recent COMPLETED week ending on previous Sunday', () => {
    const p = weeklyPeriodFor(new Date('2026-05-27T12:00:00Z')); // Wed
    expect(p.start).toBe('2026-05-18'); // Mon
    expect(p.end).toBe('2026-05-24'); // Sun
  });

  it('Monday 00:01 trigger → covers previous full week', () => {
    const p = weeklyPeriodFor(new Date('2026-06-01T00:01:00Z')); // Mon
    expect(p.start).toBe('2026-05-25');
    expect(p.end).toBe('2026-05-31');
  });
});

describe('monthlyPeriodFor', () => {
  it('end-of-May trigger → covers full May', () => {
    const p = monthlyPeriodFor(new Date('2026-05-31T20:00:00Z'));
    expect(p.start).toBe('2026-05-01');
    expect(p.end).toBe('2026-05-31');
    expect(p.days).toBe(31);
  });

  it('end-of-Feb (non-leap) trigger → 28 days', () => {
    const p = monthlyPeriodFor(new Date('2026-02-28T20:00:00Z'));
    expect(p.start).toBe('2026-02-01');
    expect(p.end).toBe('2026-02-28');
    expect(p.days).toBe(28);
  });

  it('end-of-Feb (leap) trigger → 29 days', () => {
    const p = monthlyPeriodFor(new Date('2024-02-29T20:00:00Z'));
    expect(p.start).toBe('2024-02-01');
    expect(p.end).toBe('2024-02-29');
    expect(p.days).toBe(29);
  });

  it('mid-month trigger → still covers most recent COMPLETED month', () => {
    const p = monthlyPeriodFor(new Date('2026-05-15T20:00:00Z'));
    expect(p.start).toBe('2026-04-01');
    expect(p.end).toBe('2026-04-30');
  });
});

describe('yearlyPeriodFor', () => {
  it('Dec 31 trigger → covers full year', () => {
    const p = yearlyPeriodFor(new Date('2026-12-31T20:00:00Z'));
    expect(p.start).toBe('2026-01-01');
    expect(p.end).toBe('2026-12-31');
    expect(p.days).toBe(365);
  });

  it('Jan 1 trigger → covers previous full year', () => {
    const p = yearlyPeriodFor(new Date('2027-01-01T00:01:00Z'));
    expect(p.start).toBe('2026-01-01');
    expect(p.end).toBe('2026-12-31');
  });

  it('leap year Dec 31 trigger → 366 days', () => {
    const p = yearlyPeriodFor(new Date('2024-12-31T20:00:00Z'));
    expect(p.days).toBe(366);
  });
});
