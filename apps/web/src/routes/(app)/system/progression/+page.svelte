<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { arcsState } from '$lib/state/arcs.svelte';
  import { achievementsState } from '$lib/state/achievements.svelte';
  import { statsState } from '$lib/state/stats.svelte';

  import AppHeader from '$lib/components/design-system/AppHeader.svelte';
  import SectionHead from '$lib/components/design-system/SectionHead.svelte';
  import PillarBadge from '$lib/components/design-system/PillarBadge.svelte';
  import ProgressBar from '$lib/components/design-system/ProgressBar.svelte';
  import { Trophy, ChevronRight } from '@lucide/svelte';

  onMount(async () => {
    await Promise.all([arcsState.load(), achievementsState.load(), statsState.load()]);
  });

  // Lifetime XP = sum of all pillar XP
  const lifetimeXp = $derived(statsState.pillars.reduce((s, p) => s + Math.max(0, p.xp), 0));

  // Format large numbers compactly
  function fmtXp(n: number): string {
    if (n >= 100_000) return `${(n / 1000).toFixed(0)}k`;
    if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
    return n.toLocaleString();
  }

  // Top 4 recent unlocked achievements for the horizontal scroll
  const recentTrophies = $derived(achievementsState.unlocked.slice(0, 4));
</script>

<div class="px-4 pt-4 pb-32 max-w-md mx-auto">
  <AppHeader title="Progression" sub="Trophies · arcs · lifetime" onBack={() => goto('/system')} />

  <!-- Lifetime XP hero card -->
  <div class="lifetime-hero">
    <Trophy size={40} strokeWidth={1.6} color="#F7D774" aria-hidden="true" />
    <span class="lifetime-hero__xp">{fmtXp(lifetimeXp)}</span>
    <span class="lifetime-hero__label"
      >LIFETIME XP · {achievementsState.unlockedCount} TROPHIES WON</span
    >
  </div>

  <!-- Active Arcs -->
  <SectionHead label="Active Arcs" />

  {#if arcsState.active.length === 0}
    <p class="empty-state">No active arcs.</p>
  {:else}
    <div class="arc-list">
      {#each arcsState.active as a (a.id)}
        <div class="arc-row">
          <PillarBadge pillar={a.pillar_id} size={40} />
          <div class="arc-row__content">
            <span class="arc-row__title">{a.title}</span>
            <span class="arc-row__sub"
              >Step {a.completed_steps}/{a.total_steps} · ends {a.expected_end?.slice(0, 10) ??
                '-'}</span
            >
            <ProgressBar
              value={a.total_steps > 0 ? a.completed_steps / a.total_steps : 0}
              color={`var(--color-pillar-${a.pillar_id})`}
              height={4}
            />
          </div>
          <ChevronRight
            size={18}
            strokeWidth={1.5}
            color="var(--color-text-muted)"
            aria-hidden="true"
          />
        </div>
      {/each}
    </div>
  {/if}

  <!-- Recent Trophies -->
  <SectionHead label="Recent Trophies" />

  {#if achievementsState.unlocked.length === 0}
    <p class="empty-state">No trophies awarded yet.</p>
  {:else}
    <div class="trophies-scroll">
      {#each recentTrophies as a (a.id)}
        <div class="trophy-card">
          <span class="trophy-card__date">
            {a.unlocked_at?.slice(0, 10) ?? '-'}
          </span>
          <span
            class="trophy-card__name"
            style={a.pillar_id
              ? `color: var(--color-pillar-${a.pillar_id});`
              : 'color: var(--color-system);'}>{a.name}</span
          >
          <span class="trophy-card__desc">{a.description}</span>
        </div>
      {/each}
      <!-- View all link -->
      <a href="/stats" class="trophy-card trophy-card--more">
        <span class="trophy-card__more-label">+ View all</span>
      </a>
    </div>
  {/if}
</div>

<style>
  .lifetime-hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 28px 20px 24px;
    margin-bottom: 24px;
    border-radius: 20px;
    background: linear-gradient(135deg, #4e27c4 0%, #2a1b4d 100%);
    text-align: center;
  }

  .lifetime-hero__xp {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 700;
    font-size: 36px;
    line-height: 1;
    color: #fff;
    font-variant-numeric: tabular-nums;
    margin-top: 4px;
  }

  .lifetime-hero__label {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.7);
  }

  .empty-state {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 14px;
    color: var(--color-text-secondary);
    padding: 12px 0 20px;
  }

  .arc-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 24px;
  }

  .arc-row {
    display: flex;
    align-items: center;
    gap: 14px;
    background: var(--color-bg);
    border: 1px solid var(--color-border-subtle);
    border-radius: 14px;
    padding: 14px 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  .arc-row__content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .arc-row__title {
    font-family: 'Cinzel', Georgia, serif;
    font-weight: 700;
    font-size: 14px;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .arc-row__sub {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 11px;
    color: var(--color-text-muted);
  }

  /* Horizontal trophies scroll */
  .trophies-scroll {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding-bottom: 8px;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
  }

  .trophies-scroll::-webkit-scrollbar {
    height: 4px;
  }

  .trophies-scroll::-webkit-scrollbar-track {
    background: var(--color-border-subtle);
    border-radius: 2px;
  }

  .trophies-scroll::-webkit-scrollbar-thumb {
    background: var(--color-text-muted);
    border-radius: 2px;
  }

  .trophy-card {
    flex-shrink: 0;
    width: 160px;
    scroll-snap-align: start;
    background: var(--color-bg);
    border: 1px solid var(--color-border-subtle);
    border-radius: 14px;
    padding: 14px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .trophy-card--more {
    align-items: center;
    justify-content: center;
    border-style: dashed;
    text-decoration: none;
    min-width: 100px;
  }

  .trophy-card__date {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 10px;
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .trophy-card__name {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 600;
    font-size: 13px;
    line-height: 1.2;
    overflow: hidden;
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .trophy-card__desc {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 11px;
    color: var(--color-text-secondary);
    line-height: 1.3;
    overflow: hidden;
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .trophy-card__more-label {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 11px;
    letter-spacing: 0.1em;
    color: var(--color-system);
    text-align: center;
  }
</style>
