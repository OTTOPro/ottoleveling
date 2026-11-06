import { getPillarStats, getCompositeTitle } from '$lib/api/client';
import type { PillarStats, PillarId, CompositeTitleResponse } from '$lib/api/types';

class StatsState {
  pillars = $state<PillarStats[]>([]);
  composite = $state<CompositeTitleResponse | null>(null);
  loading = $state(false);
  error = $state<string | null>(null);

  // Level-up detection. `leveledUp` holds pillar ids whose level just increased
  // on the most recent load(). Auto-cleared 4 seconds after population so the
  // animation runs once and disappears. The /stats page also calls
  // clearLeveledUp() from its onDestroy to prevent stale badges on re-entry.
  leveledUp = $state<Set<PillarId>>(new Set());
  private previousLevels = new Map<PillarId, number>();
  private clearTimer: ReturnType<typeof setTimeout> | null = null;

  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const [next, comp] = await Promise.all([getPillarStats(), getCompositeTitle()]);

      // Detect level-ups by diffing against the previous snapshot. First load
      // populates the baseline without firing any animation.
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- built locally then assigned to this.leveledUp; reactivity comes from the reassignment
      const newLeveledUp = new Set<PillarId>();
      if (this.previousLevels.size > 0) {
        for (const p of next) {
          const prev = this.previousLevels.get(p.id);
          if (prev != null && p.level > prev) {
            newLeveledUp.add(p.id);
          }
        }
      }

      // Refresh the baseline.
      for (const p of next) this.previousLevels.set(p.id, p.level);

      this.pillars = next;
      this.composite = comp;

      if (newLeveledUp.size > 0) {
        this.leveledUp = newLeveledUp;
        // Auto-clear after 4 seconds (matches the CSS animation duration).
        if (this.clearTimer != null) clearTimeout(this.clearTimer);
        this.clearTimer = setTimeout(() => {
          this.leveledUp = new Set();
          this.clearTimer = null;
        }, 4000);
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  /**
   * Clears the leveledUp set immediately and cancels any pending auto-clear
   * timer. Called from the /stats page's onDestroy so navigating away during
   * the 4s animation window doesn't leave stale state that re-shows the
   * [ LEVEL UP ] badge when the user returns later. The `previousLevels`
   * baseline is preserved across navigation so subsequent loads still detect
   * future level-ups correctly.
   */
  clearLeveledUp(): void {
    if (this.clearTimer != null) {
      clearTimeout(this.clearTimer);
      this.clearTimer = null;
    }
    if (this.leveledUp.size > 0) {
      this.leveledUp = new Set();
    }
  }
}

export const statsState = new StatsState();
