/**
 * Svelte 5 runes state singleton for active_projects.
 *
 * Mirrors the pattern established by objectivesState.
 */
import {
  listProjects,
  createProject,
  updateProject,
  softDeleteProject,
  restoreProject,
  permanentDeleteProject,
} from '$lib/api/client';
import type { ActiveProject, CreateProjectInput, UpdateProjectInput } from '$lib/api/types';

class ProjectsState {
  /** Active (not soft-deleted) projects. */
  items = $state<ActiveProject[]>([]);
  /** Soft-deleted projects (trash view). */
  trashItems = $state<ActiveProject[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);

  /** Active count helper - used by /today chip. */
  get activeCount(): number {
    return this.items.filter((p) => p.status === 'active').length;
  }

  /** True after a successful load() - used to short-circuit redundant fetches. */
  loaded = $state(false);

  byId(id: number): ActiveProject | undefined {
    return this.items.find((p) => p.id === id) ?? this.trashItems.find((p) => p.id === id);
  }

  async load(statusFilter?: 'active' | 'paused' | 'archived', force = false): Promise<void> {
    if (this.loaded && !force) return;
    this.loading = true;
    this.error = null;
    try {
      const data = await listProjects(statusFilter ? { status: statusFilter } : {});
      this.items = data.projects;
      this.loaded = true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  async loadTrash(): Promise<void> {
    this.error = null;
    try {
      const data = await listProjects({ show: 'trash' });
      this.trashItems = data.projects;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  async create(input: CreateProjectInput): Promise<ActiveProject | null> {
    this.error = null;
    try {
      const data = await createProject(input);
      this.items = [data.project, ...this.items];
      return data.project;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return null;
    }
  }

  async update(id: number, patch: UpdateProjectInput): Promise<ActiveProject | null> {
    this.error = null;
    try {
      const data = await updateProject(id, patch);
      this.items = this.items.map((p) => (p.id === id ? data.project : p));
      return data.project;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return null;
    }
  }

  async softDelete(id: number): Promise<boolean> {
    this.error = null;
    try {
      await softDeleteProject(id);
      const found = this.items.find((p) => p.id === id);
      this.items = this.items.filter((p) => p.id !== id);
      if (found) {
        this.trashItems = [{ ...found, deleted_at: new Date().toISOString() }, ...this.trashItems];
      }
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async restore(id: number): Promise<boolean> {
    this.error = null;
    try {
      await restoreProject(id);
      const found = this.trashItems.find((p) => p.id === id);
      this.trashItems = this.trashItems.filter((p) => p.id !== id);
      if (found) {
        this.items = [...this.items, { ...found, deleted_at: null }];
      }
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async permanentDelete(id: number): Promise<boolean> {
    this.error = null;
    try {
      await permanentDeleteProject(id);
      this.trashItems = this.trashItems.filter((p) => p.id !== id);
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }
}

export const projectsState = new ProjectsState();
