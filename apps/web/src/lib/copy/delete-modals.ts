/**
 * Locked copy for soft-delete + permanent-delete modals.
 *
 * The exact strings are user-locked. The sentinel test at
 * apps/web/tests/modal-copy-sentinels.test.ts asserts these constants verbatim.
 * If a future PR needs to change a string, update BOTH the sentinel test AND
 * any downstream component - and discuss the UX implication with the user.
 *
 * The DELETE_COPY object is the single source of truth - every component that
 * renders a delete-confirmation modal imports from here (NOT from inline string
 * literals).
 */
export const DELETE_COPY = {
  template: {
    softDelete: {
      title: 'Delete this template?',
      body: (n: number) =>
        `This template has ${n} recorded completions. Deleting it will move it to the trash (reversible via 'View trash'). XP/streak history stays intact, but this template will no longer be used to generate new quests.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    },
  },
  objective: {
    softDelete: {
      title: 'Delete this objective?',
      body: "This objective will be moved to the trash (reversible via 'View trash'). Progress history and any mention in past reports stays intact.",
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    },
  },
  permanent: {
    title: 'Delete permanently?',
    body: "This action is irreversible. The item disappears but the XP/streak history and past reports keep their references (the title will appear as '[deleted]'). Confirm?",
    confirmLabel: 'Delete permanently',
    cancelLabel: 'Cancel',
  },
} as const;
