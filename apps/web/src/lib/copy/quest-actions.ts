/**
 * LOCKED copy for quest fail/skip ConfirmModals.
 *
 * The exact strings are user-locked. The sentinel test at
 * apps/web/src/lib/copy/quest-actions.test.ts asserts these constants verbatim.
 *
 * If a future PR needs to change a string, update BOTH the sentinel test AND
 * any downstream component - and discuss the UX implication with the user.
 *
 * This module is the single source of truth - every component that renders a
 * fail/skip confirmation modal imports from here (NOT from inline string
 * literals).
 */

export const QUEST_FAIL_COPY = {
  modalTitle: 'Mark this quest as failed?',
  modalBody: 'You can always revisit this decision in /system/admin if needed.',
  confirmLabel: 'Mark failed',
  cancelLabel: 'Cancel',
  toastSuccess: 'Quest marked as failed',
} as const;

export const QUEST_SKIP_COPY = {
  modalTitle: 'Skip this quest today?',
  modalBody:
    'The quest will be removed from your day but will count as not-completed in your stats.',
  confirmLabel: 'Skip',
  cancelLabel: 'Cancel',
  toastSuccess: 'Quest skipped',
} as const;

export const QUEST_MENU_LABELS = {
  fail: 'Mark failed',
  skip: 'Skip',
  ariaOpenMenu: 'More actions',
} as const;
