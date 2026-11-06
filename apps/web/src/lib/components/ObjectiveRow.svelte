<!--
  ObjectiveRow.svelte - HYBRIDE objective list row.
  PillarBadge + title + sub + state badge + ProgressBar.
  Abandoned gets strikethrough + opacity 0.62.

-->
<script lang="ts">
  import PillarBadge from '$lib/components/design-system/PillarBadge.svelte';
  import ProgressBar from '$lib/components/design-system/ProgressBar.svelte';
  import type { Objective } from '$lib/api/types';

  // STATE_META matching design bundle
  const STATE_META: Record<string, { label: string; color: string; bg: string }> = {
    active: { label: 'Active', color: '#10B981', bg: '#D1FAE5' },
    paused: { label: 'Paused', color: '#D97706', bg: '#FEF3C7' },
    completed: { label: 'Done', color: '#5F33E1', bg: '#EDE4FF' },
    abandoned: { label: 'Abandoned', color: '#9CA0AE', bg: '#F2F2F5' },
  };

  interface Props {
    objective: Objective;
    progressValue?: number; // 0..1
    subText?: string;
  }

  let { objective, progressValue = 0, subText = '' }: Props = $props();

  const sm = $derived(STATE_META[objective.status] ?? STATE_META['active']!);
  const isAbandoned = $derived(objective.status === 'abandoned');
  const isDim = $derived(objective.status === 'completed' || objective.status === 'abandoned');
  const showBar = $derived(objective.status !== 'abandoned');
  const barColor = $derived(
    objective.status === 'paused' ? '#D97706' : `var(--color-pillar-${objective.pillar_id})`,
  );
  const effectivePct = $derived(
    objective.status === 'completed' ? 100 : Math.round(progressValue * 100),
  );
</script>

<div class="obj-row" style="opacity: {isDim ? 0.62 : 1};">
  <!-- Top row -->
  <div class="obj-row__top" style="margin-bottom: {showBar ? '12px' : 0};">
    <PillarBadge pillar={objective.pillar_id} size={38} />
    <div class="obj-row__body">
      <div class="obj-row__title" style="text-decoration: {isAbandoned ? 'line-through' : 'none'};">
        {objective.title}
      </div>
      {#if subText}
        <div class="obj-row__sub">{subText}</div>
      {/if}
    </div>
    <span class="obj-row__badge" style="color: {sm.color}; background: {sm.bg};">{sm.label}</span>
  </div>

  <!-- Progress bar (hidden for abandoned) -->
  {#if showBar}
    <div class="obj-row__bar-row">
      <ProgressBar value={progressValue} color={barColor} height={7} />
      <span class="obj-row__pct">{effectivePct}%</span>
    </div>
  {/if}
</div>

<style>
  .obj-row {
    background: var(--color-bg);
    border: 1px solid var(--color-border-subtle);
    border-radius: 16px;
    padding: 14px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  .obj-row__top {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .obj-row__body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .obj-row__title {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 600;
    font-size: 15px;
    line-height: 1.2;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .obj-row__sub {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 500;
    font-size: 12px;
    line-height: 1;
    color: var(--color-text-secondary);
  }

  .obj-row__badge {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 600;
    font-size: 10px;
    line-height: 1;
    padding: 5px 8px;
    border-radius: 6px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .obj-row__bar-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .obj-row__pct {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 600;
    font-size: 11px;
    line-height: 1;
    color: var(--color-text-secondary);
    flex-shrink: 0;
    white-space: nowrap;
  }
</style>
