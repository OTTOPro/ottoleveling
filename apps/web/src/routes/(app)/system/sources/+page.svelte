<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { dataSourcesState } from '$lib/state/dataSources.svelte';
  import { listeningState } from '$lib/state/listening.svelte';
  import { projectsState } from '$lib/state/projects.svelte';

  import AppHeader from '$lib/components/design-system/AppHeader.svelte';
  import SectionHead from '$lib/components/design-system/SectionHead.svelte';
  import DataSourceCard from '$lib/components/DataSourceCard.svelte';
  import SectionCard from '$lib/components/design-system/SectionCard.svelte';
  import { ChevronRight } from '@lucide/svelte';

  onMount(async () => {
    await Promise.all([dataSourcesState.load(), listeningState.load(), projectsState.load()]);
  });
</script>

<div class="px-4 pt-4 pb-32 max-w-md mx-auto">
  <AppHeader title="Sources" sub="Data + reading" onBack={() => goto('/system')} />

  <!-- Data source cards -->
  <SectionHead label="Connections" />
  <ul class="source-list">
    {#each dataSourcesState.dataSources as row (row.provider)}
      <DataSourceCard {row} />
    {/each}
    {#if dataSourcesState.dataSources.length === 0 && !dataSourcesState.loading}
      <li class="empty-state">No data sources configured.</li>
    {/if}
  </ul>

  <!-- Active projects link -->
  <SectionCard
    pillar="projects"
    icon="Folder"
    title="Active projects"
    sub="Your active personal projects"
    badge={projectsState.activeCount > 0 ? `${projectsState.activeCount}` : '-'}
    href="/projects"
  />

  <!-- Spotify filter link -->
  <div class="filter-link-card" style="margin-top: 16px;">
    <div class="filter-link-card__content">
      <span class="filter-link-card__title">Spotify Show Filters</span>
      <span class="filter-link-card__sub">Manage which shows count toward mind quests</span>
    </div>
    <a href="/sources/spotify" class="filter-link-card__btn">
      Manage
      <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
    </a>
  </div>

  <!-- Reading section: Spotify library saves -->
  {#if listeningState.items.length > 0}
    <SectionHead label="Reading activity" />
    <p class="reading-disclaimer">saved ≠ listened</p>
    <div class="reading-list">
      {#each listeningState.items as item (`${item.listening_type}::${item.show_or_book_spotify_uri ?? item.show_or_book_title}`)}
        <div class="reading-row">
          <div class="reading-row__info">
            <span class="reading-row__title">{item.show_or_book_title}</span>
            <div class="reading-row__meta">
              <span
                class="reading-row__type"
                style="color: {item.listening_type === 'audiobook_save'
                  ? 'var(--color-pillar-mind)'
                  : 'var(--color-text-muted)'};"
              >
                {item.listening_type === 'audiobook_save' ? 'Audiobook' : 'Podcast'}
              </span>
              {#if item.show_or_book_author}
                <span class="reading-row__author">· {item.show_or_book_author}</span>
              {/if}
            </div>
          </div>
          <div class="reading-row__stats">
            <span class="reading-row__count"
              >{item.saves_in_window} save{item.saves_in_window === 1 ? '' : 's'}</span
            >
            <span class="reading-row__date">{item.last_save_date?.slice(0, 10) ?? ''}</span>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .source-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    list-style: none;
    padding: 0;
    margin-bottom: 20px;
  }

  .empty-state {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 14px;
    color: var(--color-text-secondary);
    padding: 12px 0;
  }

  .filter-link-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: var(--color-bg);
    border: 1px solid var(--color-border-subtle);
    border-radius: 14px;
    padding: 14px 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    margin-bottom: 24px;
  }

  .filter-link-card__content {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1;
    min-width: 0;
  }

  .filter-link-card__title {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 600;
    font-size: 15px;
    color: var(--color-text-primary);
  }

  .filter-link-card__sub {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 12px;
    color: var(--color-text-secondary);
  }

  .filter-link-card__btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-system);
    text-decoration: none;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .reading-disclaimer {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 10px;
    font-style: italic;
    color: var(--color-text-muted);
    margin-bottom: 10px;
    margin-top: -6px;
  }

  .reading-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--color-border-subtle);
    border: 1px solid var(--color-border-subtle);
    border-radius: 14px;
    overflow: hidden;
  }

  .reading-row {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--color-bg);
    padding: 12px 16px;
  }

  .reading-row__info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .reading-row__title {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 500;
    font-size: 14px;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .reading-row__meta {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .reading-row__type {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .reading-row__author {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 11px;
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .reading-row__stats {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
  }

  .reading-row__count {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-primary);
    font-variant-numeric: tabular-nums;
  }

  .reading-row__date {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 10px;
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
  }
</style>
