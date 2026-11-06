<!--
  StatCard.svelte - Compact pillar-tinted stat chip for the Today screen.
  Used for streak / focus minutes / xp today.

-->
<script lang="ts">
  import type { Component } from 'svelte';
  import type { PillarId } from '$lib/constants/pillars';

  interface Props {
    pillar: PillarId;
    icon: Component;
    value: number | string;
    unit: string;
    label: string;
  }

  let { pillar, icon: Icon, value, unit, label }: Props = $props();
</script>

<div class="stat-card" style="background-color: var(--color-pillar-{pillar}-bg);">
  <Icon size={19} strokeWidth={2.3} color="var(--color-pillar-{pillar})" />
  <div class="stat-card__value-row">
    <span class="stat-card__value">{value}</span>
    {#if unit}
      <span class="stat-card__unit" style="color: var(--color-pillar-{pillar});">{unit}</span>
    {/if}
  </div>
  <div class="stat-card__label">{label}</div>
</div>

<style>
  .stat-card {
    flex: 1;
    border-radius: 16px;
    padding: 13px 12px 14px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    display: flex;
    flex-direction: column;
  }

  .stat-card__value-row {
    display: flex;
    align-items: baseline;
    gap: 2px;
    margin-top: 12px;
  }

  .stat-card__value {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 700;
    font-size: 21px;
    line-height: 1;
    color: var(--color-text-primary);
  }

  .stat-card__unit {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 500;
    font-size: 11px;
    line-height: 1;
  }

  .stat-card__label {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 500;
    font-size: 11px;
    line-height: 1;
    color: var(--color-text-secondary);
    margin-top: 5px;
  }
</style>
