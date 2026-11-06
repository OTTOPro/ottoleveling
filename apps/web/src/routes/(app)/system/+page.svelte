<script lang="ts">
  import { onMount } from 'svelte';
  import { statsState } from '$lib/state/stats.svelte';
  import { achievementsState } from '$lib/state/achievements.svelte';
  import { dataSourcesState } from '$lib/state/dataSources.svelte';
  import AppHeader from '$lib/components/design-system/AppHeader.svelte';
  import RankBadge from '$lib/components/design-system/RankBadge.svelte';
  import SectionHead from '$lib/components/design-system/SectionHead.svelte';
  import SectionCard from '$lib/components/design-system/SectionCard.svelte';
  import HunterStatusHero from '$lib/components/HunterStatusHero.svelte';

  // Rank progression helpers - compute next rank from current
  const RANK_ORDER: string[] = ['E', 'D', 'C', 'B', 'A', 'S'];

  function nextRank(rank: string): string {
    const idx = RANK_ORDER.indexOf(rank);
    if (idx === -1 || idx === RANK_ORDER.length - 1) return 'S';
    return RANK_ORDER[idx + 1]!;
  }

  // RANK_BRACKETS for per-pillar: E 0-2 / D 3-5 / C 6-9 / B 10-14 / A 15-20 / S 21+
  // COMPOSITE_BRACKETS: E 0-8 / D 9-20 / C 21-36 / B 37-56 / A 57-80 / S 81+
  const COMPOSITE_UPPER: Record<string, number> = { E: 8, D: 20, C: 36, B: 56, A: 80, S: 999 };
  const COMPOSITE_LOWER: Record<string, number> = { E: 0, D: 9, C: 21, B: 37, A: 57, S: 81 };

  function compositeRankProgress(rank: string, levelSum: number): number {
    if (rank === 'S') return 1;
    const lower = COMPOSITE_LOWER[rank] ?? 0;
    const upper = COMPOSITE_UPPER[rank] ?? 999;
    const span = upper - lower;
    if (span <= 0) return 1;
    return Math.min(1, Math.max(0, (levelSum - lower) / span));
  }

  // Total lifetime XP from pillar stats
  const totalXp = $derived(statsState.pillars.reduce((s, p) => s + Math.max(0, p.xp), 0));
  const levelSum = $derived(statsState.pillars.reduce((s, p) => s + p.level, 0));
  const currentRank = $derived(statsState.composite?.rank ?? 'E');
  const rankProgress = $derived(compositeRankProgress(currentRank, levelSum));
  const nextRankLabel = $derived(nextRank(currentRank));

  // Connected data sources count
  const connectedCount = $derived(
    dataSourcesState.dataSources.filter((d) => d.status === 'connected').length,
  );

  onMount(async () => {
    // Defensive cleanup: remove stale section-collapse localStorage keys
    try {
      for (const key of ['status', 'progression', 'sources', 'admin']) {
        localStorage.removeItem(`system_section_${key}_expanded_v2`);
      }
    } catch {
      // localStorage can be unavailable (private mode); stale keys are harmless if left
    }

    await Promise.all([statsState.load(), achievementsState.load(), dataSourcesState.load()]);
  });
</script>

<div class="px-4 pt-4 pb-32 max-w-md mx-auto">
  <AppHeader title="System" sub="Your hunter dashboard">
    {#snippet right()}
      {#if statsState.composite}
        <RankBadge rank={statsState.composite.rank} />
      {:else}
        <RankBadge rank="E" />
      {/if}
    {/snippet}
  </AppHeader>

  <!-- HunterStatusHero -->
  <HunterStatusHero
    title={statsState.composite?.title ?? 'Path-Walker'}
    rank={currentRank}
    nextRank={nextRankLabel}
    level={levelSum}
    {rankProgress}
    lifetimeXp={totalXp}
  />

  <!-- 4 SectionCards -->
  <SectionHead label="Sections" />

  <div class="section-list">
    <SectionCard
      pillar="body"
      icon="activity"
      title="STATUS"
      sub="Hunter level · focus · streak · today"
      badge={currentRank}
      href="/system/status"
    />
    <SectionCard
      pillar="mind"
      icon="trophy"
      title="PROGRESSION"
      sub="Trophies · arcs · lifetime"
      badge="{achievementsState.unlockedCount} won"
      href="/system/progression"
    />
    <SectionCard
      pillar="finance"
      icon="link"
      title="SOURCES"
      sub="Google Health · Spotify filters"
      badge="{connectedCount} live"
      href="/system/sources"
    />
    <SectionCard
      pillar="projects"
      icon="terminal"
      title="ADMIN"
      sub="Debug · alarms · raw state"
      badge="Dev"
      href="/system/admin"
    />
  </div>
</div>

<style>
  .section-list {
    display: flex;
    flex-direction: column;
    gap: 11px;
  }
</style>
