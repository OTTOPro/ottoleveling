<!--
  Trend.svelte - Up/down arrow + value in green/red mono.

  Usage:
    <Trend up={true} val="12%" />
    <Trend up={false} val="4.2%" />
-->
<script lang="ts">
  import { TrendingUp, TrendingDown } from '@lucide/svelte';

  interface Props {
    up: boolean;
    val: string;
  }

  let { up, val }: Props = $props();

  const color = $derived(up ? '#10B981' : '#EF4444');
</script>

<span class="trend" style="color: {color};">
  {#if up}
    <TrendingUp size={12} strokeWidth={2} aria-hidden="true" />
  {:else}
    <TrendingDown size={12} strokeWidth={2} aria-hidden="true" />
  {/if}
  <span class="trend-val">{val}</span>
</span>

<style>
  .trend {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 500;
    font-size: 11px;
    line-height: 1;
  }

  .trend-val {
    display: inline-block;
  }
</style>
