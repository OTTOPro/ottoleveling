/**
 * Sentinel test for LOCKED copy strings.
 *
 * If any string changes, this test fails and forces a coordinated review.
 * Update BOTH this file AND quest-actions.ts in the same commit.
 */
import { describe, it, expect } from 'vitest';
import { QUEST_FAIL_COPY, QUEST_SKIP_COPY, QUEST_MENU_LABELS } from './quest-actions';

describe('quest-actions LOCKED copy (sentinel)', () => {
  it('QUEST_FAIL_COPY.modalTitle is locked verbatim', () => {
    expect(QUEST_FAIL_COPY.modalTitle).toBe('Mark this quest as failed?');
  });

  it('QUEST_FAIL_COPY.modalBody is locked verbatim', () => {
    expect(QUEST_FAIL_COPY.modalBody).toBe(
      'You can always revisit this decision in /system/admin if needed.',
    );
  });

  it('QUEST_FAIL_COPY confirm/cancel/toast labels are locked', () => {
    expect(QUEST_FAIL_COPY.confirmLabel).toBe('Mark failed');
    expect(QUEST_FAIL_COPY.cancelLabel).toBe('Cancel');
    expect(QUEST_FAIL_COPY.toastSuccess).toBe('Quest marked as failed');
  });

  it('QUEST_SKIP_COPY.modalTitle is locked verbatim', () => {
    expect(QUEST_SKIP_COPY.modalTitle).toBe('Skip this quest today?');
  });

  it('QUEST_SKIP_COPY.modalBody is locked verbatim', () => {
    expect(QUEST_SKIP_COPY.modalBody).toBe(
      'The quest will be removed from your day but will count as not-completed in your stats.',
    );
  });

  it('QUEST_SKIP_COPY confirm/cancel/toast labels are locked', () => {
    expect(QUEST_SKIP_COPY.confirmLabel).toBe('Skip');
    expect(QUEST_SKIP_COPY.cancelLabel).toBe('Cancel');
    expect(QUEST_SKIP_COPY.toastSuccess).toBe('Quest skipped');
  });

  it('QUEST_MENU_LABELS are locked', () => {
    expect(QUEST_MENU_LABELS.fail).toBe('Mark failed');
    expect(QUEST_MENU_LABELS.skip).toBe('Skip');
    expect(QUEST_MENU_LABELS.ariaOpenMenu).toBe('More actions');
  });
});
