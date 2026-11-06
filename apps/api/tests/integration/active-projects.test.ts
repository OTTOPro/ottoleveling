import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

const TOKEN = 'integration-test-token-deadbeef';

function authedRequest(path: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers);
  headers.set('x-dev-token', TOKEN);
  if (init?.body) headers.set('content-type', 'application/json');
  return new Request(`http://localhost${path}`, { ...init, headers });
}

const BASE_PROJECT = {
  name: 'OttoLeveling',
  pillar: 'projects',
  description: 'Personal gamification app',
  priority: 8,
};

describe('POST /api/projects', () => {
  it('creates a project with required fields and returns 201 with valid shape', async () => {
    const res = await SELF.fetch(
      authedRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify(BASE_PROJECT),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { project: Record<string, unknown> };
    expect(body.project).toMatchObject({
      name: 'OttoLeveling',
      pillar: 'projects',
      status: 'active',
      priority: 8,
    });
    expect(typeof body.project['id']).toBe('number');
    expect(body.project['deleted_at']).toBeNull();
  });

  it('rejects missing name with 400', async () => {
    const res = await SELF.fetch(
      authedRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ pillar: 'projects' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects invalid pillar with 400', async () => {
    const res = await SELF.fetch(
      authedRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test', pillar: 'bogus' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects invalid priority (out of 1-10 range) with 400', async () => {
    const res = await SELF.fetch(
      authedRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test', pillar: 'body', priority: 11 }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('GET /api/projects', () => {
  it('returns empty array initially', async () => {
    const res = await SELF.fetch(authedRequest('/api/projects'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { projects: unknown[] };
    expect(body.projects).toEqual([]);
  });

  it('returns active projects sorted by priority DESC, id DESC', async () => {
    await SELF.fetch(
      authedRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'Low priority', pillar: 'mind', priority: 2 }),
      }),
    );
    await SELF.fetch(
      authedRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'High priority', pillar: 'finance', priority: 9 }),
      }),
    );

    const res = await SELF.fetch(authedRequest('/api/projects'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { projects: Array<{ name: string; priority: number }> };
    expect(body.projects).toHaveLength(2);
    expect(body.projects[0]?.name).toBe('High priority');
    expect(body.projects[1]?.name).toBe('Low priority');
  });

  it('GET ?show=trash returns only soft-deleted projects', async () => {
    // Create then soft-delete one project
    const createRes = await SELF.fetch(
      authedRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'ToDelete', pillar: 'body', priority: 5 }),
      }),
    );
    const created = (await createRes.json()) as { project: { id: number } };
    const id = created.project.id;

    await SELF.fetch(authedRequest(`/api/projects/${id}`, { method: 'DELETE' }));

    const trashRes = await SELF.fetch(authedRequest('/api/projects?show=trash'));
    expect(trashRes.status).toBe(200);
    const trashBody = (await trashRes.json()) as { projects: Array<{ name: string }> };
    expect(trashBody.projects).toHaveLength(1);
    expect(trashBody.projects[0]?.name).toBe('ToDelete');

    // Active list should not include it
    const activeRes = await SELF.fetch(authedRequest('/api/projects'));
    const activeBody = (await activeRes.json()) as { projects: unknown[] };
    expect(activeBody.projects).toHaveLength(0);
  });
});

describe('GET /api/projects/:id', () => {
  it('returns 404 for missing project', async () => {
    const res = await SELF.fetch(authedRequest('/api/projects/99999'));
    expect(res.status).toBe(404);
  });

  it('returns a single project by id', async () => {
    const createRes = await SELF.fetch(
      authedRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ ...BASE_PROJECT, name: 'Single project' }),
      }),
    );
    const created = (await createRes.json()) as { project: { id: number } };
    const id = created.project.id;

    const res = await SELF.fetch(authedRequest(`/api/projects/${id}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { project: { name: string } };
    expect(body.project.name).toBe('Single project');
  });
});

describe('PUT /api/projects/:id', () => {
  it('updates partial fields; updated_at advances', async () => {
    const createRes = await SELF.fetch(
      authedRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'Before update', pillar: 'mind', priority: 3 }),
      }),
    );
    const created = (await createRes.json()) as { project: { id: number; updated_at: string } };
    const id = created.project.id;
    const originalUpdatedAt = created.project.updated_at;

    // Small sleep ensures updated_at changes (SQLite datetime('now') has 1s granularity)
    await new Promise((r) => setTimeout(r, 1100));

    const updateRes = await SELF.fetch(
      authedRequest(`/api/projects/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: 'After update', priority: 7 }),
      }),
    );
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as {
      project: { name: string; priority: number; pillar: string; updated_at: string };
    };
    expect(updated.project.name).toBe('After update');
    expect(updated.project.priority).toBe(7);
    // Pillar unchanged
    expect(updated.project.pillar).toBe('mind');
    expect(updated.project.updated_at).not.toBe(originalUpdatedAt);
  });

  it('returns 404 for missing project', async () => {
    const res = await SELF.fetch(
      authedRequest('/api/projects/99999', {
        method: 'PUT',
        body: JSON.stringify({ name: 'x' }),
      }),
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/projects/:id', () => {
  it('soft-deletes a project; GET no longer includes it in active list', async () => {
    const createRes = await SELF.fetch(
      authedRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'To soft-delete', pillar: 'finance', priority: 5 }),
      }),
    );
    const created = (await createRes.json()) as { project: { id: number } };
    const id = created.project.id;

    const delRes = await SELF.fetch(authedRequest(`/api/projects/${id}`, { method: 'DELETE' }));
    expect(delRes.status).toBe(200);
    const delBody = (await delRes.json()) as { ok: boolean };
    expect(delBody.ok).toBe(true);

    // Active list should be empty
    const listRes = await SELF.fetch(authedRequest('/api/projects'));
    const listBody = (await listRes.json()) as { projects: unknown[] };
    expect(listBody.projects).toHaveLength(0);
  });

  it('returns 404 when trying to soft-delete a non-existent project', async () => {
    const res = await SELF.fetch(authedRequest('/api/projects/99999', { method: 'DELETE' }));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/projects/:id/restore', () => {
  it('restores a soft-deleted project back to active', async () => {
    const createRes = await SELF.fetch(
      authedRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'To restore', pillar: 'body', priority: 6 }),
      }),
    );
    const created = (await createRes.json()) as { project: { id: number } };
    const id = created.project.id;

    // Soft-delete it
    await SELF.fetch(authedRequest(`/api/projects/${id}`, { method: 'DELETE' }));

    // Restore it
    const restoreRes = await SELF.fetch(
      authedRequest(`/api/projects/${id}/restore`, { method: 'POST' }),
    );
    expect(restoreRes.status).toBe(200);
    const restoreBody = (await restoreRes.json()) as { ok: boolean };
    expect(restoreBody.ok).toBe(true);

    // Should appear in active list again
    const listRes = await SELF.fetch(authedRequest('/api/projects'));
    const listBody = (await listRes.json()) as { projects: Array<{ name: string }> };
    expect(listBody.projects).toHaveLength(1);
    expect(listBody.projects[0]?.name).toBe('To restore');
  });

  it('returns 404 when restoring a non-trashed project', async () => {
    const createRes = await SELF.fetch(
      authedRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'Active project', pillar: 'projects', priority: 5 }),
      }),
    );
    const created = (await createRes.json()) as { project: { id: number } };
    const res = await SELF.fetch(
      authedRequest(`/api/projects/${created.project.id}/restore`, { method: 'POST' }),
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/projects/:id?permanent=true', () => {
  it('permanent purge on soft-deleted row strips PII to [supprimé]', async () => {
    const createRes = await SELF.fetch(
      authedRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Confidential project',
          pillar: 'finance',
          description: 'Very private',
          notes: 'Secret notes',
          priority: 5,
        }),
      }),
    );
    const created = (await createRes.json()) as { project: { id: number } };
    const id = created.project.id;

    // Must soft-delete first for permanent purge to apply
    await SELF.fetch(authedRequest(`/api/projects/${id}`, { method: 'DELETE' }));

    const purgeRes = await SELF.fetch(
      authedRequest(`/api/projects/${id}?permanent=true`, { method: 'DELETE' }),
    );
    expect(purgeRes.status).toBe(200);

    // Row still exists (history preserved), but PII stripped
    const viewRes = await SELF.fetch(authedRequest(`/api/projects/${id}`));
    expect(viewRes.status).toBe(200);
    const viewBody = (await viewRes.json()) as {
      project: { name: string; description: string | null; notes: string | null };
    };
    expect(viewBody.project.name).toBe('[supprimé]');
    expect(viewBody.project.description).toBeNull();
    expect(viewBody.project.notes).toBeNull();
  });

  it('returns 404 for permanent purge on non-soft-deleted project', async () => {
    const createRes = await SELF.fetch(
      authedRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'Active project', pillar: 'body', priority: 3 }),
      }),
    );
    const created = (await createRes.json()) as { project: { id: number } };
    const res = await SELF.fetch(
      authedRequest(`/api/projects/${created.project.id}?permanent=true`, { method: 'DELETE' }),
    );
    expect(res.status).toBe(404);
  });
});
