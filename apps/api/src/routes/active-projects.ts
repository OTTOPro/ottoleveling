import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Bindings } from '../index';
import {
  CreateProjectSchema,
  UpdateProjectSchema,
  insertProject,
  getActiveProjects,
  getProjectById,
  updateProject,
  softDeleteProject,
  restoreProject,
  permanentDeleteProject,
  PROJECT_STATUSES,
} from '../lib/active-projects';

export const activeProjectsRouter = new Hono<{ Bindings: Bindings }>();

const ListQuerySchema = z.object({
  show: z.enum(['active', 'trash']).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
});

// GET /api/projects - list (active by default, ?show=trash for soft-deleted, ?status=X to filter)
activeProjectsRouter.get('/', async (c) => {
  const parsed = ListQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: 'invalid query' }, 400);
  const includeTrashed = parsed.data.show === 'trash';
  const statusFilter = parsed.data.status ?? null;
  const projects = await getActiveProjects(c.env.DB, { includeTrashed, statusFilter });
  return c.json({ projects });
});

// POST /api/projects - create
activeProjectsRouter.post('/', zValidator('json', CreateProjectSchema), async (c) => {
  const input = c.req.valid('json');
  const project = await insertProject(c.env.DB, input);
  return c.json({ project }, 201);
});

// GET /api/projects/:id - view
activeProjectsRouter.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400);
  const project = await getProjectById(c.env.DB, id);
  if (!project) return c.json({ error: 'not found' }, 404);
  return c.json({ project });
});

// PUT /api/projects/:id - update
activeProjectsRouter.put('/:id', zValidator('json', UpdateProjectSchema), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400);
  const input = c.req.valid('json');
  const project = await updateProject(c.env.DB, id, input);
  if (!project) return c.json({ error: 'not found' }, 404);
  return c.json({ project });
});

// DELETE /api/projects/:id - soft-delete or permanent delete (?permanent=true)
const DeleteQuerySchema = z.object({ permanent: z.string().optional() });
activeProjectsRouter.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400);
  const parsed = DeleteQuerySchema.safeParse(c.req.query());
  const permanent = parsed.success && parsed.data.permanent === 'true';
  const ok = permanent
    ? await permanentDeleteProject(c.env.DB, id)
    : await softDeleteProject(c.env.DB, id);
  if (!ok) return c.json({ error: 'not found or already in target state' }, 404);
  return c.json({ ok: true });
});

// POST /api/projects/:id/restore - restore from trash
activeProjectsRouter.post('/:id/restore', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400);
  const ok = await restoreProject(c.env.DB, id);
  if (!ok) return c.json({ error: 'not found or not in trash' }, 404);
  return c.json({ ok: true });
});
