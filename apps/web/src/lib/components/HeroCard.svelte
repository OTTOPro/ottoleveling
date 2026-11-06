<!--
  HeroCard.svelte - Purple gradient hero card for the Today screen.
  Shows composite title + rank + ProgressRing for today's completion %.

-->
<script lang="ts">
  import ProgressRing from '$lib/components/design-system/ProgressRing.svelte';

  interface Props {
    title: string;
    rank: string;
    level: number;
    progressValue: number; // 0..1
    progressLabel?: string;
  }

  let { title, rank, level, progressValue, progressLabel = 'TODAY' }: Props = $props();

  const pct = $derived(Math.round(progressValue * 100));
</script>

<div class="hero-card">
  <!-- Glow accents -->
  <div class="hero-card__glow-top" aria-hidden="true"></div>
  <div class="hero-card__glow-bottom" aria-hidden="true"></div>

  <div class="hero-card__inner">
    <div class="hero-card__left">
      <div class="hero-card__bracket">[ Daily Ascension ]</div>
      <div class="hero-card__title">{title}</div>
      <div class="hero-card__rank-row">
        <span class="hero-card__rank">{rank}-RANK</span>
        <span class="hero-card__sep">·</span>
        <span class="hero-card__level">LVL {level}</span>
      </div>
    </div>

    <ProgressRing
      value={progressValue}
      size={84}
      stroke={8}
      color="#fff"
      track="rgba(255,255,255,0.22)"
    >
      <div class="hero-card__ring-inner">
        <span class="hero-card__ring-pct">{pct}<span class="hero-card__ring-pct-unit">%</span></span
        >
        <span class="hero-card__ring-label">{progressLabel}</span>
      </div>
    </ProgressRing>
  </div>
</div>

<style>
  .hero-card {
    position: relative;
    border-radius: 24px;
    overflow: hidden;
    padding: 22px;
    background: linear-gradient(150deg, #6b40e8 0%, #5f33e1 55%, #4e27c4 100%);
    box-shadow: 0 4px 16px rgba(95, 51, 225, 0.28);
    margin-bottom: 22px;
  }

  .hero-card__glow-top {
    position: absolute;
    top: -40px;
    right: -30px;
    width: 160px;
    height: 160px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.18), transparent 70%);
    pointer-events: none;
  }

  .hero-card__glow-bottom {
    position: absolute;
    bottom: -50px;
    left: -20px;
    width: 140px;
    height: 140px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(180, 140, 255, 0.25), transparent 70%);
    pointer-events: none;
  }

  .hero-card__inner {
    position: relative;
    display: flex;
    align-items: center;
    gap: 18px;
  }

  .hero-card__left {
    flex: 1;
    min-width: 0;
  }

  .hero-card__bracket {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 500;
    font-size: 10px;
    line-height: 1;
    color: rgba(255, 255, 255, 0.7);
    letter-spacing: 1.5px;
    text-transform: uppercase;
    margin-bottom: 9px;
  }

  .hero-card__title {
    font-family: 'Cinzel', Georgia, serif;
    font-weight: 700;
    font-size: 23px;
    line-height: 1.15;
    color: #fff;
    letter-spacing: 0.2px;
  }

  .hero-card__rank-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
  }

  .hero-card__rank {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 600;
    font-size: 11px;
    line-height: 1;
    color: rgba(255, 255, 255, 0.85);
  }

  .hero-card__sep {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 500;
    font-size: 11px;
    line-height: 1;
    color: rgba(255, 255, 255, 0.55);
  }

  .hero-card__level {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 500;
    font-size: 11px;
    line-height: 1;
    color: rgba(255, 255, 255, 0.7);
  }

  .hero-card__ring-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }

  .hero-card__ring-pct {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 700;
    font-size: 22px;
    line-height: 1;
    color: #fff;
  }

  .hero-card__ring-pct-unit {
    font-size: 12px;
  }

  .hero-card__ring-label {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 500;
    font-size: 8px;
    line-height: 1;
    color: rgba(255, 255, 255, 0.7);
    letter-spacing: 1px;
  }
</style>
