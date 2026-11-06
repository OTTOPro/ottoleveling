<!--
  StatsHero.svelte - Light-purple gradient hero for /stats.
  Shows composite level + HUNTER STATUS + weekly XP + trend + ProgressRing.

  rankProgress is the real progress within the composite rank bracket.
             rankIsMax=true (S-rank) shows flat 100% + "MAX" mono caption below ring.
-->
<script lang="ts">
  import ProgressRing from '$lib/components/design-system/ProgressRing.svelte';
  import Trend from '$lib/components/design-system/Trend.svelte';

  interface Props {
    compositeLevel: number;
    thisWeekXp: number;
    prevWeekXp?: number;
    rankProgress?: number; // 0..1 - fraction within current composite bracket
    /** True when composite rank is S (max); renders MAX label below ring */
    rankIsMax?: boolean;
  }

  let {
    compositeLevel,
    thisWeekXp,
    prevWeekXp,
    rankProgress = 0,
    rankIsMax = false,
  }: Props = $props();

  const trend = $derived(() => {
    if (prevWeekXp == null || prevWeekXp === 0) return null;
    const pct = Math.round(((thisWeekXp - prevWeekXp) / prevWeekXp) * 100);
    return { up: pct >= 0, val: `${Math.abs(pct)}%` };
  });
</script>

<div class="stats-hero">
  <div class="stats-hero__inner">
    <!-- Left: composite level -->
    <div class="stats-hero__left">
      <div class="stats-hero__level">{compositeLevel}</div>
      <div class="stats-hero__label">HUNTER STATUS</div>
    </div>

    <!-- Vertical divider -->
    <div class="stats-hero__divider" aria-hidden="true"></div>

    <!-- Middle: weekly XP + trend -->
    <div class="stats-hero__mid">
      <div class="stats-hero__xp">{thisWeekXp.toLocaleString()} XP</div>
      <div class="stats-hero__xp-label">THIS WEEK</div>
      {#if trend()}
        <div class="stats-hero__trend">
          <Trend up={trend()!.up} val={trend()!.val} />
          <span class="stats-hero__trend-vs">vs last wk</span>
        </div>
      {/if}
    </div>

    <!-- Right: ProgressRing - shows rank progress within current bracket.
         S-rank: flat 100% + MAX caption -->
    <div class="stats-hero__ring-wrap">
      <ProgressRing value={rankProgress} size={64} stroke={7} color="#5F33E1" track="#E3D9FA">
        <span class="stats-hero__ring-pct">{Math.round(rankProgress * 100)}%</span>
      </ProgressRing>
      {#if rankIsMax}
        <div class="stats-hero__ring-max">MAX</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .stats-hero {
    position: relative;
    border-radius: 24px;
    padding: 22px;
    margin-bottom: 26px;
    overflow: hidden;
    background: linear-gradient(135deg, #ede4ff 0%, #f7f3ff 55%, #ffffff 100%);
    border: 1px solid #ece6fa;
    box-shadow: 0 2px 12px rgba(95, 51, 225, 0.06);
  }

  .stats-hero__inner {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .stats-hero__left {
    flex-shrink: 0;
  }

  .stats-hero__level {
    font-family: 'Cinzel', Georgia, serif;
    font-weight: 700;
    font-size: 30px;
    line-height: 1;
    color: var(--color-text-primary);
    letter-spacing: 0.2px;
  }

  .stats-hero__label {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 500;
    font-size: 9px;
    line-height: 1;
    color: var(--color-text-secondary);
    letter-spacing: 1px;
    text-transform: uppercase;
    margin-top: 7px;
  }

  .stats-hero__divider {
    width: 1px;
    align-self: stretch;
    background: #dcd2f5;
    flex-shrink: 0;
  }

  .stats-hero__mid {
    flex: 1;
    min-width: 0;
  }

  .stats-hero__xp {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 600;
    font-size: 19px;
    line-height: 1;
    color: var(--color-text-primary);
    white-space: nowrap;
  }

  .stats-hero__xp-label {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 400;
    font-size: 9px;
    line-height: 1;
    color: var(--color-text-muted);
    letter-spacing: 0.5px;
    text-transform: uppercase;
    margin-top: 5px;
  }

  .stats-hero__trend {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 9px;
  }

  .stats-hero__trend-vs {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 400;
    font-size: 10px;
    line-height: 1;
    color: var(--color-text-muted);
  }

  .stats-hero__ring-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .stats-hero__ring-pct {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 500;
    font-size: 13px;
    line-height: 1;
    color: var(--color-system);
  }

  .stats-hero__ring-max {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 500;
    font-size: 10px;
    line-height: 1;
    color: var(--color-success, #10b981);
    letter-spacing: 0.5px;
  }
</style>
