/**
 * Spotify show filters state store.
 *
 * Mirrors the autoCompletionsState / achievementsState singleton pattern.
 *
 * - `load()` fetches all rows from GET /api/sources/spotify/filters.
 * - `setInclude(uri, include)` applies an optimistic update (local first),
 *   calls PATCH, and reverts on API error.
 *
 * Forward-only contract: toggling a filter only affects FUTURE generation
 * prompts and auto-complete evaluation. Past quest reasoning and bilans
 * are immutable regardless of filter state changes.
 */
import type { SpotifyShowFilter } from '$lib/api/types';
import { listSpotifyShowFilters, setSpotifyShowFilter } from '$lib/api/client';

class SpotifyShowFiltersState {
  filters = $state<SpotifyShowFilter[]>([]);
  loading = $state(false);
  error: string | null = $state(null);

  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const data = await listSpotifyShowFilters();
      this.filters = data.filters;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  /**
   * Optimistically toggle include_in_mind_learning for the given URI.
   * Reverts to the previous value on API error.
   */
  async setInclude(uri: string, include: boolean): Promise<void> {
    const idx = this.filters.findIndex((f) => f.show_spotify_uri === uri);
    if (idx === -1) return;

    // Optimistic update
    const prev = this.filters[idx]!.include_in_mind_learning;
    this.filters = this.filters.map((f, i) =>
      i === idx ? { ...f, include_in_mind_learning: include } : f,
    );

    try {
      await setSpotifyShowFilter(uri, include);
    } catch (e) {
      // Revert on error
      this.filters = this.filters.map((f, i) =>
        i === idx ? { ...f, include_in_mind_learning: prev } : f,
      );
      this.error = e instanceof Error ? e.message : String(e);
    }
  }
}

export const spotifyShowFiltersState = new SpotifyShowFiltersState();
