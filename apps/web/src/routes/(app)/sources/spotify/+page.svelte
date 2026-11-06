<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { spotifyShowFiltersState } from '$lib/state/spotifyShowFilters.svelte';
  import AppHeader from '$lib/components/design-system/AppHeader.svelte';

  onMount(() => {
    spotifyShowFiltersState.load();
  });

  async function toggle(uri: string, current: boolean) {
    await spotifyShowFiltersState.setInclude(uri, !current);
  }
</script>

<div class="px-4 pt-4 pb-8 space-y-6 max-w-md mx-auto">
  <AppHeader
    title="Spotify"
    sub="Which listening counts toward quests"
    onBack={() => goto('/system/sources')}
  />

  <!-- Connection + filter summary banner -->
  <div class="connection-banner">
    <div class="connection-banner__left">
      <span class="connection-banner__dot" aria-hidden="true"></span>
      <span class="connection-banner__label">
        {spotifyShowFiltersState.filters.filter((f) => f.include_in_mind_learning)
          .length}/{spotifyShowFiltersState.filters.length} sources included
      </span>
    </div>
    <p class="connection-banner__note">Filters apply to future generations only. Past unchanged.</p>
  </div>

  {#if spotifyShowFiltersState.loading}
    <p class="text-sm text-[color:var(--color-text-secondary)]">Loading…</p>
  {:else if spotifyShowFiltersState.error}
    <p class="text-sm" style="color: var(--color-failure);">
      {spotifyShowFiltersState.error}
    </p>
  {:else if spotifyShowFiltersState.filters.length === 0}
    <p class="text-sm text-[color:var(--color-text-secondary)]">
      No shows detected. Connect Spotify and trigger a sync from /system.
    </p>
  {:else}
    <ul class="divide-y divide-[color:var(--color-border-subtle)]">
      {#each spotifyShowFiltersState.filters as f (f.show_spotify_uri)}
        <li class="py-3 flex items-center justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline gap-2">
              <p class="text-sm truncate">{f.show_name}</p>
              <!-- Pillar attribution badge (read-only; structurally ready for editable
                   per-show pillar mapping). All values are currently 'mind' (column default). -->
              <span
                class="shrink-0 inline-block text-[9px] tracking-[0.18em] uppercase border px-1.5 py-0.5"
                style="color: var(--color-pillar-{f.contributes_to_pillar}); border-color: var(--color-pillar-{f.contributes_to_pillar});"
                title="Counts toward the {f.contributes_to_pillar} pillar (read-only)"
              >
                [ {f.contributes_to_pillar.toUpperCase()} ]
              </span>
            </div>
            <p class="text-[10px] text-[color:var(--color-text-muted)] font-mono truncate">
              {f.show_spotify_uri}
            </p>
          </div>
          <button
            type="button"
            onclick={() => toggle(f.show_spotify_uri, f.include_in_mind_learning)}
            class="shrink-0 text-[10px] tracking-[0.18em] uppercase border px-3 py-1
                   {f.include_in_mind_learning
              ? 'border-[color:var(--color-system)] text-[color:var(--color-system)]'
              : 'border-[color:var(--color-border-emphasis)] text-[color:var(--color-text-muted)]'}"
          >
            {f.include_in_mind_learning ? '[ COMPTE POUR MIND ]' : '[ NE COMPTE PAS ]'}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .connection-banner {
    background: var(--color-bg);
    border: 1px solid var(--color-border-subtle);
    border-radius: 14px;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  .connection-banner__left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .connection-banner__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-success, #10b981);
    flex-shrink: 0;
  }

  .connection-banner__label {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 12px;
    color: var(--color-text-primary);
  }

  .connection-banner__note {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 11px;
    color: var(--color-text-muted);
    padding-left: 16px;
  }
</style>
