<!--
  ProgressBar.svelte - Horizontal pill progress bar.
  Animates width on mount after optional delay (respects prefers-reduced-motion).

  Usage:
    <ProgressBar value={0.65} color="var(--color-pillar-body)" height={8} />
-->
<script lang="ts">
  import { motionPreferences } from '$lib/state/motion-preferences.svelte';

  interface Props {
    value?: number;
    color?: string;
    track?: string;
    height?: number;
    delay?: number;
  }

  let {
    value = 0,
    color = 'var(--color-system)',
    track = 'var(--color-border-subtle)',
    height = 8,
    delay = 120,
  }: Props = $props();

  const clampedValue = $derived(Math.min(1, Math.max(0, value)));
  const pct = $derived(`${Math.round(clampedValue * 100)}%`);

  // Animate width: start at 0 then expand to target after delay
  let displayPct = $state('0%');

  $effect(() => {
    const target = pct;
    if (motionPreferences.reduced) {
      displayPct = target;
    } else {
      displayPct = '0%';
      const id = setTimeout(() => {
        displayPct = target;
      }, delay);
      return () => clearTimeout(id);
    }
  });

  const transitionStyle = $derived(
    motionPreferences.reduced ? 'none' : 'width 1s cubic-bezier(.22,1,.36,1)',
  );
</script>

<div
  class="bar-track"
  style="
    background-color: {track};
    height: {height}px;
    border-radius: 999px;
  "
  role="progressbar"
  aria-valuenow={Math.round(clampedValue * 100)}
  aria-valuemin={0}
  aria-valuemax={100}
>
  <div
    class="bar-fill"
    style="
      background-color: {color};
      width: {displayPct};
      height: 100%;
      border-radius: 999px;
      transition: {transitionStyle};
    "
  ></div>
</div>

<style>
  .bar-track {
    width: 100%;
    overflow: hidden;
  }

  .bar-fill {
    will-change: width;
  }
</style>
