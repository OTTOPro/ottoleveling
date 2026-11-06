/**
 * Sentinel test for LOCKED copy strings in project-actions.ts.
 *
 * These exact strings are user-locked. If a future PR changes them, this test
 * fails and forces a coordinated review of the UX impact.
 *
 * The PROJECT_SOFT_DELETE_COPY / PROJECT_PERMANENT_DELETE_COPY / PROJECT_RESTORE_COPY /
 * PROJECT_FORM_LABELS modules are the single source of truth - components import from
 * them, so changing a string here propagates to every modal automatically.
 *
 * Update BOTH this file AND project-actions.ts in the same commit if strings
 * ever need to change.
 */
import { describe, it, expect } from 'vitest';
import {
  PROJECT_SOFT_DELETE_COPY,
  PROJECT_PERMANENT_DELETE_COPY,
  PROJECT_RESTORE_COPY,
  PROJECT_FORM_LABELS,
} from '../src/lib/copy/project-actions';

describe('project-actions LOCKED copy (sentinel)', () => {
  it('PROJECT_SOFT_DELETE_COPY.modalTitle is locked verbatim', () => {
    expect(PROJECT_SOFT_DELETE_COPY.modalTitle).toBe('Delete this project?');
  });

  it('PROJECT_SOFT_DELETE_COPY.modalBody is locked verbatim', () => {
    expect(PROJECT_SOFT_DELETE_COPY.modalBody).toBe(
      'The project will be moved to trash. You can restore it for 30 days before permanent deletion.',
    );
  });

  it('PROJECT_SOFT_DELETE_COPY confirm/cancel/toast labels are locked', () => {
    expect(PROJECT_SOFT_DELETE_COPY.confirmLabel).toBe('Move to trash');
    expect(PROJECT_SOFT_DELETE_COPY.cancelLabel).toBe('Cancel');
    expect(PROJECT_SOFT_DELETE_COPY.toastSuccess).toBe('Project moved to trash');
  });

  it('PROJECT_PERMANENT_DELETE_COPY.modalTitle is locked verbatim', () => {
    expect(PROJECT_PERMANENT_DELETE_COPY.modalTitle).toBe('Delete this project permanently?');
  });

  it('PROJECT_PERMANENT_DELETE_COPY.modalBody is locked verbatim', () => {
    expect(PROJECT_PERMANENT_DELETE_COPY.modalBody).toBe(
      'This action is irreversible. The name, description, and notes will be erased. The usage history in past prompts remains intact.',
    );
  });

  it('PROJECT_PERMANENT_DELETE_COPY confirm/cancel/toast labels are locked', () => {
    expect(PROJECT_PERMANENT_DELETE_COPY.confirmLabel).toBe('Delete permanently');
    expect(PROJECT_PERMANENT_DELETE_COPY.cancelLabel).toBe('Cancel');
    expect(PROJECT_PERMANENT_DELETE_COPY.toastSuccess).toBe('Project permanently deleted');
  });

  it('PROJECT_RESTORE_COPY.toastSuccess is locked verbatim', () => {
    expect(PROJECT_RESTORE_COPY.toastSuccess).toBe('Project restored');
  });

  it('PROJECT_FORM_LABELS page/field labels are locked', () => {
    expect(PROJECT_FORM_LABELS.pageNew).toBe('New project');
    expect(PROJECT_FORM_LABELS.pageEdit).toBe('Edit project');
    expect(PROJECT_FORM_LABELS.pageList).toBe('Active projects');
    expect(PROJECT_FORM_LABELS.pageListSub).toBe('Your active personal projects');
    expect(PROJECT_FORM_LABELS.fieldName).toBe('Project name');
    expect(PROJECT_FORM_LABELS.fieldNamePlaceholder).toBe('Recipe app, home lab, ...');
  });

  it('PROJECT_FORM_LABELS button labels are locked', () => {
    expect(PROJECT_FORM_LABELS.buttonCreate).toBe('Create project');
    expect(PROJECT_FORM_LABELS.buttonSave).toBe('Save');
    expect(PROJECT_FORM_LABELS.buttonCancel).toBe('Cancel');
    expect(PROJECT_FORM_LABELS.buttonNew).toBe('New project');
    expect(PROJECT_FORM_LABELS.buttonRestore).toBe('Restore');
    expect(PROJECT_FORM_LABELS.buttonPermanentDelete).toBe('Delete permanently');
  });

  it('PROJECT_FORM_LABELS status labels are locked', () => {
    expect(PROJECT_FORM_LABELS.statusActive).toBe('Active');
    expect(PROJECT_FORM_LABELS.statusPaused).toBe('Paused');
    expect(PROJECT_FORM_LABELS.statusArchived).toBe('Archived');
  });

  it('PROJECT_FORM_LABELS empty/toggle labels are locked', () => {
    expect(PROJECT_FORM_LABELS.emptyList).toBe('No active projects. Create one to get started.');
    expect(PROJECT_FORM_LABELS.emptyTrash).toBe('Trash is empty.');
    expect(PROJECT_FORM_LABELS.showTrashLink).toBe('View trash');
    expect(PROJECT_FORM_LABELS.showActiveLink).toBe('View active projects');
  });
});
