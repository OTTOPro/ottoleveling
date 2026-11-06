-- ============================================================
-- Migration 0018 - objective workflow state tracking
-- ============================================================
-- One row per objective with an active ObjectiveMilestoneWorkflow instance.
-- Created when an objective is created via POST /api/objectives hook (new objectives)
-- OR via the POST /api/admin/backfill-objective-workflows endpoint (existing objectives
-- created before the workflow existed).
--
-- ON DELETE CASCADE: when an objective is hard-purged (title='[supprimé]'), its
-- workflow state row is cleaned up automatically. The workflow instance itself
-- continues running in Cloudflare (will just fail to find the objective on close).

CREATE TABLE objective_workflow_state (
  objective_id     INTEGER PRIMARY KEY REFERENCES objectives(id) ON DELETE CASCADE,
  workflow_run_id  TEXT NOT NULL,
  current_phase    INTEGER NOT NULL DEFAULT 0,
  transitioned_at  DATETIME NOT NULL DEFAULT (datetime('now')),
  completed_at     DATETIME,
  created_at       DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_obj_wf_run_id ON objective_workflow_state(workflow_run_id);
