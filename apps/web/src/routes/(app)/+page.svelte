<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { questsState } from '$lib/state/quests.svelte';
  import { bilansState } from '$lib/state/bilans.svelte';
  import { templatesState } from '$lib/state/templates.svelte';
  import { statsState } from '$lib/state/stats.svelte';
  import { autoCompletionsState } from '$lib/state/autoCompletions.svelte';
  import { arcsState } from '$lib/state/arcs.svelte';
  import { projectsState } from '$lib/state/projects.svelte';
  import { getSystemState } from '$lib/api/client';
  import type { RecentUnlock } from '$lib/api/types';
  import { Flame, Target, Zap } from '@lucide/svelte';

  import Avatar from '$lib/components/design-system/Avatar.svelte';
  import RankBadge from '$lib/components/design-system/RankBadge.svelte';
  import SectionHead from '$lib/components/design-system/SectionHead.svelte';

  import AchievementUnlockBanner from '$lib/components/AchievementUnlockBanner.svelte';
  import AutoCompleteNotificationBanner from '$lib/components/AutoCompleteNotificationBanner.svelte';
  import HeroCard from '$lib/components/HeroCard.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import QuestCard from '$lib/components/QuestCard.svelte';
  import QuestCardSkeleton from '$lib/components/QuestCardSkeleton.svelte';
  import SystemNotice from '$lib/components/SystemNotice.svelte';
  import type { NoticeData } from '$lib/components/SystemNotice.svelte';
  import { ceremonyState } from '$lib/state/ceremony.svelte';

  import { motionPreferences } from '$lib/state/motion-preferences.svelte';
  import { ENABLE_QUEST_STAGGER } from '$lib/config/motion';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  import { PLAYER_NAME } from '$lib/config/env';

  // ─── Greeting ───────────────────────────────────────────────────────────────
  function greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  // ─── Stagger ────────────────────────────────────────────────────────────────
  const staggerDuration = $derived(motionPreferences.reduced || !ENABLE_QUEST_STAGGER ? 0 : 350);
  const staggerStep = $derived(motionPreferences.reduced || !ENABLE_QUEST_STAGGER ? 0 : 50);

  // ─── Achievement banners ─────────────────────────────────────────────────────
  const ACK_KEY = 'acknowledged_achievement_ids';
  let recentUnlocks = $state<RecentUnlock[]>([]);
  let acknowledgedIds = $state<Set<string>>(new Set());

  const visibleUnlock = $derived(recentUnlocks.find((u) => !acknowledgedIds.has(u.id)) ?? null);

  function acknowledge(id: string) {
    acknowledgedIds = new Set([...acknowledgedIds, id]);
    try {
      localStorage.setItem(ACK_KEY, JSON.stringify([...acknowledgedIds]));
    } catch {
      // localStorage can be unavailable (private mode, quota); the in-memory set still hides the banner
    }
  }

  // ─── Bilan banner ────────────────────────────────────────────────────────────
  let bannerBilanId = $state<number | null>(null);
  let bannerLabel = $state('');

  $effect(() => {
    void (async () => {
      await bilansState.load();
      if (bilansState.bilans.length === 0) return;
      const latest = bilansState.bilans[0]!;
      const dismissedKey = `bilan-banner-dismissed:${latest.id}`;
      if (typeof localStorage !== 'undefined' && localStorage.getItem(dismissedKey) === '1') return;
      bannerBilanId = latest.id;
      bannerLabel = `${latest.period_type.toUpperCase()} ${latest.period_start} → ${latest.period_end}`;
    })();
  });

  function dismissBanner(): void {
    if (bannerBilanId != null && typeof localStorage !== 'undefined') {
      localStorage.setItem(`bilan-banner-dismissed:${bannerBilanId}`, '1');
    }
    bannerBilanId = null;
  }

  // ─── Today completion percent ─────────────────────────────────────────────────
  const completionPct = $derived(() => {
    const total = questsState.quests.length;
    if (total === 0) return 0;
    const done = questsState.completions.size;
    return done / total;
  });

  // ─── SystemNotice toast (quest completion dark glass) ─────────────────────────
  let currentNotice = $state<NoticeData | null>(null);
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;

  function showNotice(notice: NoticeData) {
    currentNotice = notice;
    if (noticeTimer != null) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      currentNotice = null;
      noticeTimer = null;
    }, 3200);
  }

  // ─── Stat cards data ──────────────────────────────────────────────────────────
  // body streak - from statsState snapshot (streaks are in the DO state, loaded separately)
  // We'll pull from questsState completions for XP today as a best-effort fallback
  let bodyStreak = $state(0);
  let xpToday = $state(0);

  // ─── Generation pending polling ─────────────────────────
  // When the queue consumer is processing a generate_daily message, /api/quests/today
  // returns generation_status='pending'. Poll every 3s for up to 60s until it
  // becomes 'ready'. Falls back to a "Tap to retry" button after timeout.
  let pollHandle: ReturnType<typeof setTimeout> | null = null;

  function startGenerationPolling() {
    let attempts = 0;
    const maxAttempts = 20; // 20 × 3s = 60s timeout

    const poll = async () => {
      attempts++;
      await questsState.loadToday();
      if (questsState.generationStatus === 'ready' || questsState.quests.length > 0) {
        pollHandle = null;
        return;
      }
      if (questsState.generationStatus === 'failed' || attempts >= maxAttempts) {
        questsState.generationStatus = 'failed';
        pollHandle = null;
        return;
      }
      pollHandle = setTimeout(poll, 3000);
    };

    pollHandle = setTimeout(poll, 3000);
  }

  // ─── Mount ───────────────────────────────────────────────────────────────────
  onMount(async () => {
    questsState.loadToday();
    statsState.load();

    try {
      const raw = localStorage.getItem(ACK_KEY);
      if (raw) acknowledgedIds = new Set(JSON.parse(raw) as string[]);
    } catch {
      // localStorage unavailable or holding invalid JSON; start with no acknowledged unlocks
    }

    try {
      const snap = await getSystemState();
      recentUnlocks = snap.recentUnlocks ?? [];
      autoCompletionsState.setItems(snap.recentAutoCompletions ?? []);
      // Extract body streak from DO state
      bodyStreak = snap.streaks?.body?.current ?? 0;
    } catch {
      // Banners and streak stat are optional extras; the page renders with their defaults
    }

    // Arc badges, auto-complete badges and the projects chip are optional extras;
    // a failed load leaves them hidden without blocking the quest list.
    try {
      await arcsState.load();
    } catch {
      /* optional, see above */
    }
    try {
      await templatesState.load();
    } catch {
      /* optional, see above */
    }
    try {
      await projectsState.load();
    } catch {
      /* optional, see above */
    }
  });

  // Compute today XP from completions reactively
  $effect(() => {
    let sum = 0;
    for (const c of questsState.completions.values()) {
      if (c.status === 'completed') sum += c.xp_awarded;
    }
    xpToday = sum;
  });

  // Start polling when generation goes pending
  $effect(() => {
    if (
      questsState.generationStatus === 'pending' &&
      pollHandle === null &&
      questsState.quests.length === 0
    ) {
      startGenerationPolling();
    }
  });

  onDestroy(() => {
    if (pollHandle !== null) {
      clearTimeout(pollHandle);
      pollHandle = null;
    }
  });

  // ─── Quest sort: active first, done at end ────────────────────────────────────
  const sortedQuests = $derived(() => {
    const active = questsState.quests.filter((q) => !questsState.completions.has(q.id));
    const done = questsState.quests.filter((q) => questsState.completions.has(q.id));
    return [...active, ...done];
  });

  const doneCount = $derived(questsState.completions.size);
  const totalCount = $derived(questsState.quests.length);

  async function handleComplete(id: number) {
    // Find the quest before completing so we have its data for the notice
    const quest = questsState.quests.find((q) => q.id === id);
    await questsState.complete(id);

    // Show SystemNotice toast with quest data
    if (quest) {
      const completion = questsState.completions.get(id);
      showNotice({
        pillar: quest.pillar_id,
        title: quest.title,
        reward: completion?.xp_awarded ?? quest.xp_value,
      });
    }

    // Ceremony: if all quests are now completed, fire the overlay after 700ms
    const remaining = questsState.quests.filter((q) => !questsState.completions.has(q.id)).length;
    if (remaining === 0 && questsState.quests.length > 0) {
      setTimeout(() => {
        ceremonyState.show({
          kicker: '[ DAILY ASCENSION COMPLETE ]',
          title: 'All quests cleared',
          body: 'The System recognizes your discipline. +1 rank progress.',
        });
      }, 700);
    }
  }
</script>

<div class="px-4 pt-4 pb-32 max-w-md mx-auto" style="position: relative;">
  <!-- SystemNotice toast: dark glass, absolute positioned, z-70 -->
  <SystemNotice notice={currentNotice} />

  <!-- Banners always above hero -->
  {#if visibleUnlock}
    <AchievementUnlockBanner unlock={visibleUnlock} onAcknowledge={acknowledge} />
  {/if}
  <AutoCompleteNotificationBanner />

  <!-- AppHeader: Avatar + greeting/name left, chips + RankBadge right -->
  <header class="today-header">
    <div class="today-header__left">
      <Avatar letter={PLAYER_NAME} size={46} />
      <div class="today-header__text">
        <div class="today-header__greeting">{greeting()},</div>
        <div class="today-header__name">{PLAYER_NAME}</div>
      </div>
    </div>
    <div class="today-header__right">
      {#if projectsState.activeCount > 0}
        <a href="/projects" class="projects-chip" aria-label="Active projects">
          [ PROJECTS · {projectsState.activeCount} ]
        </a>
      {/if}
      {#if statsState.composite}
        <RankBadge rank={statsState.composite.rank} />
      {:else}
        <RankBadge rank="E" />
      {/if}
    </div>
  </header>

  <!-- Bilan banner -->
  {#if bannerBilanId != null}
    <div class="bilan-banner">
      <a href={`/bilans/${bannerBilanId}`} class="bilan-banner__link">
        <span class="bilan-banner__tag">[ NEW BILAN AVAILABLE ]</span>
        <span class="bilan-banner__label">{bannerLabel}</span>
      </a>
      <button
        type="button"
        onclick={dismissBanner}
        class="bilan-banner__dismiss"
        aria-label="Dismiss">×</button
      >
    </div>
  {/if}

  <!-- HeroCard -->
  <HeroCard
    title={statsState.composite?.title ?? 'Path-Walker'}
    rank={statsState.composite?.rank ?? 'E'}
    level={statsState.pillars.reduce((s, p) => s + p.level, 0)}
    progressValue={completionPct()}
  />

  <!-- 3 StatCards -->
  <div class="stat-cards">
    <StatCard pillar="body" icon={Flame} value={bodyStreak} unit="d" label="Streak" />
    <StatCard pillar="mind" icon={Target} value={0} unit="min" label="Focus" />
    <StatCard pillar="finance" icon={Zap} value={xpToday} unit="xp" label="Today" />
  </div>

  <!-- Quest section -->
  <SectionHead label="Active Quests">
    {#snippet action()}
      <span class="quest-counter">{doneCount}/{totalCount}</span>
    {/snippet}
  </SectionHead>

  {#if questsState.loading && questsState.quests.length === 0}
    <!-- Initial fetch or post-regen clear: show 4 skeleton cards while loading -->
    <div class="quest-list" aria-label="Quests loading">
      {#each [0, 1, 2, 3] as i (i)}
        <QuestCardSkeleton />
      {/each}
    </div>
  {:else if questsState.quests.length === 0 && questsState.generationStatus === 'pending'}
    <!-- Async generation in progress: show 4 skeleton cards -->
    <div class="quest-list" aria-label="Quests loading">
      {#each [0, 1, 2, 3] as i (i)}
        <QuestCardSkeleton />
      {/each}
    </div>
    <p class="generation-pending-label">[ SYSTEM GENERATING QUESTS ]</p>
  {:else if questsState.quests.length === 0 && questsState.generationStatus === 'failed'}
    <p class="empty-state">
      Generation failed. <button
        class="retry-btn"
        type="button"
        onclick={() => questsState.loadToday()}>Tap to retry</button
      >
    </p>
  {:else if questsState.quests.length === 0}
    <p class="empty-state">No quests assigned. Trigger generation from System, then Admin.</p>
  {:else}
    <div class="quest-list">
      {#each sortedQuests() as q, i (q.id)}
        <div
          in:fly={{ x: 16, duration: staggerDuration, delay: i * staggerStep, easing: cubicOut }}
        >
          <QuestCard
            quest={q}
            completion={questsState.completions.get(q.id)}
            onComplete={handleComplete}
          />
        </div>
      {/each}
    </div>
  {/if}

  <!-- Check-in CTA -->
  <div class="checkin-cta">
    <a href="/checkin" class="checkin-cta__btn"> → Record tonight's check-in </a>
  </div>
</div>

<style>
  .today-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 13px;
    padding: 4px 0 20px;
  }

  .today-header__left {
    display: flex;
    align-items: center;
    gap: 13px;
    flex: 1;
    min-width: 0;
  }

  .today-header__text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .today-header__greeting {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 500;
    font-size: 13px;
    line-height: 1;
    color: var(--color-text-secondary);
  }

  .today-header__name {
    font-family: 'Cinzel', Georgia, serif;
    font-weight: 700;
    font-size: 19px;
    line-height: 1.15;
    color: var(--color-text-primary);
    letter-spacing: 0.2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .today-header__right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .projects-chip {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-pillar-projects);
    background: var(--color-pillar-projects-bg);
    border: 1px solid var(--color-pillar-projects);
    border-radius: 6px;
    padding: 4px 7px;
    text-decoration: none;
    white-space: nowrap;
    line-height: 1;
    transition: opacity 0.15s;
  }

  .projects-chip:hover {
    opacity: 0.8;
  }

  .bilan-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    margin-bottom: 16px;
    border: 2px solid var(--color-system);
    border-radius: 12px;
    background: color-mix(in oklab, var(--color-system) 9%, transparent);
  }

  .bilan-banner__link {
    flex: 1;
    text-decoration: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .bilan-banner__tag {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 600;
    font-size: 10px;
    color: var(--color-system);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .bilan-banner__label {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 10px;
    color: var(--color-text-muted);
  }

  .bilan-banner__dismiss {
    font-size: 20px;
    line-height: 1;
    color: var(--color-text-muted);
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 6px;
  }

  .stat-cards {
    display: flex;
    gap: 10px;
    margin-bottom: 24px;
  }

  .quest-counter {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 600;
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .quest-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 12px;
  }

  .empty-state {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 14px;
    color: var(--color-text-secondary);
    padding: 16px 0;
  }

  .generation-pending-label {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 10px;
    letter-spacing: 0.15em;
    color: var(--color-text-muted);
    text-align: center;
    padding: 8px 0 4px;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.5;
    }
    50% {
      opacity: 1;
    }
  }

  .retry-btn {
    background: none;
    border: none;
    color: var(--color-system);
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 14px;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
  }

  .checkin-cta {
    margin-top: 32px;
    padding-top: 24px;
    border-top: 1px solid var(--color-border-emphasis);
  }

  .checkin-cta__btn {
    display: block;
    text-align: center;
    padding: 12px;
    border: 1px solid var(--color-system);
    color: var(--color-system);
    text-decoration: none;
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 12px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    transition:
      background 0.15s,
      color 0.15s;
  }

  .checkin-cta__btn:hover {
    background: var(--color-system);
    color: var(--color-bg);
  }
</style>
