<!--
  PillarBadge.svelte - Square chip with pastel pillar background + Lucide icon.
  Icon mapping: Shield / Lightbulb / Wallet / Folder.
  This is an ADDITIVE chip primitive. The existing PillarIcon.svelte (icon-only)
  keeps its own icon set.

  Usage:
    <PillarBadge pillar="body" size={36} />
    <PillarBadge pillar="mind" size={44} radius={10} />
-->
<script lang="ts">
  import { Shield, Lightbulb, Wallet, Folder } from '@lucide/svelte';
  import type { Component } from 'svelte';
  import type { PillarId } from '$lib/constants/pillars';

  interface Props {
    pillar: PillarId;
    size?: number;
    radius?: number;
  }

  let { pillar, size = 36, radius = 8 }: Props = $props();

  const ICONS: Record<PillarId, Component> = {
    body: Shield,
    mind: Lightbulb,
    finance: Wallet,
    projects: Folder,
  };

  const Icon = $derived(ICONS[pillar]);

  // Icon size ~ 55% of badge size, feels balanced
  const iconSize = $derived(Math.round(size * 0.55));
</script>

<div
  class="pillar-badge"
  style="
    width: {size}px;
    height: {size}px;
    border-radius: {radius}px;
    background-color: var(--color-pillar-{pillar}-bg);
    color: var(--color-pillar-{pillar});
  "
  aria-hidden="true"
>
  <Icon size={iconSize} strokeWidth={1.8} />
</div>

<style>
  .pillar-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
</style>
