<!--
  MetricRow.svelte - /system/status metric row.
  Pastel pillar icon + label + mono value.

  Usage:
    <MetricRow icon="Shield" pillar="body" label="Current Level" value="L8" />
    <MetricRow icon="Lightbulb" pillar="mind" label="Total XP" value="1,240" />
-->
<script lang="ts">
  import {
    Shield,
    Lightbulb,
    Wallet,
    Folder,
    Activity,
    BarChart2,
    Settings,
    Zap,
    BookOpen,
    Trophy,
    GitBranch,
    Database,
    Music,
    Star,
    Crown,
    Target,
    Flame,
    Link,
  } from '@lucide/svelte';
  import type { Component } from 'svelte';
  import type { PillarId } from '$lib/constants/pillars';

  const ICON_MAP: Record<string, Component> = {
    // PascalCase keys (existing)
    Shield,
    Lightbulb,
    Wallet,
    Folder,
    Activity,
    BarChart2,
    Settings,
    Zap,
    BookOpen,
    Trophy,
    GitBranch,
    Database,
    Music,
    Star,
    Crown,
    Target,
    Flame,
    Link,
    // lowercase aliases for convenience
    shield: Shield,
    lightbulb: Lightbulb,
    wallet: Wallet,
    folder: Folder,
    activity: Activity,
    zap: Zap,
    trophy: Trophy,
    star: Star,
    crown: Crown,
    target: Target,
    flame: Flame,
    link: Link,
  };

  interface Props {
    icon: string;
    pillar: PillarId;
    label: string;
    value: string;
  }

  let { icon, pillar, label, value }: Props = $props();

  const IconComponent = $derived(ICON_MAP[icon] ?? Shield);
</script>

<div class="metric-row">
  <div
    class="metric-row__icon"
    style="
      background-color: var(--color-pillar-{pillar}-bg);
      color: var(--color-pillar-{pillar});
    "
  >
    <IconComponent size={18} strokeWidth={1.8} aria-hidden="true" />
  </div>

  <span class="metric-row__label">{label}</span>

  <span class="metric-row__value">{value}</span>
</div>

<style>
  .metric-row {
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 14px 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .metric-row:last-child {
    border-bottom: none;
  }

  .metric-row__icon {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .metric-row__label {
    flex: 1;
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 500;
    font-size: 15px;
    color: var(--color-text-primary);
    line-height: 1.2;
  }

  .metric-row__value {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 600;
    font-size: 15px;
    color: var(--color-text-primary);
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
</style>
