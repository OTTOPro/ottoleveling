import { getArcs, abandonArc } from '$lib/api/client';
import type { Arc } from '$lib/api/types';

/**
 * Singleton state store for the /system [ ARCS · N ] section + Today
 * quest-card arc badges. load() fetches all arcs (any status) so the UI
 * can show active + recently-completed.
 */
class ArcsState {
  arcs = $state<Arc[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);

  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      this.arcs = await getArcs();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  /**
   * Derived helper - active arcs sorted by started_at ASC (oldest first, so
   * the [ ARCS ] section reads chronologically).
   */
  get active(): Arc[] {
    return this.arcs
      .filter((a) => a.status === 'active')
      .sort((a, b) => a.started_at.localeCompare(b.started_at));
  }

  /**
   * Count of active arcs - used in the `[ ARCS · N ]` header.
   */
  get activeCount(): number {
    return this.active.length;
  }

  /**
   * Lookup helper for arc badges on quest cards.
   */
  byId(id: number): Arc | undefined {
    return this.arcs.find((a) => a.id === id);
  }

  /**
   * Calls POST /api/arcs/:id/abandon and patches the local cache.
   */
  async abandon(id: number): Promise<void> {
    try {
      const updated = await abandonArc(id);
      this.arcs = this.arcs.map((a) => (a.id === id ? updated : a));
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
  }
}

export const arcsState = new ArcsState();
