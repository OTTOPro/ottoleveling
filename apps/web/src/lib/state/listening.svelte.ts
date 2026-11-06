import { getCurrentListening } from '$lib/api/client';
import type { LibrarySaveSummary } from '$lib/api/types';

/**
 * Singleton state store for the /system [ READING ] section. Backs the per-entry
 * card list (podcast/audiobook library saves). `load()` populates `items` from
 * GET /api/data-sources/current-listening. Despite the store name, this carries
 * library-SAVE summaries - NOT listening sessions (Spotify does not expose podcast/audiobook listening history).
 * The "saved ≠ listened" disclaimer surfaces in the rendered UI cards.
 */
class ListeningState {
  items = $state<LibrarySaveSummary[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);

  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      this.items = await getCurrentListening();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }
}

export const listeningState = new ListeningState();
