<!--
  ProgressRing.svelte - Circular SVG progress indicator.
  Animates from 0 → value on mount (respects prefers-reduced-motion).

  Usage:
    <ProgressRing value={0.72} size={72} stroke={7}>
      {#snippet children()}
        <span class="num">72%</span>
      {/snippet}
    </ProgressRing>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { motionPreferences } from '$lib/state/motion-preferences.svelte';

  interface Props {
    value?: number;
    size?: number;
    stroke?: number;
    color?: string;
    track?: string;
    children?: Snippet;
  }

  let {
    value = 0,
    size = 72,
    stroke = 7,
    color = 'var(--color-system)',
    track = 'var(--color-border-subtle)',
    children,
  }: Props = $props();

  const clampedValue = $derived(Math.min(1, Math.max(0, value)));
  const radius = $derived((size - stroke) / 2);
  const circumference = $derived(2 * Math.PI * radius);
  const center = $derived(size / 2);

  // Animate offset from full (hidden) to target.
  // Initialized to a large number; $effect sets the real start value synchronously.
  let offset = $state(9999);

  $effect(() => {
    // Re-run whenever value or motionPreferences changes
    const target = circumference * (1 - clampedValue);
    if (motionPreferences.reduced) {
      offset = target;
    } else {
      offset = circumference; // reset to hidden first
      const id = setTimeout(() => {
        offset = target;
      }, 80);
      return () => clearTimeout(id);
    }
  });

  const transitionStyle = $derived(
    motionPreferences.reduced ? 'none' : 'stroke-dashoffset 1s cubic-bezier(.22,1,.36,1)',
  );
</script>

<div class="ring-wrap" style="width: {size}px; height: {size}px;">
  <svg
    width={size}
    height={size}
    viewBox="0 0 {size} {size}"
    aria-hidden="true"
    style="transform: rotate(-90deg);"
  >
    <!-- Track -->
    <circle cx={center} cy={center} r={radius} fill="none" stroke={track} stroke-width={stroke} />
    <!-- Progress arc -->
    <circle
      cx={center}
      cy={center}
      r={radius}
      fill="none"
      stroke={color}
      stroke-width={stroke}
      stroke-linecap="round"
      stroke-dasharray={circumference}
      stroke-dashoffset={offset}
      style="transition: {transitionStyle};"
    />
  </svg>
  {#if children}
    <div class="ring-center">
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .ring-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  svg {
    position: absolute;
    inset: 0;
  }

  .ring-center {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1;
  }
</style>
