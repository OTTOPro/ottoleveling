<!--
  PillarGrid.svelte - 2×2 grid of pillar stat cards for /stats.
  Shows pillar icon, level, XP fraction, thin ProgressBar per pillar.

-->
<script lang="ts">
  import PillarBadge from '$lib/components/design-system/PillarBadge.svelte';
  import ProgressBar from '$lib/components/design-system/ProgressBar.svelte';
  import BracketTitle from '$lib/components/design-system/BracketTitle.svelte';
  import type { PillarStats } from '$lib/api/types';

  interface Props {
    pillars: PillarStats[];
  }

  let { pillars }: Props = $props();

  function progressValue(p: PillarStats): number {
    if (p.xp <= 0) return 0;
    const xpForCurrent = p.level * p.level * 100;
    const span = p.xp_to_next - xpForCurrent;
    const within = p.xp - xpForCurrent;
    return span > 0 ? Math.max(0, Math.min(1, within / span)) : 0;
  }
</script>

<div class="pillar-grid">
  <BracketTitle
    bracket="Pillar Breakdown"
    title="Pillars"
    sub="Level & momentum across your four arcs"
  />
  <div class="pillar-grid__cards">
    {#each pillars as p (p.id)}
      <div class="pillar-stat-card">
        <div class="pillar-stat-card__top">
          <PillarBadge pillar={p.id} size={40} radius={12} />
        </div>
        <div class="pillar-stat-card__name" style="color: var(--color-text-primary);">{p.name}</div>
        <div class="pillar-stat-card__level">
          <span class="pillar-stat-card__level-num">Lvl {p.level}</span>
        </div>
        <div class="pillar-stat-card__xp">
          {p.xp} / {p.xp_to_next} XP
        </div>
        <div class="pillar-stat-card__bar">
          <ProgressBar
            value={progressValue(p)}
            color="var(--color-pillar-{p.id})"
            height={4}
            track="#EFEFF3"
          />
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .pillar-grid {
    margin-bottom: 30px;
  }

  .pillar-grid__cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 11px;
  }

  .pillar-stat-card {
    background: var(--color-bg);
    border: 1px solid var(--color-border-subtle);
    border-radius: 16px;
    padding: 14px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .pillar-stat-card__top {
    margin-bottom: 12px;
  }

  .pillar-stat-card__name {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 600;
    font-size: 16px;
    line-height: 1;
    margin-bottom: 6px;
  }

  .pillar-stat-card__level {
    display: flex;
    align-items: baseline;
    gap: 7px;
    margin-bottom: 5px;
  }

  .pillar-stat-card__level-num {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 700;
    font-size: 24px;
    line-height: 1;
    color: var(--color-text-primary);
  }

  .pillar-stat-card__xp {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 400;
    font-size: 11px;
    line-height: 1;
    color: var(--color-text-muted);
    margin-bottom: 11px;
  }

  .pillar-stat-card__bar {
    width: 100%;
  }
</style>
