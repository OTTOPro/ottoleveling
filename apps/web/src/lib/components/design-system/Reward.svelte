<!--
  Reward.svelte - Mono XP/stat chip. Wraps children in JetBrains Mono.

  Usage:
    <Reward>+50 XP</Reward>
    <Reward color="var(--color-success)">Level 7</Reward>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    color?: string;
    children?: Snippet;
  }

  let { color = 'var(--color-text-secondary)', children }: Props = $props();
</script>

<span class="reward" style="color: {color};">
  {#if children}
    {@render children()}
  {/if}
</span>

<style>
  .reward {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 500;
    font-size: 12px;
    line-height: 1;
    display: inline-block;
  }
</style>
