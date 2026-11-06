<!--
  HunterStatusHero.svelte - Dark→purple gradient hero for /system hub.
  Crown chip + HUNTER STATUS bracket + Cinzel title + gold ProgressBar.

-->
<script lang="ts">
  import { Crown } from '@lucide/svelte';
  import ProgressBar from '$lib/components/design-system/ProgressBar.svelte';

  interface Props {
    title: string;
    rank: string;
    nextRank: string;
    level: number;
    rankProgress: number; // 0..1
    lifetimeXp: number;
  }

  let { title, rank, nextRank, level, rankProgress, lifetimeXp }: Props = $props();

  const pct = $derived(Math.round(rankProgress * 100));
  const xpFormatted = $derived(lifetimeXp.toLocaleString());
</script>

<div class="hunter-hero">
  <!-- Glow accent -->
  <div class="hunter-hero__glow" aria-hidden="true"></div>

  <div class="hunter-hero__inner">
    <!-- Crown + title -->
    <div class="hunter-hero__header">
      <div class="hunter-hero__crown">
        <Crown size={26} strokeWidth={1.8} color="#F7D774" />
      </div>
      <div class="hunter-hero__title-block">
        <div class="hunter-hero__bracket">[ HUNTER STATUS ]</div>
        <div class="hunter-hero__title">{title}</div>
      </div>
    </div>

    <!-- Rank row -->
    <div class="hunter-hero__rank-row">
      <span class="hunter-hero__rank">{rank}-RANK · LVL {level}</span>
      <span class="hunter-hero__next-rank">→ {nextRank}-RANK</span>
    </div>

    <!-- Gold progress bar -->
    <ProgressBar value={rankProgress} color="#F7D774" track="rgba(255,255,255,0.15)" height={9} />

    <!-- Footer -->
    <div class="hunter-hero__footer">
      {pct}% toward ascension · {xpFormatted} lifetime XP
    </div>
  </div>
</div>

<style>
  .hunter-hero {
    position: relative;
    border-radius: 24px;
    overflow: hidden;
    padding: 24px 22px;
    background: linear-gradient(155deg, #2a1b4d 0%, #3a2270 48%, #5f33e1 100%);
    box-shadow: 0 4px 16px rgba(95, 51, 225, 0.3);
    margin-bottom: 24px;
  }

  .hunter-hero__glow {
    position: absolute;
    top: -50px;
    right: -40px;
    width: 190px;
    height: 190px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.14), transparent 70%);
    pointer-events: none;
  }

  .hunter-hero__inner {
    position: relative;
  }

  .hunter-hero__header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 20px;
  }

  .hunter-hero__crown {
    width: 52px;
    height: 52px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .hunter-hero__title-block {
    flex: 1;
    min-width: 0;
  }

  .hunter-hero__bracket {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 500;
    font-size: 9px;
    line-height: 1;
    color: rgba(255, 255, 255, 0.6);
    letter-spacing: 1.5px;
    text-transform: uppercase;
    margin-bottom: 7px;
  }

  .hunter-hero__title {
    font-family: 'Cinzel', Georgia, serif;
    font-weight: 700;
    font-size: 21px;
    line-height: 1.1;
    color: #fff;
    letter-spacing: 0.2px;
  }

  .hunter-hero__rank-row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    margin-bottom: 9px;
  }

  .hunter-hero__rank {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 600;
    font-size: 12px;
    line-height: 1;
    color: rgba(255, 255, 255, 0.8);
  }

  .hunter-hero__next-rank {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 500;
    font-size: 11px;
    line-height: 1;
    color: rgba(255, 255, 255, 0.6);
  }

  .hunter-hero__footer {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 500;
    font-size: 10px;
    line-height: 1;
    color: rgba(255, 255, 255, 0.55);
    margin-top: 10px;
  }
</style>
