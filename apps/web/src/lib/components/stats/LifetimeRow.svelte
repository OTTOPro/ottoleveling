<!--
  LifetimeRow.svelte - 4-column lifetime totals row for /stats.
  Shows: Total XP / Quests / Days active / Hunter since.

-->
<script lang="ts">
  interface Props {
    totalXp: number;
    totalQuests: number;
    activeDays: number;
    hunterSince: string | null;
  }

  let { totalXp, totalQuests, activeDays, hunterSince }: Props = $props();

  const items = $derived([
    ['Total XP', totalXp.toLocaleString()],
    ['Quests', String(totalQuests)],
    ['Days active', String(activeDays)],
    ['Hunter since', hunterSince ?? '-'],
  ]);
</script>

<div class="lifetime-row">
  <div class="lifetime-row__header">LIFETIME</div>
  <div class="lifetime-row__cols">
    {#each items as [k, v], i (k)}
      <div
        class="lifetime-row__col"
        style="border-left: {i > 0
          ? '1px solid var(--color-border-subtle)'
          : 'none'}; padding-left: {i > 0 ? '12px' : '0'};"
      >
        <div class="lifetime-row__val">{v}</div>
        <div class="lifetime-row__key">{k}</div>
      </div>
    {/each}
  </div>
</div>

<style>
  .lifetime-row {
    background: var(--color-surface);
    border-radius: 16px;
    padding: 16px;
    border: 1px solid var(--color-border-subtle);
  }

  .lifetime-row__header {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 500;
    font-size: 10px;
    line-height: 1;
    color: var(--color-text-muted);
    letter-spacing: 1.2px;
    text-transform: uppercase;
    margin-bottom: 14px;
  }

  .lifetime-row__cols {
    display: flex;
  }

  .lifetime-row__col {
    flex: 1;
  }

  .lifetime-row__val {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 500;
    font-size: 14px;
    line-height: 1.1;
    color: var(--color-text-primary);
  }

  .lifetime-row__key {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 400;
    font-size: 9px;
    line-height: 1.2;
    color: var(--color-text-secondary);
    margin-top: 6px;
  }
</style>
