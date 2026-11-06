<!--
  TemplateRow.svelte - HYBRIDE template list row.
  PillarBadge + title + rule indicator + pencil/trash actions.
  In trash view: Restore + Purge links instead.

-->
<script lang="ts">
  import { Pencil, Trash2, Bolt, Check, RotateCcw } from '@lucide/svelte';
  import PillarBadge from '$lib/components/design-system/PillarBadge.svelte';
  import type { QuestTemplate } from '$lib/api/types';

  interface Props {
    template: QuestTemplate;
    trashView?: boolean;
    onEdit?: (t: QuestTemplate) => void;
    onDelete?: (t: QuestTemplate) => void;
    onRestore?: (t: QuestTemplate) => void;
    onPurge?: (t: QuestTemplate) => void;
  }

  let { template, trashView = false, onDelete, onRestore, onPurge }: Props = $props();

  const hasAutoRule = $derived(template.auto_complete_rule != null);

  // Visual differentiation for trash view
  const cardOpacity = $derived(trashView ? 0.5 : 1);
</script>

<div class="template-row" style="opacity: {cardOpacity};">
  <PillarBadge pillar={template.pillar_id} size={40} />

  <div class="template-row__body">
    <div
      class="template-row__title"
      style="text-decoration: {trashView ? 'line-through' : 'none'}; color: {trashView
        ? 'var(--color-text-muted)'
        : 'var(--color-text-primary)'};"
    >
      {template.title}
    </div>
    <div class="template-row__rule">
      {#if hasAutoRule}
        <Bolt size={11} strokeWidth={2.4} color="var(--color-pillar-{template.pillar_id})" />
        <span style="color: var(--color-pillar-{template.pillar_id});">Auto · metric threshold</span
        >
      {:else}
        <Check size={11} strokeWidth={2.4} color="var(--color-text-muted)" />
        <span style="color: var(--color-text-muted);">Manual check-off</span>
      {/if}
    </div>
  </div>

  <div class="template-row__actions">
    {#if trashView}
      <button
        type="button"
        class="template-row__action template-row__action--restore"
        onclick={() => onRestore?.(template)}
        aria-label="Restore template"
      >
        <RotateCcw size={13} strokeWidth={1.8} />
        <span>Restore</span>
      </button>
      <button
        type="button"
        class="template-row__action template-row__action--purge"
        onclick={() => onPurge?.(template)}
        aria-label="Permanently delete template"
      >
        <Trash2 size={13} strokeWidth={1.8} />
      </button>
    {:else}
      <a
        href={`/templates/${template.id}/edit`}
        class="template-row__icon-btn"
        aria-label="Edit template"
      >
        <Pencil size={16} strokeWidth={2} color="var(--color-text-secondary)" />
      </a>
      <button
        type="button"
        class="template-row__icon-btn"
        onclick={() => onDelete?.(template)}
        aria-label="Delete template"
      >
        <Trash2 size={16} strokeWidth={2} color="var(--color-text-muted)" />
      </button>
    {/if}
  </div>
</div>

<style>
  .template-row {
    display: flex;
    align-items: center;
    gap: 13px;
    background: var(--color-bg);
    border: 1px solid var(--color-border-subtle);
    border-radius: 16px;
    padding: 13px 14px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  .template-row__body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .template-row__title {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 600;
    font-size: 15px;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .template-row__rule {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 500;
    font-size: 11px;
    line-height: 1;
  }

  .template-row__actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .template-row__icon-btn {
    width: 32px;
    height: 32px;
    border-radius: 9px;
    border: 1px solid var(--color-border-subtle);
    background: var(--color-surface);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    color: inherit;
    text-decoration: none;
    transition: border-color 0.15s;
  }

  .template-row__icon-btn:hover {
    border-color: var(--color-border-emphasis);
  }

  .template-row__action {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    background: none;
    border: none;
    padding: 4px 6px;
    border-radius: 6px;
    transition: opacity 0.15s;
  }

  .template-row__action:hover {
    opacity: 0.7;
  }

  .template-row__action--restore {
    color: var(--color-system);
  }

  .template-row__action--purge {
    color: var(--color-failure);
  }
</style>
