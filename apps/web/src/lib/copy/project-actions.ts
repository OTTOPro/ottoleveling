/**
 * LOCKED copy for active_projects CRUD modals + UI labels.
 * SENTINEL TESTED in apps/web/tests/project-actions-sentinel.test.ts - do NOT
 * modify strings without updating sentinel tests in same commit.
 *
 * This module is the single source of truth - every component that renders a
 * project modal imports from here (NOT from inline string literals).
 */

export const PROJECT_SOFT_DELETE_COPY = {
  modalTitle: 'Delete this project?',
  modalBody:
    'The project will be moved to trash. You can restore it for 30 days before permanent deletion.',
  confirmLabel: 'Move to trash',
  cancelLabel: 'Cancel',
  toastSuccess: 'Project moved to trash',
} as const;

export const PROJECT_PERMANENT_DELETE_COPY = {
  modalTitle: 'Delete this project permanently?',
  modalBody:
    'This action is irreversible. The name, description, and notes will be erased. The usage history in past prompts remains intact.',
  confirmLabel: 'Delete permanently',
  cancelLabel: 'Cancel',
  toastSuccess: 'Project permanently deleted',
} as const;

export const PROJECT_RESTORE_COPY = {
  toastSuccess: 'Project restored',
} as const;

export const PROJECT_FORM_LABELS = {
  pageNew: 'New project',
  pageEdit: 'Edit project',
  pageList: 'Active projects',
  pageListSub: 'Your active personal projects',
  fieldName: 'Project name',
  fieldNamePlaceholder: 'Recipe app, home lab, ...',
  fieldDescription: 'Description (optional)',
  fieldPillar: 'Pillar',
  fieldStatus: 'Status',
  fieldPriority: 'Priority (1 = low, 10 = high)',
  fieldNotes: 'Notes (optional)',
  buttonCreate: 'Create project',
  buttonSave: 'Save',
  buttonCancel: 'Cancel',
  buttonNew: 'New project',
  buttonRestore: 'Restore',
  buttonPermanentDelete: 'Delete permanently',
  emptyList: 'No active projects. Create one to get started.',
  emptyTrash: 'Trash is empty.',
  showTrashLink: 'View trash',
  showActiveLink: 'View active projects',
  statusActive: 'Active',
  statusPaused: 'Paused',
  statusArchived: 'Archived',
} as const;
