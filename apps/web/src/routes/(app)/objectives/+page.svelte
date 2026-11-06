<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { RotateCcw, Trash2, Pencil, Plus } from '@lucide/svelte';
  import { objectivesState } from '$lib/state/objectives.svelte';
  import type { Objective } from '$lib/api/types';
  import AppHeader from '$lib/components/design-system/AppHeader.svelte';
  import ObjectiveRow from '$lib/components/ObjectiveRow.svelte';
  import ConfirmModal from '$lib/components/ConfirmModal.svelte';
  import { DELETE_COPY } from '$lib/copy/delete-modals';

  // Reactive trash mode from URL search params.
  const showTrash = $derived(page.url.searchParams.get('show') === 'trash');

  // Single load trigger: onMount handles the initial fetch (using the
  // loaded flag in objectivesState to prevent redundant re-fetches).
  // The $effect below handles showTrash URL-param changes after mount.
  onMount(async () => {
    if (showTrash) {
      await objectivesState.loadTrash();
    } else {
      await objectivesState.load();
    }
  });

  // React to showTrash URL changes (e.g., user clicks VIEW TRASH).
  // Separate from onMount so we only fire when the param actually changes,
  // not on every render. The trash list has no loaded-guard (it's a view
  // that should always be fresh), so we always fetch it.
  let _prevShowTrash = $state(showTrash);
  $effect(() => {
    const current = showTrash;
    if (current === _prevShowTrash) return;
    _prevShowTrash = current;
    if (current) {
      objectivesState.loadTrash();
    } else {
      objectivesState.load(undefined, true); // force-refresh on switch back to active
    }
  });

  const TERMINAL_STATUSES = ['completed', 'abandoned'] as const;

  function isTerminal(status: string): boolean {
    return TERMINAL_STATUSES.includes(status as 'completed' | 'abandoned');
  }

  const activeList = $derived(
    objectivesState.objectives
      .filter((o) => !isTerminal(o.status))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  );

  const terminalList = $derived(
    objectivesState.objectives
      .filter((o) => isTerminal(o.status))
      .sort((a, b) =>
        (b.completed_at ?? b.created_at).localeCompare(a.completed_at ?? a.created_at),
      ),
  );

  const trashList = $derived(objectivesState.trash);

  // Soft-delete modal state.
  let pendingDelete = $state<{ id: number; title: string } | null>(null);
  // Hard-delete (purge) modal state.
  let pendingHardDelete = $state<{ id: number; title: string } | null>(null);

  async function confirmSoftDelete() {
    if (!pendingDelete) return;
    await objectivesState.softDelete(pendingDelete.id);
    pendingDelete = null;
  }

  async function confirmHardDelete() {
    if (!pendingHardDelete) return;
    await objectivesState.hardDelete(pendingHardDelete.id);
    pendingHardDelete = null;
  }

  /**
   * Compute a time-based progress value for an objective (0..1).
   * Uses time elapsed between created_at and target_date.
   */
  function timelinePct(o: Objective): number {
    const created = new Date(o.created_at.replace(' ', 'T') + 'Z').getTime();
    const target = new Date(o.target_date + 'T00:00:00Z').getTime();
    const now = Date.now();
    if (target <= created) return 1;
    const elapsed = now - created;
    const span = target - created;
    return Math.max(0, Math.min(1, elapsed / span));
  }

  function subText(o: Objective): string {
    if (o.target_value != null && o.target_metric) return `${o.target_value} ${o.target_metric}`;
    if (o.target_metric) return o.target_metric;
    if (o.description) return o.description.slice(0, 60);
    return '';
  }
</script>

<div class="px-4 pt-4 pb-32 max-w-md mx-auto">
  <AppHeader title="Objectives" sub="Long-horizon arcs">
    {#snippet right()}
      <a href="/objectives/new" class="new-btn" aria-label="New objective">
        <Plus size={20} strokeWidth={2.4} color="#fff" />
      </a>
    {/snippet}
  </AppHeader>

  <!-- Trash toggle -->
  <div class="trash-toggle">
    {#if showTrash}
      <a href="/objectives" class="trash-toggle__link trash-toggle__link--active">[ VIEW ACTIVE ]</a
      >
    {:else}
      <a href="/objectives?show=trash" class="trash-toggle__link">[ VIEW TRASH ]</a>
    {/if}
  </div>

  {#if objectivesState.loading && objectivesState.objectives.length === 0}
    <!-- Skeleton rows while loading for the first time -->
    <div class="skeleton-list" aria-busy="true" aria-label="Objectives loading">
      {#each [0, 1, 2, 3] as i (i)}
        <div class="skeleton-row">
          <div class="skeleton-row__title"></div>
          <div class="skeleton-row__sub"></div>
        </div>
      {/each}
    </div>
  {:else if objectivesState.error}
    <p class="list-error">Error: {objectivesState.error}</p>
  {:else if showTrash}
    <!-- Trash view -->
    {#if trashList.length === 0}
      <p class="list-empty">Trash is empty. <a href="/objectives">View active</a>.</p>
    {:else}
      <div class="obj-list">
        {#each trashList as obj (obj.id)}
          <div class="trash-row">
            <ObjectiveRow objective={obj} progressValue={timelinePct(obj)} subText={subText(obj)} />
            <div class="trash-row__actions">
              <button
                type="button"
                class="action-btn action-btn--restore"
                onclick={() => objectivesState.restore(obj.id)}
              >
                <RotateCcw size={11} strokeWidth={1.5} />
                [ RESTORE ]
              </button>
              <button
                type="button"
                class="action-btn action-btn--purge"
                onclick={() => (pendingHardDelete = { id: obj.id, title: obj.title })}
              >
                <Trash2 size={11} strokeWidth={1.5} />
                [ DELETE PERMANENTLY ]
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <!-- Active view -->
    {#if activeList.length === 0 && terminalList.length === 0}
      <p class="list-empty">No active objectives. <a href="/objectives/new">Register one</a>.</p>
    {:else}
      <div class="obj-list">
        <!-- Active + Paused -->
        {#each activeList as obj (obj.id)}
          <div class="obj-with-actions">
            <ObjectiveRow objective={obj} progressValue={timelinePct(obj)} subText={subText(obj)} />
            <div class="obj-actions">
              <a href={`/objectives/${obj.id}`} class="action-btn action-btn--view">[ VIEW ]</a>
              <a href={`/objectives/${obj.id}/edit`} class="action-btn action-btn--edit">
                <Pencil size={11} strokeWidth={1.5} /> [ EDIT ]
              </a>
              <button
                type="button"
                class="action-btn action-btn--delete"
                onclick={() => (pendingDelete = { id: obj.id, title: obj.title })}
              >
                <Trash2 size={11} strokeWidth={1.5} /> [ SUPPRIMER ]
              </button>
            </div>
          </div>
        {/each}

        <!-- COMPLETED divider (only when there are terminal objectives) -->
        {#if terminalList.length > 0}
          <div class="completed-divider" aria-hidden="true">
            <span class="completed-divider__line"></span>
            <span class="completed-divider__label">COMPLETED</span>
            <span class="completed-divider__line"></span>
          </div>

          <!-- Completed + Abandoned -->
          {#each terminalList as obj (obj.id)}
            <div class="obj-with-actions">
              <ObjectiveRow
                objective={obj}
                progressValue={timelinePct(obj)}
                subText={subText(obj)}
              />
              <div class="obj-actions">
                <a href={`/objectives/${obj.id}`} class="action-btn action-btn--view">[ VIEW ]</a>
                <a href={`/objectives/${obj.id}/edit`} class="action-btn action-btn--edit">
                  <Pencil size={11} strokeWidth={1.5} /> [ EDIT ]
                </a>
                <button
                  type="button"
                  class="action-btn action-btn--delete"
                  onclick={() => (pendingDelete = { id: obj.id, title: obj.title })}
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

<!-- Soft-delete confirmation modal (LOCKED French copy - DO NOT MODIFY) -->
{#if pendingDelete}
  <ConfirmModal
    open={true}
    variant="danger"
    title={DELETE_COPY.objective.softDelete.title}
    message={DELETE_COPY.objective.softDelete.body}
    confirmLabel={DELETE_COPY.objective.softDelete.confirmLabel}
    cancelLabel={DELETE_COPY.objective.softDelete.cancelLabel}
    onConfirm={confirmSoftDelete}
    onCancel={() => (pendingDelete = null)}
  />
{/if}

<!-- Permanent-delete confirmation modal -->
{#if pendingHardDelete}
  <ConfirmModal
    open={true}
    variant="danger"
    title={DELETE_COPY.permanent.title}
    message={DELETE_COPY.permanent.body}
    confirmLabel={DELETE_COPY.permanent.confirmLabel}
    cancelLabel={DELETE_COPY.permanent.cancelLabel}
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

  .obj-list {
    display: flex;
    flex-direction: column;
    gap: 11px;
  }

  .obj-with-actions,
  .trash-row {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .obj-actions,
  .trash-row__actions {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 14px 10px;
    border-left: 1px solid var(--color-border-subtle);
    border-right: 1px solid var(--color-border-subtle);
    border-bottom: 1px solid var(--color-border-subtle);
    border-radius: 0 0 16px 16px;
    background: var(--color-bg);
    margin-top: -1px;
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

  .completed-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 10px 0 2px;
  }

  .completed-divider__line {
    flex: 1;
    height: 1px;
    background: var(--color-border-subtle);
  }

  .completed-divider__label {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 600;
    font-size: 11px;
    color: var(--color-text-muted);
    letter-spacing: 1px;
    text-transform: uppercase;
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

  .list-empty a {
    color: var(--color-system);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .list-error {
    font-size: 14px;
    color: var(--color-failure);
  }

  /* Skeleton loading rows */
  .skeleton-list {
    display: flex;
    flex-direction: column;
    gap: 11px;
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
    width: 60%;
    animation: skeleton-pulse 1.5s ease-in-out infinite;
  }

  .skeleton-row__sub {
    height: 11px;
    background: var(--color-border-subtle);
    border-radius: 6px;
    width: 40%;
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
