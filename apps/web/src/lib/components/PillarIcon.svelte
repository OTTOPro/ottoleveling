<!--
  apps/web/src/lib/components/PillarIcon.svelte

  Canonical Lucide icon per pillar: body=Heart, mind=Brain, finance=Wallet,
  projects=Rocket. Mirrors the `pillars.icon` strings in D1 seed metadata.

  Usage:
    <PillarIcon pillarId="body" size={14} />
    <PillarIcon pillarId={p.id} size={16} strokeWidth={1.8} />

  Renders nothing if pillarId is unknown (defensive - should never happen
  given the PillarId union type, but keeps the component pure).
-->
<script lang="ts">
  import { Heart, Brain, Wallet, Rocket } from '@lucide/svelte';
  import type { PillarId } from '$lib/constants/pillars';
  import type { Component } from 'svelte';

  interface Props {
    pillarId: PillarId;
    size?: number;
    strokeWidth?: number;
  }

  let { pillarId, size = 14, strokeWidth = 1.5 }: Props = $props();

  const ICONS: Record<PillarId, Component> = {
    body: Heart,
    mind: Brain,
    finance: Wallet,
    projects: Rocket,
  };

  const Icon = $derived(ICONS[pillarId]);
</script>

<Icon {size} {strokeWidth} aria-hidden="true" />
