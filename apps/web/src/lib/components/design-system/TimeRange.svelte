<!--
  TimeRange.svelte - Pill group selector for time range controls.

  Usage:
    <TimeRange value={range} onchange={(v) => (range = v)} />
    <TimeRange value="30d" options={['7d', '30d', '90d']} onchange={setRange} />
-->
<script lang="ts">
  interface Props {
    value: string;
    options?: string[];
    onchange: (val: string) => void;
  }

  let { value, options = ['7d', '30d', '90d', 'All time'], onchange }: Props = $props();
</script>

<div class="time-range" role="group" aria-label="Time range">
  {#each options as option (option)}
    <button
      type="button"
      class="time-range__option"
      class:time-range__option--active={option === value}
      onclick={() => onchange(option)}
      aria-pressed={option === value}
    >
      {option}
    </button>
  {/each}
</div>

<style>
  .time-range {
    display: inline-flex;
    align-items: center;
    background-color: var(--color-bg-elevated);
    border: 1px solid var(--color-border-subtle);
    border-radius: 10px;
    padding: 3px;
    gap: 2px;
  }

  .time-range__option {
    font-family:
      'Inter',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 500;
    font-size: 11px;
    line-height: 1;
    padding: 5px 8px;
    border-radius: 7px;
    border: none;
    cursor: pointer;
    background: transparent;
    color: var(--color-text-secondary);
    transition:
      background-color 0.15s,
      color 0.15s,
      font-weight 0.1s;
    white-space: nowrap;
  }

  .time-range__option--active {
    background-color: #5f33e1;
    color: #ffffff;
    font-weight: 600;
  }

  .time-range__option:not(.time-range__option--active):hover {
    background-color: var(--color-bg-sunken);
    color: var(--color-text-primary);
  }
</style>
