<!--
  PillarTag.svelte - Small caps mono pillar name in pillar accent color.

  Usage:
    <PillarTag pillar="body" />
    <PillarTag pillar="finance" />
-->
<script lang="ts">
  import type { PillarId } from '$lib/constants/pillars';

  interface Props {
    pillar: PillarId;
  }

  let { pillar }: Props = $props();
</script>

<span class="pillar-tag" style="color: var(--color-pillar-{pillar});">
  {pillar.toUpperCase()}
</span>

<style>
  .pillar-tag {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 600;
    font-size: 10px;
    letter-spacing: 1px;
    text-transform: uppercase;
    line-height: 1;
    display: inline-block;
  }
</style>
