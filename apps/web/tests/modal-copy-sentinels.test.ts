/**
 * Sentinel test for locked modal copy strings.
 *
 * These exact strings are user-locked. If a future PR changes them, this test
 * fails and forces a coordinated review of the UX impact. The modals are reused
 * across Templates + Objectives; copy drift would fragment the user's trust in
 * the soft-delete contract.
 *
 * The DELETE_COPY module is the single source of truth - components import from
 * it, so changing a string here propagates to every modal automatically.
 */
import { describe, it, expect } from 'vitest';
import { DELETE_COPY } from '../src/lib/copy/delete-modals';

describe('Modal copy sentinels', () => {
  it('Template soft-delete strings are locked', () => {
    expect(DELETE_COPY.template.softDelete.title).toBe('Delete this template?');
    expect(DELETE_COPY.template.softDelete.body(3)).toContain('3 recorded completions');
    expect(DELETE_COPY.template.softDelete.body(3)).toContain('trash');
    expect(DELETE_COPY.template.softDelete.body(3)).toContain("'View trash'");
    expect(DELETE_COPY.template.softDelete.body(3)).toContain('XP/streak history stays intact');
    expect(DELETE_COPY.template.softDelete.confirmLabel).toBe('Delete');
    expect(DELETE_COPY.template.softDelete.cancelLabel).toBe('Cancel');
  });

  it('Objective soft-delete strings are locked', () => {
    expect(DELETE_COPY.objective.softDelete.title).toBe('Delete this objective?');
    expect(DELETE_COPY.objective.softDelete.body).toContain('trash');
    expect(DELETE_COPY.objective.softDelete.body).toContain('past reports stays intact');
    expect(DELETE_COPY.objective.softDelete.confirmLabel).toBe('Delete');
    expect(DELETE_COPY.objective.softDelete.cancelLabel).toBe('Cancel');
  });

  it('Permanent-delete strings are locked', () => {
    expect(DELETE_COPY.permanent.title).toBe('Delete permanently?');
    expect(DELETE_COPY.permanent.body).toContain('irreversible');
    expect(DELETE_COPY.permanent.body).toContain("'[deleted]'");
    expect(DELETE_COPY.permanent.body).toContain('XP/streak history');
    expect(DELETE_COPY.permanent.confirmLabel).toBe('Delete permanently');
    expect(DELETE_COPY.permanent.cancelLabel).toBe('Cancel');
  });
});
