<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { Plus } from '@lucide/svelte';
  import { templatesState } from '$lib/state/templates.svelte';
  import { getTemplateCompletionCount } from '$lib/api/client';
  import type { QuestTemplate } from '$lib/api/types';
  import AppHeader from '$lib/components/design-system/AppHeader.svelte';
  import TemplateRow from '$lib/components/TemplateRow.svelte';
  import ConfirmModal from '$lib/components/ConfirmModal.svelte';
  import { DELETE_COPY } from '$lib/copy/delete-modals';

  // Reactive trash mode from URL search params.
  const showTrash = $derived(page.url.searchParams.get('show') === 'trash');
  const list = $derived(showTrash ? templatesState.trash : templatesState.templates);

  // Soft-delete modal state.
  let pendingDelete = $state<{ id: number; title: string; completionCount: number } | null>(null);

  // Hard-delete (purge) modal state.
  let pendingHardDelete = $state<{ id: number; title: string } | null>(null);

  onMount(async () => {
    if (showTrash) {
      await templatesState.loadTrash();
    } else {
      await templatesState.load(false);
    }
  });

  // React to showTrash URL changes after mount only.
  let _prevShowTrash = $state(showTrash);
  $effect(() => {
    const current = showTrash;
    if (current === _prevShowTrash) return;
    _prevShowTrash = current;
    if (current) {
      templatesState.loadTrash();
    } else {
      templatesState.load(false, true); // force-refresh on switch back to active
    }
  });

  async function openDeleteModal(t: QuestTemplate) {
    try {
      const { count } = await getTemplateCompletionCount(t.id);
      pendingDelete = { id: t.id, title: t.title, completionCount: count };
    } catch {
      pendingDelete = { id: t.id, title: t.title, completionCount: 0 };
    }
  }

  async function confirmSoftDelete() {
    if (!pendingDelete) return;
    await templatesState.softDelete(pendingDelete.id);
    pendingDelete = null;
  }

  function openHardDeleteModal(t: QuestTemplate) {
    pendingHardDelete = { id: t.id, title: t.title };
  }

  async function confirmHardDelete() {
    if (!pendingHardDelete) return;
    await templatesState.hardDelete(pendingHardDelete.id);
    pendingHardDelete = null;
  }
</script>

<div class="px-4 pt-4 pb-32 max-w-md mx-auto">
  <AppHeader title="Templates" sub="Quest blueprints & auto-rules">
    {#snippet right()}
      <a href="/templates/new" class="new-btn" aria-label="New template">
        <Plus size={20} strokeWidth={2.4} color="#fff" />
      </a>
    {/snippet}
  </AppHeader>

  <!-- Trash toggle -->
  <div class="trash-toggle">
    {#if showTrash}
      <a href="/templates" class="trash-toggle__link trash-toggle__link--active">[ VIEW ACTIVE ]</a>
    {:else}
      <a href="/templates?show=trash" class="trash-toggle__link">[ VIEW TRASH ]</a>
    {/if}
  </div>

  {#if templatesState.loading && templatesState.templates.length === 0}
    <div class="skeleton-list" aria-busy="true" aria-label="Templates loading">
      {#each [0, 1, 2, 3] as i (i)}
        <div class="skeleton-row">
          <div class="skeleton-row__title"></div>
          <div class="skeleton-row__sub"></div>
        </div>
      {/each}
    </div>
  {:else if templatesState.error}
    <p class="list-error">{templatesState.error}</p>
  {:else if list.length === 0}
    {#if showTrash}
      <p class="list-empty">Trash is empty. <a href="/templates">View active</a>.</p>
    {:else}
      <p class="list-empty">No active templates. <a href="/templates/new">Register one</a>.</p>
    {/if}
  {:else}
    <div class="template-list">
      {#each list as t (t.id)}
        <TemplateRow
          template={t}
          trashView={showTrash}
          onDelete={openDeleteModal}
          onRestore={(tmpl) => templatesState.restore(tmpl.id)}
          onPurge={openHardDeleteModal}
        />
      {/each}
    </div>
  {/if}
</div>

<!-- Soft-delete confirmation modal (LOCKED French copy - DO NOT MODIFY) -->
{#if pendingDelete}
  <ConfirmModal
    open={true}
    variant="danger"
    title={DELETE_COPY.template.softDelete.title}
    message={DELETE_COPY.template.softDelete.body(pendingDelete.completionCount)}
    confirmLabel={DELETE_COPY.template.softDelete.confirmLabel}
    cancelLabel={DELETE_COPY.template.softDelete.cancelLabel}
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

  .template-list {
    display: flex;
    flex-direction: column;
    gap: 11px;
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
    width: 35%;
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
