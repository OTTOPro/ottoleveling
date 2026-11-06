/**
 * Auto-completions state store. Mirrors achievementsState's
 * recentUnlocks pattern.
 *
 * - `items` is populated by calling `setItems()` from the Today page's
 *   onMount after fetching GET /api/state (recentAutoCompletions field).
 * - `acknowledged` is a localStorage-backed Set keyed by AutoCompletion.id;
 *   updated when the user taps to dismiss the notification banner.
 * - `visible` is the derived first-unacknowledged entry that the banner renders.
 */
import type { AutoCompletion } from '$lib/api/types';

const LS_KEY = 'acknowledged_auto_completion_ids';

function loadAcknowledged(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function persistAcknowledged(set: Set<string>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify([...set]));
  } catch {
    // ignore - quota or disabled
  }
}

class AutoCompletionsState {
  items = $state<AutoCompletion[]>([]);
  acknowledged = $state<Set<string>>(loadAcknowledged());

  /** Called from the Today page after loading GET /api/state. */
  setItems(entries: AutoCompletion[]): void {
    this.items = entries;
  }

  get visible(): AutoCompletion | null {
    return this.items.find((e) => !this.acknowledged.has(e.id)) ?? null;
  }

  acknowledge(id: string): void {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local copy for an immutable update; reactivity comes from reassigning this.acknowledged
    const next = new Set(this.acknowledged);
    next.add(id);
    this.acknowledged = next;
    persistAcknowledged(next);
  }
}

export const autoCompletionsState = new AutoCompletionsState();
