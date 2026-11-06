<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { statsState } from '$lib/state/stats.svelte';
  import { statsAnalyticsState } from '$lib/state/statsAnalytics.svelte';
  import { achievementsState } from '$lib/state/achievements.svelte';

  import BracketTitle from '$lib/components/design-system/BracketTitle.svelte';
  import TimeRange from '$lib/components/design-system/TimeRange.svelte';
  import StatsHero from '$lib/components/stats/StatsHero.svelte';
  import PillarGrid from '$lib/components/stats/PillarGrid.svelte';
  import LifetimeRow from '$lib/components/stats/LifetimeRow.svelte';

  import { PILLARS } from '$lib/constants/pillars';

  // Sort pillars in canonical order (body, mind, finance, projects)
  const order = PILLARS.map((p) => p.id);
  const sortedPillars = $derived(
    [...statsState.pillars].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)),
  );

  // Time range selector
  let range = $state('30d');
  function parseDays(r: string): number {
    if (r === '7d') return 7;
    if (r === '90d') return 90;
    if (r === 'All time') return 365;
    return 30; // default '30d'
  }

  function onRangeChange(r: string) {
    range = r;
    statsAnalyticsState.load(parseDays(r));
  }

  // Composite level = sum of pillar levels
  const compositeLevel = $derived(statsState.pillars.reduce((s, p) => s + p.level, 0));

  // Rank progress from composite endpoint (real bracket progress)
  const rankProgress = $derived(statsState.composite?.progress ?? 0);
  const rankIsMax = $derived(statsState.composite?.is_max ?? false);

  // Heatmap heat color
  function heatColor(v: number): string {
    if (v === 0) return '#F4F4F8';
    if (v <= 2) return '#EDE4FF';
    if (v <= 4) return '#B9A6FF';
    return '#5F33E1';
  }

  // XP chart smooth path
  function smoothPath(pts: Array<[number, number]>): string {
    if (pts.length < 2) return '';
    let d = `M ${pts[0]![0]} ${pts[0]![1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i]!;
      const p1 = pts[i]!;
      const p2 = pts[i + 1]!;
      const p3 = pts[i + 2] ?? pts[i + 1]!;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
    }
    return d;
  }

  // XP chart computed values
  const xpSeries = $derived(statsAnalyticsState.xpSeries?.series ?? []);
  const xpValues = $derived(xpSeries.map((p) => p.xp));
  const xpMax = $derived(Math.max(1, ...xpValues));
  const xpAvg = $derived(
    xpValues.length ? Math.round(xpValues.reduce((a, b) => a + b, 0) / xpValues.length) : 0,
  );
  const xpBestIdx = $derived(xpValues.indexOf(Math.max(...xpValues)));
  const xpBestDay = $derived(xpSeries[xpBestIdx]?.day ?? '');
  const xpWorstIdx = $derived(xpValues.indexOf(Math.min(...xpValues)));
  const xpWorstDay = $derived(xpSeries[xpWorstIdx]?.day ?? '');

  // Chart dimensions
  const W = 340,
    H = 170,
    pad = 8;
  const xpPts = $derived(
    xpSeries.map((_, i): [number, number] => [
      pad + (i / Math.max(1, xpSeries.length - 1)) * (W - pad * 2),
      H - pad - (xpValues[i]! / xpMax) * (H - pad * 2),
    ]),
  );
  const xpLinePath = $derived(smoothPath(xpPts));
  const xpAreaPath = $derived(
    xpPts.length > 0
      ? `${xpLinePath} L ${xpPts[xpPts.length - 1]![0]} ${H} L ${xpPts[0]![0]} ${H} Z`
      : '',
  );

  // Heatmap grid (91 cells, 13w × 7d, newest on right)
  const heatGrid = $derived(statsAnalyticsState.heatmapGrid);

  // RADAR data (real data from /api/stats/distribution)
  const RADAR_LABELS = ['END', 'STR', 'FLEX', 'INT', 'WIS', 'CAP', 'CRAFT', 'FOCUS'];
  const RADAR_CX = 140,
    RADAR_CY = 118,
    RADAR_R = 86;
  const RADAR_N = RADAR_LABELS.length;

  // Build a lookup from distribution data; max value for normalization
  const radarDistLookup = $derived(
    new Map(statsAnalyticsState.distribution.map((d) => [d.type, d.total])),
  );
  const radarMax = $derived(Math.max(1, ...statsAnalyticsState.distribution.map((d) => d.total)));
  const radarEmpty = $derived(
    statsAnalyticsState.distribution.length === 0 ||
      statsAnalyticsState.distribution.every((d) => d.total === 0),
  );

  function radarPt(i: number, frac: number): { x: number; y: number } {
    const a = ((-90 + i * (360 / RADAR_N)) * Math.PI) / 180;
    return {
      x: RADAR_CX + Math.cos(a) * RADAR_R * frac,
      y: RADAR_CY + Math.sin(a) * RADAR_R * frac,
    };
  }

  function radarPolyPoints(frac: number): string {
    return RADAR_LABELS.map((_, i) => {
      const p = radarPt(i, frac);
      return `${p.x},${p.y}`;
    }).join(' ');
  }

  /** Build the actual data polygon from distribution totals (normalized to radarMax). */
  function radarDataPoints(): string {
    return RADAR_LABELS.map((label, i) => {
      const total =
        radarDistLookup.get(
          label as 'END' | 'STR' | 'FLEX' | 'INT' | 'WIS' | 'CAP' | 'CRAFT' | 'FOCUS',
        ) ?? 0;
      const frac = radarEmpty ? 0 : total / radarMax;
      const p = radarPt(i, Math.max(0.03, frac)); // min 0.03 so polygon visible even at 0
      return `${p.x},${p.y}`;
    }).join(' ');
  }

  const radarGridFracs = [0.25, 0.5, 0.75, 1];
  const radarLines = RADAR_LABELS.map((_, i) => {
    const p = radarPt(i, 1);
    return { x1: RADAR_CX, y1: RADAR_CY, x2: p.x, y2: p.y };
  });

  // Achievements
  const recentAchievements = $derived(statsAnalyticsState.recentAchievements.slice(0, 4));
  const achievPillarBg: Record<string, string> = {
    body: '#FFE4E4',
    mind: '#EDE4FF',
    finance: '#D1FAE5',
    projects: '#DBEAFE',
  };

  function achievBg(pillarId: string | null): string {
    return pillarId ? (achievPillarBg[pillarId] ?? '#F4F4F8') : '#F4F4F8';
  }

  function achievColor(pillarId: string | null): string {
    const COLORS: Record<string, string> = {
      body: '#EF4444',
      mind: '#7C3AED',
      finance: '#10B981',
      projects: '#2563EB',
    };
    return pillarId ? (COLORS[pillarId] ?? '#5F33E1') : '#5F33E1';
  }

  function formatDate(iso: string): string {
    return iso.slice(0, 10);
  }

  onMount(() => {
    statsState.load();
    statsAnalyticsState.load(parseDays(range));
    achievementsState.load();
  });

  onDestroy(() => {
    statsState.clearLeveledUp();
  });
</script>

<div class="stats-page">
  <!-- Page header -->
  <header class="stats-header">
    <div>
      <div class="stats-header__title">Stats</div>
      <div class="stats-header__sub">Your complete progression history</div>
    </div>
    <div class="stats-header__range">
      <TimeRange value={range} onchange={onRangeChange} />
    </div>
  </header>

  <!-- 1. StatsHero -->
  <StatsHero
    {compositeLevel}
    thisWeekXp={statsAnalyticsState.thisWeekXp}
    {rankProgress}
    {rankIsMax}
  />

  <!-- 2. PillarGrid 2×2 -->
  {#if sortedPillars.length > 0}
    <PillarGrid pillars={sortedPillars} />
  {/if}

  <!-- 3. Heatmap -->
  <div class="section">
    <BracketTitle title="Activity Streak" sub="Daily quest completion · last 90 days" />
    <div class="heatmap-wrap">
      <div class="heatmap-grid-area">
        <div class="heatmap-grid">
          {#each Array.from({ length: 13 * 7 }) as _, i (i)}
            {@const col = Math.floor(i / 7)}
            {@const row = i % 7}
            {@const v = heatGrid[col * 7 + row] ?? 0}
            <div
              class="heat-cell"
              style="
                background: {heatColor(v)};
                border: {v === 0 ? '1px solid #E5E5EA' : 'none'};
                grid-column: {col + 1};
                grid-row: {row + 1};
              "
              title="{v} quests"
            ></div>
          {/each}
        </div>
        <!-- Legend -->
        <div class="heat-legend">
          {#each [0, 1, 2, 3, 4, '5+'] as n, li (li)}
            <div class="heat-legend__item">
              <div
                class="heat-legend__swatch"
                style="background: {heatColor(typeof n === 'string' ? 5 : n)}; border: {n === 0
                  ? '1px solid #E5E5EA'
                  : 'none'};"
              ></div>
              <span class="heat-legend__label">{n}</span>
            </div>
          {/each}
        </div>
      </div>
      <!-- Side stats -->
      <div class="heat-side">
        <div class="heat-side__streak">
          <span class="heat-side__flame">🔥</span>
          <span class="heat-side__streak-num">- days</span>
        </div>
        <div class="heat-side__sub">current streak</div>
        <div class="heat-side__divider"></div>
        <div class="heat-side__stat">Active: {heatGrid.filter((v) => v > 0).length}/90 days</div>
      </div>
    </div>
  </div>

  <!-- 4. XP Chart -->
  <div class="section">
    <BracketTitle title="XP Earned Over Time" sub="Daily XP, last {parseDays(range)} days" />
    <div class="xp-chart-card">
      {#if xpPts.length > 1}
        <svg viewBox="0 0 {W} {H}" width="100%" height={H} style="display:block; overflow:visible;">
          <defs>
            <linearGradient id="xpFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#5F33E1" stop-opacity="0.22" />
              <stop offset="100%" stop-color="#5F33E1" stop-opacity="0" />
            </linearGradient>
          </defs>
          {#each [0.25, 0.5, 0.75] as g (g)}
            <line
              x1={pad}
              x2={W - pad}
              y1={pad + g * (H - pad * 2)}
              y2={pad + g * (H - pad * 2)}
              stroke="#F0F0F4"
              stroke-width="1"
            />
          {/each}
          {#if xpAreaPath}
            <path d={xpAreaPath} fill="url(#xpFill)" />
          {/if}
          {#if xpLinePath}
            <path
              d={xpLinePath}
              fill="none"
              stroke="#5F33E1"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          {/if}
          {#each xpPts as pt, i (i)}
            <circle cx={pt[0]} cy={pt[1]} r="2" fill="#5F33E1" />
          {/each}
          {#if xpPts.length > 0}
            {@const last = xpPts[xpPts.length - 1]!}
            <circle cx={last[0]} cy={last[1]} r="7" fill="#5F33E1" opacity="0.18" />
            <circle cx={last[0]} cy={last[1]} r="4" fill="#5F33E1" stroke="#fff" stroke-width="2" />
          {/if}
          {#if xpBestIdx >= 0 && xpPts[xpBestIdx]}
            {@const best = xpPts[xpBestIdx]!}
            <line
              x1={best[0]}
              y1={best[1]}
              x2={best[0]}
              y2={H - pad}
              stroke="#5F33E1"
              stroke-width="1"
              stroke-dasharray="3 3"
              opacity="0.4"
            />
            <circle
              cx={best[0]}
              cy={best[1]}
              r="4.5"
              fill="#5F33E1"
              stroke="#fff"
              stroke-width="2"
            />
          {/if}
        </svg>
      {:else}
        <div class="xp-chart-empty">No XP data for selected range.</div>
      {/if}
      <div class="xp-chart-footer">
        <div class="xp-stat">
          <div class="xp-stat__val">{xpAvg} XP</div>
          <div class="xp-stat__key">Avg/day</div>
        </div>
        <div class="xp-stat">
          <div class="xp-stat__val">
            {xpValues.length ? Math.max(...xpValues) : 0} · {xpBestDay}
          </div>
          <div class="xp-stat__key">Best</div>
        </div>
        <div class="xp-stat">
          <div class="xp-stat__val">
            {xpValues.length ? Math.min(...xpValues) : 0} · {xpWorstDay}
          </div>
          <div class="xp-stat__key">Worst</div>
        </div>
      </div>
    </div>
  </div>

  <!-- 5. Radar (real data from /api/stats/distribution) -->
  <div class="section">
    <BracketTitle title="Stat Distribution" sub="Your character build · cumulative stat rewards" />
    <div class="radar-card">
      {#if radarEmpty}
        <div class="radar-empty-state">
          No stat rewards earned yet - keep completing quests to populate.
        </div>
      {/if}
      <svg viewBox="0 0 280 236" width="100%" height="200" style="display:block;">
        <!-- Grid rings -->
        {#each radarGridFracs as g (g)}
          <polygon points={radarPolyPoints(g)} fill="none" stroke="#EDEDF2" stroke-width="1" />
        {/each}
        <!-- Axis lines -->
        {#each radarLines as line, i (i)}
          <line
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="#EDEDF2"
            stroke-width="1"
          />
        {/each}
        <!-- Axis labels -->
        {#each RADAR_LABELS as label, i (label)}
          {@const lp = radarPt(i, 1.18)}
          <text
            x={lp.x}
            y={lp.y}
            text-anchor="middle"
            dominant-baseline="middle"
            font-family="JetBrains Mono, monospace"
            font-size="9"
            font-weight="600"
            fill="#9090A8">{label}</text
          >
        {/each}
        <!-- Data polygon -->
        <polygon
          points={radarDataPoints()}
          fill="rgba(95,51,225,0.18)"
          stroke="#5F33E1"
          stroke-width="2"
          stroke-linejoin="round"
          opacity={radarEmpty ? 0.25 : 1}
        />
        <!-- Data dots -->
        {#if !radarEmpty}
          {#each RADAR_LABELS as label, i (label)}
            {@const total =
              radarDistLookup.get(
                label as 'END' | 'STR' | 'FLEX' | 'INT' | 'WIS' | 'CAP' | 'CRAFT' | 'FOCUS',
              ) ?? 0}
            {@const frac = total / radarMax}
            {@const dp = radarPt(i, Math.max(0.03, frac))}
            {#if total > 0}
              <circle cx={dp.x} cy={dp.y} r="3.5" fill="#5F33E1" />
            {/if}
          {/each}
        {/if}
      </svg>
    </div>
  </div>

  <!-- 6. Achievements horizontal scroll -->
  <div class="section">
    <BracketTitle
      title="Recent Achievements"
      sub="Trophies & titles earned in the last {parseDays(range)} days"
    />
    <div class="achievements-scroll">
      {#each recentAchievements as a (a.id)}
        <div class="ach-card">
          <div class="ach-card__icon" style="background: {achievBg(a.pillar_id)};">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke={achievColor(a.pillar_id)}
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <!-- Trophy icon -->
              <path d="M8 21h8m-4-4v4M12 17c-5 0-7-3-7-7V4h14v6c0 4-2 7-7 7z" />
            </svg>
          </div>
          <div class="ach-card__name">{a.name}</div>
          <div class="ach-card__date">Earned {formatDate(a.unlocked_at)}</div>
          <a href="/system/progression" class="ach-card__link">View ceremony →</a>
        </div>
      {/each}
      <!-- View all card -->
      <a href="/system/progression" class="ach-card ach-card--more">
        <span class="ach-card__more-plus">+</span>
        <span class="ach-card__more-label">View all</span>
      </a>
    </div>
  </div>

  <!-- 7. Lifetime totals -->
  {#if statsAnalyticsState.lifetime}
    <LifetimeRow
      totalXp={statsAnalyticsState.lifetime.total_xp}
      totalQuests={statsAnalyticsState.lifetime.total_quests}
      activeDays={statsAnalyticsState.lifetime.active_days}
      hunterSince={statsAnalyticsState.lifetime.hunter_since}
    />
  {:else}
    <LifetimeRow totalXp={0} totalQuests={0} activeDays={0} hunterSince={null} />
  {/if}
</div>

<style>
  .stats-page {
    padding: 8px 18px 120px;
    max-width: 440px;
    margin: 0 auto;
  }

  .stats-header {
    padding: 4px 0 0;
    margin-bottom: 0;
  }

  .stats-header__title {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 700;
    font-size: 24px;
    line-height: 1.1;
    color: var(--color-text-primary);
    letter-spacing: -0.4px;
  }

  .stats-header__sub {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 400;
    font-size: 13px;
    line-height: 1.3;
    color: var(--color-text-secondary);
    margin-top: 3px;
  }

  .stats-header__range {
    margin-top: 14px;
    margin-bottom: 20px;
  }

  .section {
    margin-bottom: 30px;
  }

  /* ─── Heatmap ─── */
  .heatmap-wrap {
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }

  .heatmap-grid-area {
    flex-shrink: 0;
    overflow-x: auto;
  }

  .heatmap-grid {
    display: grid;
    grid-template-columns: repeat(13, 14px);
    grid-auto-rows: 14px;
    gap: 3px;
  }

  .heat-cell {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    cursor: default;
  }

  .heat-legend {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 12px;
  }

  .heat-legend__item {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .heat-legend__swatch {
    width: 11px;
    height: 11px;
    border-radius: 3px;
  }

  .heat-legend__label {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 400;
    font-size: 9px;
    color: var(--color-text-muted);
  }

  .heat-side {
    flex: 1;
    min-width: 0;
    padding-top: 2px;
  }

  .heat-side__streak {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .heat-side__flame {
    font-size: 18px;
    line-height: 1;
  }

  .heat-side__streak-num {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 600;
    font-size: 16px;
    line-height: 1.1;
    color: var(--color-text-primary);
  }

  .heat-side__sub {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 400;
    font-size: 11px;
    color: var(--color-text-muted);
    margin-top: 3px;
  }

  .heat-side__divider {
    height: 1px;
    background: var(--color-border-subtle);
    margin: 12px 0;
  }

  .heat-side__stat {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 500;
    font-size: 12px;
    line-height: 1.5;
    color: var(--color-text-secondary);
  }

  /* ─── XP Chart ─── */
  .xp-chart-card {
    background: var(--color-bg);
    border: 1px solid var(--color-border-subtle);
    border-radius: 16px;
    padding: 16px 14px 14px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  .xp-chart-empty {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 13px;
    color: var(--color-text-muted);
    padding: 24px 0;
    text-align: center;
  }

  .xp-chart-footer {
    display: flex;
    gap: 8px;
    margin-top: 14px;
    padding-top: 13px;
    border-top: 1px solid var(--color-border-subtle);
  }

  .xp-stat {
    flex: 1;
    text-align: center;
  }

  .xp-stat__val {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 600;
    font-size: 13px;
    line-height: 1;
    color: var(--color-text-primary);
  }

  .xp-stat__key {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 400;
    font-size: 10px;
    color: var(--color-text-muted);
    margin-top: 4px;
  }

  /* ─── Radar ─── */
  .radar-card {
    background: var(--color-bg);
    border: 1px solid var(--color-border-subtle);
    border-radius: 16px;
    padding: 16px 12px 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  .radar-empty-state {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 10px;
    color: var(--color-text-muted);
    background: var(--color-surface);
    border: 1px solid var(--color-border-subtle);
    border-radius: 6px;
    padding: 6px 8px;
    margin-bottom: 10px;
    letter-spacing: 0.02em;
  }

  /* ─── Achievements ─── */
  .achievements-scroll {
    display: flex;
    gap: 11px;
    overflow-x: auto;
    padding-bottom: 4px;
    margin: 0 -18px;
    padding: 0 18px 4px;
    scrollbar-width: none;
  }

  .achievements-scroll::-webkit-scrollbar {
    display: none;
  }

  .ach-card {
    width: 140px;
    flex-shrink: 0;
    background: var(--color-bg);
    border: 1px solid var(--color-border-subtle);
    border-radius: 16px;
    padding: 14px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    display: flex;
    flex-direction: column;
    gap: 0;
    text-decoration: none;
    color: inherit;
  }

  .ach-card__icon {
    height: 64px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
  }

  .ach-card__name {
    font-family: 'Cinzel', Georgia, serif;
    font-weight: 700;
    font-size: 14px;
    line-height: 1.15;
    color: var(--color-text-primary);
  }

  .ach-card__date {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 400;
    font-size: 10px;
    line-height: 1;
    color: var(--color-text-muted);
    margin-top: 7px;
  }

  .ach-card__link {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 500;
    font-size: 11px;
    color: var(--color-system);
    text-decoration: none;
    margin-top: 10px;
  }

  .ach-card--more {
    width: 110px;
    border: 1px dashed var(--color-border-subtle);
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--color-text-secondary);
  }

  .ach-card__more-plus {
    font-size: 20px;
    line-height: 1;
    color: var(--color-text-secondary);
  }

  .ach-card__more-label {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 500;
    font-size: 12px;
    line-height: 1;
    color: var(--color-text-secondary);
  }
</style>
