import {
  getObjectives,
  createObjective,
  updateObjective,
  softDeleteObjective,
  restoreObjective,
  hardDeleteObjective,
} from '$lib/api/client';
import type {
  Objective,
  CreateObjectiveInput,
  UpdateObjectiveInput,
  PillarId,
} from '$lib/api/types';

class ObjectivesState {
  /** Active (not soft-deleted) objectives. */
  objectives = $state<Objective[]>([]);
  /** Soft-deleted objectives (trash view). */
  trash = $state<Objective[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);
  /** True after a successful load() - used to short-circuit redundant fetches. */
  loaded = $state(false);

  /** Active + non-deleted objectives. Alias for consistency with templatesState. */
  get active(): Objective[] {
    return this.objectives;
  }

  byId(id: number): Objective | undefined {
    return this.objectives.find((o) => o.id === id) ?? this.trash.find((o) => o.id === id);
  }

  async load(pillar_id?: PillarId, force = false): Promise<void> {
    // Skip if already loaded and not forced. Mutations update the in-memory
    // list optimistically so a re-fetch is only needed on explicit force or
    // first load.
    if (this.loaded && !force) return;
    this.loading = true;
    this.error = null;
    try {
      this.objectives = await getObjectives(pillar_id ? { pillar_id } : undefined);
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
      this.trash = await getObjectives({ show: 'trash' });
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  async create(input: CreateObjectiveInput): Promise<Objective | null> {
    this.error = null;
    try {
      const obj = await createObjective(input);
      this.objectives = [...this.objectives, obj];
      return obj;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return null;
    }
  }

  async update(id: number, patch: UpdateObjectiveInput): Promise<Objective | null> {
    this.error = null;
    try {
      const obj = await updateObjective(id, patch);
      this.objectives = this.objectives.map((x) => (x.id === id ? obj : x));
      return obj;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return null;
    }
  }

  async softDelete(id: number): Promise<boolean> {
    this.error = null;
    try {
      await softDeleteObjective(id);
      // Move from active list to trash list.
      const found = this.objectives.find((x) => x.id === id);
      this.objectives = this.objectives.filter((x) => x.id !== id);
      if (found) this.trash = [{ ...found, deleted_at: new Date().toISOString() }, ...this.trash];
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async restore(id: number): Promise<boolean> {
    this.error = null;
    try {
      await restoreObjective(id);
      // Move from trash back to active list.
      const found = this.trash.find((x) => x.id === id);
      this.trash = this.trash.filter((x) => x.id !== id);
      if (found) this.objectives = [...this.objectives, { ...found, deleted_at: null }];
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async hardDelete(id: number): Promise<boolean> {
    this.error = null;
    try {
      await hardDeleteObjective(id);
      // Remove from trash - purged rows disappear from all views.
      this.trash = this.trash.filter((x) => x.id !== id);
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }
}

export const objectivesState = new ObjectivesState();
