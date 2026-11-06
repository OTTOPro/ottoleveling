import {
  getTemplates,
  createTemplate,
  updateTemplate,
  softDeleteTemplate,
  restoreTemplate,
  hardDeleteTemplate,
} from '$lib/api/client';
import type { QuestTemplate, CreateTemplateInput, UpdateTemplateInput } from '$lib/api/types';

class TemplatesState {
  /** Active (not soft-deleted) templates. */
  templates = $state<QuestTemplate[]>([]);
  /** Soft-deleted templates (trash view). */
  trash = $state<QuestTemplate[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);
  /** True after a successful load() - used to short-circuit redundant fetches. */
  loaded = $state(false);

  /** Templates that are active AND have active=1 (used for quest generation context). */
  get active(): QuestTemplate[] {
    return this.templates.filter((t) => t.active === 1);
  }

  byId(id: number): QuestTemplate | undefined {
    return this.templates.find((t) => t.id === id) ?? this.trash.find((t) => t.id === id);
  }

  async load(activeOnly = true, force = false): Promise<void> {
    // Skip if already loaded and not forced. The activeOnly flag is part of
    // the cache key: if the caller switches from activeOnly=true to false we
    // must refetch.
    if (this.loaded && !force) return;
    this.loading = true;
    this.error = null;
    try {
      this.templates = await getTemplates({ activeOnly });
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
      this.trash = await getTemplates({ show: 'trash' });
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  async create(input: CreateTemplateInput): Promise<QuestTemplate | null> {
    this.error = null;
    try {
      const t = await createTemplate(input);
      this.templates = [...this.templates, t];
      return t;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return null;
    }
  }

  async update(id: number, patch: UpdateTemplateInput): Promise<QuestTemplate | null> {
    this.error = null;
    try {
      const t = await updateTemplate(id, patch);
      this.templates = this.templates.map((x) => (x.id === id ? t : x));
      return t;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return null;
    }
  }

  async softDelete(id: number): Promise<boolean> {
    this.error = null;
    try {
      await softDeleteTemplate(id);
      // Move from active list to trash list.
      const found = this.templates.find((x) => x.id === id);
      this.templates = this.templates.filter((x) => x.id !== id);
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
      await restoreTemplate(id);
      // Move from trash back to active list.
      const found = this.trash.find((x) => x.id === id);
      this.trash = this.trash.filter((x) => x.id !== id);
      if (found) this.templates = [...this.templates, { ...found, deleted_at: null }];
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async hardDelete(id: number): Promise<boolean> {
    this.error = null;
    try {
      await hardDeleteTemplate(id);
      // Remove from trash - purged rows disappear from all views.
      this.trash = this.trash.filter((x) => x.id !== id);
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  /** @deprecated Use softDelete instead. */
  async deactivate(id: number): Promise<boolean> {
    return this.softDelete(id);
  }
}

export const templatesState = new TemplatesState();
