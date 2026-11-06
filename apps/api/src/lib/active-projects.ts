import type { D1Database } from '@cloudflare/workers-types';
import { z } from 'zod';

export const PROJECT_PILLARS = ['body', 'mind', 'finance', 'projects'] as const;
export const PROJECT_STATUSES = ['active', 'paused', 'archived'] as const;
export type ProjectPillar = (typeof PROJECT_PILLARS)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface ActiveProjectRow {
  id: number;
  name: string;
  description: string | null;
  pillar: ProjectPillar;
  status: ProjectStatus;
  priority: number;
  start_date: string;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// Zod schemas
export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  pillar: z.enum(PROJECT_PILLARS),
  status: z.enum(PROJECT_STATUSES).default('active'),
  priority: z.number().int().min(1).max(10).default(5),
  notes: z.string().max(5000).optional().nullable(),
});

export const UpdateProjectSchema = CreateProjectSchema.partial();

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

// CRUD helpers

export async function insertProject(
  db: D1Database,
  input: CreateProjectInput,
): Promise<ActiveProjectRow> {
  const r = await db
    .prepare(
      `INSERT INTO active_projects (name, description, pillar, status, priority, notes)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING *`,
    )
    .bind(
      input.name,
      input.description ?? null,
      input.pillar,
      input.status,
      input.priority,
      input.notes ?? null,
    )
    .first<ActiveProjectRow>();
  if (!r) throw new Error('insert_failed');
  return r;
}

export async function getActiveProjects(
  db: D1Database,
  options: { includeTrashed?: boolean; statusFilter?: ProjectStatus | null } = {},
): Promise<ActiveProjectRow[]> {
  const trashClause = options.includeTrashed ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL';
  const statusClause = options.statusFilter ? `AND status = ?` : '';
  const binds = options.statusFilter ? [options.statusFilter] : [];
  const r = await db
    .prepare(
      `SELECT * FROM active_projects WHERE ${trashClause} ${statusClause}
       ORDER BY priority DESC, id DESC`,
    )
    .bind(...binds)
    .all<ActiveProjectRow>();
  return r.results ?? [];
}

export async function getProjectById(db: D1Database, id: number): Promise<ActiveProjectRow | null> {
  return await db
    .prepare(`SELECT * FROM active_projects WHERE id = ?`)
    .bind(id)
    .first<ActiveProjectRow>();
}

export async function updateProject(
  db: D1Database,
  id: number,
  input: UpdateProjectInput,
): Promise<ActiveProjectRow | null> {
  // Build SET clause dynamically - only update provided fields
  const fields: string[] = [];
  const binds: unknown[] = [];
  if (input.name !== undefined) {
    fields.push('name = ?');
    binds.push(input.name);
  }
  if (input.description !== undefined) {
    fields.push('description = ?');
    binds.push(input.description);
  }
  if (input.pillar !== undefined) {
    fields.push('pillar = ?');
    binds.push(input.pillar);
  }
  if (input.status !== undefined) {
    fields.push('status = ?');
    binds.push(input.status);
  }
  if (input.priority !== undefined) {
    fields.push('priority = ?');
    binds.push(input.priority);
  }
  if (input.notes !== undefined) {
    fields.push('notes = ?');
    binds.push(input.notes);
  }
  if (fields.length === 0) return await getProjectById(db, id);
  fields.push("updated_at = datetime('now')");
  binds.push(id);
  return await db
    .prepare(
      `UPDATE active_projects SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL RETURNING *`,
    )
    .bind(...binds)
    .first<ActiveProjectRow>();
}

export async function softDeleteProject(db: D1Database, id: number): Promise<boolean> {
  const r = await db
    .prepare(
      `UPDATE active_projects SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(id)
    .run();
  return (r.meta?.changes ?? 0) > 0;
}

export async function restoreProject(db: D1Database, id: number): Promise<boolean> {
  const r = await db
    .prepare(`UPDATE active_projects SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL`)
    .bind(id)
    .run();
  return (r.meta?.changes ?? 0) > 0;
}

export async function permanentDeleteProject(db: D1Database, id: number): Promise<boolean> {
  // Mark as purged + strip PII rather than DELETE (keeps FK integrity).
  const r = await db
    .prepare(
      `UPDATE active_projects SET name = '[supprimé]', description = NULL, notes = NULL
       WHERE id = ? AND deleted_at IS NOT NULL`,
    )
    .bind(id)
    .run();
  return (r.meta?.changes ?? 0) > 0;
}

/**
 * Builds the {ACTIVE_PROJECTS} placeholder content for the daily generation prompt.
 * Returns a markdown list, or an empty-state string when no active projects exist.
 */
export async function formatActiveProjectsPlaceholder(db: D1Database): Promise<string> {
  const projects = await getActiveProjects(db, { statusFilter: 'active' });
  if (projects.length === 0) return '(no active personal projects)';
  const lines = projects.map((p) => {
    const ageHours = Math.floor((Date.now() - new Date(p.start_date + 'Z').getTime()) / 3_600_000);
    const ageStr = ageHours < 24 ? `${ageHours}h` : `${Math.floor(ageHours / 24)}d`;
    return `- **${p.name}** (pillar: ${p.pillar}, priority: ${p.priority}/10, age: ${ageStr})${p.description ? ` - ${p.description}` : ''}`;
  });
  return lines.join('\n');
}
