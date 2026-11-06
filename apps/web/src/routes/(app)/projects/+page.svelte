<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { Plus, RotateCcw, Trash2, Pencil } from '@lucide/svelte';
  import { projectsState } from '$lib/state/projects.svelte';
  import type { ActiveProject } from '$lib/api/types';
  import AppHeader from '$lib/components/design-system/AppHeader.svelte';
  import PillarBadge from '$lib/components/design-system/PillarBadge.svelte';
  import ConfirmModal from '$lib/components/ConfirmModal.svelte';
  import {
    PROJECT_SOFT_DELETE_COPY,
    PROJECT_PERMANENT_DELETE_COPY,
    PROJECT_FORM_LABELS,
  } from '$lib/copy/project-actions';

  const showTrash = $derived(page.url.searchParams.get('show') === 'trash');

  onMount(async () => {
    if (showTrash) {
      await projectsState.loadTrash();
    } else {
      await projectsState.load();
    }
  });

  // React to showTrash URL changes after mount only.
  let _prevShowTrash = $state(showTrash);
  $effect(() => {
    const current = showTrash;
    if (current === _prevShowTrash) return;
    _prevShowTrash = current;
    if (current) {
      projectsState.loadTrash();
    } else {
      projectsState.load(undefined, true); // force-refresh on switch back to active
    }
  });

  const activeList = $derived(
    projectsState.items
      .filter((p) => p.status === 'active')
      .sort((a, b) => b.priority - a.priority || b.id - a.id),
  );

  const pausedList = $derived(
    projectsState.items
      .filter((p) => p.status === 'paused')
      .sort((a, b) => b.priority - a.priority || b.id - a.id),
  );

  const archivedList = $derived(
    projectsState.items
      .filter((p) => p.status === 'archived')
      .sort((a, b) => b.priority - a.priority || b.id - a.id),
  );

  const trashList = $derived(projectsState.trashItems);

  // Soft-delete modal state.
  let pendingDelete = $state<{ id: number; name: string } | null>(null);
  // Hard-delete (purge) modal state.
  let pendingHardDelete = $state<{ id: number; name: string } | null>(null);

  async function confirmSoftDelete() {
    if (!pendingDelete) return;
    await projectsState.softDelete(pendingDelete.id);
    pendingDelete = null;
  }

  async function confirmHardDelete() {
    if (!pendingHardDelete) return;
    await projectsState.permanentDelete(pendingHardDelete.id);
    pendingHardDelete = null;
  }

  function ageLabel(p: ActiveProject): string {
    const ms = Date.now() - new Date(p.start_date + 'T00:00:00Z').getTime();
    const days = Math.floor(ms / 86_400_000);
    if (days < 1) return '<1d';
    if (days < 30) return `${days}d`;
    return `${Math.floor(days / 30)}mo`;
  }

  function statusLabel(status: string): string {
    if (status === 'active') return PROJECT_FORM_LABELS.statusActive;
    if (status === 'paused') return PROJECT_FORM_LABELS.statusPaused;
    return PROJECT_FORM_LABELS.statusArchived;
  }
</script>

<div class="px-4 pt-4 pb-32 max-w-md mx-auto">
  <AppHeader title={PROJECT_FORM_LABELS.pageList} sub={PROJECT_FORM_LABELS.pageListSub}>
    {#snippet right()}
      <a href="/projects/new" class="new-btn" aria-label={PROJECT_FORM_LABELS.buttonNew}>
        <Plus size={20} strokeWidth={2.4} color="#fff" />
      </a>
    {/snippet}
  </AppHeader>

  <!-- Trash toggle -->
  <div class="trash-toggle">
    {#if showTrash}
      <a href="/projects" class="trash-toggle__link trash-toggle__link--active">
        [ {PROJECT_FORM_LABELS.showActiveLink.toUpperCase()} ]
      </a>
    {:else}
      <a href="/projects?show=trash" class="trash-toggle__link">
        [ {PROJECT_FORM_LABELS.showTrashLink.toUpperCase()} ]
      </a>
    {/if}
  </div>

  {#if projectsState.loading && projectsState.items.length === 0}
    <div class="skeleton-list" aria-busy="true" aria-label="Projects loading">
      {#each [0, 1, 2, 3] as i (i)}
        <div class="skeleton-row">
          <div class="skeleton-row__title"></div>
          <div class="skeleton-row__sub"></div>
        </div>
      {/each}
    </div>
  {:else if projectsState.error}
    <p class="list-error">Error: {projectsState.error}</p>
  {:else if showTrash}
    <!-- Trash view -->
    {#if trashList.length === 0}
      <p class="list-empty">{PROJECT_FORM_LABELS.emptyTrash}</p>
    {:else}
      <div class="proj-list">
        {#each trashList as proj (proj.id)}
          <div class="proj-row trash-row">
            <div class="proj-row__inner">
              <PillarBadge pillar={proj.pillar} size={40} />
              <div class="proj-row__body">
                <span
                  class="proj-row__name"
                  style="text-decoration: line-through; opacity: 0.5; color: var(--color-text-muted);"
                  >{proj.name}</span
                >
                {#if proj.description}
                  <span class="proj-row__sub" style="opacity: 0.5;"
                    >{proj.description.slice(0, 60)}</span
                  >
                {/if}
                <div class="proj-row__meta" style="opacity: 0.5;">
                  <span class="proj-row__priority">P{proj.priority}</span>
                  <span class="proj-row__age">{ageLabel(proj)}</span>
                </div>
              </div>
            </div>
            <div class="proj-actions">
              <button
                type="button"
                class="action-btn action-btn--restore"
                onclick={() => projectsState.restore(proj.id)}
              >
                <RotateCcw size={11} strokeWidth={1.5} />
                [ {PROJECT_FORM_LABELS.buttonRestore.toUpperCase()} ]
              </button>
              <button
                type="button"
                class="action-btn action-btn--purge"
                onclick={() => (pendingHardDelete = { id: proj.id, name: proj.name })}
              >
                <Trash2 size={11} strokeWidth={1.5} />
                [ {PROJECT_FORM_LABELS.buttonPermanentDelete.toUpperCase()} ]
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <!-- Active view -->
    {#if activeList.length === 0 && pausedList.length === 0 && archivedList.length === 0}
      <p class="list-empty">{PROJECT_FORM_LABELS.emptyList}</p>
    {:else}
      <div class="proj-list">
        <!-- Active -->
        {#each activeList as proj (proj.id)}
          <div class="proj-row">
            <div class="proj-row__inner">
              <PillarBadge pillar={proj.pillar} size={40} />
              <div class="proj-row__body">
                <span class="proj-row__name">{proj.name}</span>
                {#if proj.description}
                  <span class="proj-row__sub">{proj.description.slice(0, 60)}</span>
                {/if}
                <div class="proj-row__meta">
                  <span class="proj-row__priority">P{proj.priority}</span>
                  <span class="proj-row__age">{ageLabel(proj)}</span>
                  <span
                    class="proj-row__status proj-row__status--active"
                    style="color: var(--color-pillar-{proj.pillar});"
                  >
                    {statusLabel(proj.status)}
                  </span>
                </div>
              </div>
            </div>
            <div class="proj-actions">
              <a href={`/projects/${proj.id}`} class="action-btn action-btn--view">[ VIEW ]</a>
              <a href={`/projects/${proj.id}/edit`} class="action-btn action-btn--edit">
                <Pencil size={11} strokeWidth={1.5} /> [ EDIT ]
              </a>
              <button
                type="button"
                class="action-btn action-btn--delete"
                onclick={() => (pendingDelete = { id: proj.id, name: proj.name })}
              >
                <Trash2 size={11} strokeWidth={1.5} /> [ SUPPRIMER ]
              </button>
            </div>
          </div>
        {/each}

        <!-- Paused divider -->
        {#if pausedList.length > 0}
          <div class="section-divider" aria-hidden="true">
            <span class="section-divider__line"></span>
            <span class="section-divider__label">EN PAUSE</span>
            <span class="section-divider__line"></span>
          </div>
          {#each pausedList as proj (proj.id)}
            <div class="proj-row proj-row--paused">
              <div class="proj-row__inner">
                <PillarBadge pillar={proj.pillar} size={40} />
                <div class="proj-row__body">
                  <span class="proj-row__name">{proj.name}</span>
                  {#if proj.description}
                    <span class="proj-row__sub">{proj.description.slice(0, 60)}</span>
                  {/if}
                  <div class="proj-row__meta">
                    <span class="proj-row__priority">P{proj.priority}</span>
                    <span class="proj-row__age">{ageLabel(proj)}</span>
                    <span class="proj-row__status proj-row__status--paused">En pause</span>
                  </div>
                </div>
              </div>
              <div class="proj-actions">
                <a href={`/projects/${proj.id}`} class="action-btn action-btn--view">[ VIEW ]</a>
                <a href={`/projects/${proj.id}/edit`} class="action-btn action-btn--edit">
                  <Pencil size={11} strokeWidth={1.5} /> [ EDIT ]
                </a>
                <button
                  type="button"
                  class="action-btn action-btn--delete"
                  onclick={() => (pendingDelete = { id: proj.id, name: proj.name })}
                >
                  <Trash2 size={11} strokeWidth={1.5} /> [ SUPPRIMER ]
                </button>
              </div>
            </div>
          {/each}
        {/if}

        <!-- Archived divider -->
        {#if archivedList.length > 0}
          <div class="section-divider" aria-hidden="true">
            <span class="section-divider__line"></span>
            <span class="section-divider__label">ARCHIVED</span>
            <span class="section-divider__line"></span>
          </div>
          {#each archivedList as proj (proj.id)}
            <div class="proj-row proj-row--archived">
              <div class="proj-row__inner">
                <PillarBadge pillar={proj.pillar} size={40} />
                <div class="proj-row__body">
                  <span class="proj-row__name" style="color: var(--color-text-muted);"
                    >{proj.name}</span
                  >
                  {#if proj.description}
                    <span class="proj-row__sub" style="opacity: 0.7;"
                      >{proj.description.slice(0, 60)}</span
                    >
                  {/if}
                  <div class="proj-row__meta" style="opacity: 0.7;">
                    <span class="proj-row__priority">P{proj.priority}</span>
                    <span class="proj-row__age">{ageLabel(proj)}</span>
                    <span class="proj-row__status proj-row__status--archived">Archived</span>
                  </div>
                </div>
              </div>
              <div class="proj-actions">
                <a href={`/projects/${proj.id}`} class="action-btn action-btn--view">[ VIEW ]</a>
                <a href={`/projects/${proj.id}/edit`} class="action-btn action-btn--edit">
                  <Pencil size={11} strokeWidth={1.5} /> [ EDIT ]
                </a>
                <button
                  type="button"
                  class="action-btn action-btn--delete"
                  onclick={() => (pendingDelete = { id: proj.id, name: proj.name })}
                >
                  <Trash2 size={11} strokeWidth={1.5} /> [ SUPPRIMER ]
                </button>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    {/if}
  {/if}
</div>

<!-- Soft-delete confirmation modal - LOCKED French copy (project-actions.ts) -->
{#if pendingDelete}
  <ConfirmModal
    open={true}
    variant="danger"
    title={PROJECT_SOFT_DELETE_COPY.modalTitle}
    message={PROJECT_SOFT_DELETE_COPY.modalBody}
    confirmLabel={PROJECT_SOFT_DELETE_COPY.confirmLabel}
    cancelLabel={PROJECT_SOFT_DELETE_COPY.cancelLabel}
    onConfirm={confirmSoftDelete}
    onCancel={() => (pendingDelete = null)}
  />
{/if}

<!-- Permanent-delete confirmation modal -->
{#if pendingHardDelete}
  <ConfirmModal
    open={true}
    variant="danger"
    title={PROJECT_PERMANENT_DELETE_COPY.modalTitle}
    message={PROJECT_PERMANENT_DELETE_COPY.modalBody}
    confirmLabel={PROJECT_PERMANENT_DELETE_COPY.confirmLabel}
    cancelLabel={PROJECT_PERMANENT_DELETE_COPY.cancelLabel}
    onConfirm={confirmHardDelete}
    onCancel={() => (pendingHardDelete = null)}
  />
{/if}

<style>
  .new-btn {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: var(--color-system);
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    text-decoration: none;
    transition: opacity 0.15s;
  }

  .new-btn:hover {
    opacity: 0.85;
  }

  .trash-toggle {
    margin-bottom: 16px;
  }

  .trash-toggle__link {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 11px;
    color: var(--color-text-muted);
    text-decoration: none;
    letter-spacing: 0.1em;
    transition: color 0.15s;
  }

  .trash-toggle__link:hover,
  .trash-toggle__link--active {
    color: var(--color-system);
  }

  .proj-list {
    display: flex;
    flex-direction: column;
    gap: 11px;
  }

  .proj-row {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border-subtle);
    border-radius: 16px;
    background: var(--color-bg);
    overflow: hidden;
  }

  .proj-row__inner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 14px 12px;
  }

  .proj-row__body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .proj-row__name {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 600;
    font-size: 15px;
    color: var(--color-text-primary);
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .proj-row__sub {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 500;
    font-size: 13px;
    color: var(--color-text-secondary);
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .proj-row__meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 2px;
  }

  .proj-row__priority,
  .proj-row__age {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 10px;
    color: var(--color-text-muted);
    letter-spacing: 0.05em;
  }

  .proj-row__status {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .proj-row__status--paused {
    color: var(--color-text-muted);
  }

  .proj-row__status--archived {
    color: var(--color-text-muted);
    opacity: 0.6;
  }

  .proj-actions {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 14px;
    border-top: 1px solid var(--color-border-subtle);
    background: var(--color-bg);
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 10px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    cursor: pointer;
    background: none;
    border: none;
    padding: 2px 0;
    text-decoration: none;
    transition: opacity 0.15s;
  }

  .action-btn:hover {
    opacity: 0.7;
  }

  .action-btn--view {
    color: var(--color-text-secondary);
  }

  .action-btn--edit {
    color: var(--color-system);
  }

  .action-btn--delete {
    color: var(--color-failure);
  }

  .action-btn--restore {
    color: var(--color-system);
  }

  .action-btn--purge {
    color: var(--color-failure);
  }

  .section-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 10px 0 2px;
  }

  .section-divider__line {
    flex: 1;
    height: 1px;
    background: var(--color-border-subtle);
  }

  .section-divider__label {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 600;
    font-size: 11px;
    color: var(--color-text-muted);
    letter-spacing: 1px;
  }

  .list-empty {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 14px;
    color: var(--color-text-secondary);
    padding: 8px 0;
  }

  .list-error {
    font-size: 14px;
    color: var(--color-failure);
  }

  /* Skeleton loading rows */
  .skeleton-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .skeleton-row {
    padding: 14px 16px;
    border: 1px solid var(--color-border-subtle);
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .skeleton-row__title {
    height: 14px;
    background: var(--color-border-subtle);
    border-radius: 6px;
    width: 55%;
    animation: skeleton-pulse 1.5s ease-in-out infinite;
  }

  .skeleton-row__sub {
    height: 11px;
    background: var(--color-border-subtle);
    border-radius: 6px;
    width: 38%;
    animation: skeleton-pulse 1.5s ease-in-out infinite 0.2s;
  }

  @keyframes skeleton-pulse {
    0%,
    100% {
      opacity: 0.5;
    }
    50% {
      opacity: 1;
    }
  }
</style>
