<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { templatesState } from '$lib/state/templates.svelte';
  import { PILLARS } from '$lib/constants/pillars';
  import type { QuestTemplate, QuestSchedule, Difficulty, PillarId } from '$lib/api/types';
  import AppHeader from '$lib/components/design-system/AppHeader.svelte';

  const id = Number(page.params.id ?? '0');

  let loading = $state(true);
  let notFound = $state(false);
  let current: QuestTemplate | null = $state(null);

  // Form fields - initialized once `current` loads.
  let title = $state('');
  let description = $state('');
  let pillar_id: PillarId = $state('body');
  let base_metric = $state('');
  let current_value: number = $state(0);
  let schedule: QuestSchedule = $state('daily');
  let base_xp: number = $state(30);
  let difficulty: Difficulty = $state('easy');
  let submitting = $state(false);

  // Auto-complete rule editor - INLINE-VISIBLE EXPANDED if template already has a rule
  // Otherwise collapsed by default.
  let showRuleEditor = $state(false);
  let ruleMetric = $state<string>('steps');
  let ruleSource = $state<'google_health' | 'spotify'>('google_health');
  let ruleComparison = $state<'>=' | '>'>('>=');
  let ruleThreshold = $state<number>(10000);

  // Metric → default source map (source auto-derives from metric).
  const METRIC_SOURCE_MAP: Record<string, 'google_health' | 'spotify'> = {
    steps: 'google_health',
    sleep_minutes: 'google_health',
    heart_rate_avg: 'google_health',
    resting_hr: 'google_health',
    hrv_rmssd: 'google_health',
    library_saves_episodes: 'spotify',
    library_saves_audiobooks: 'spotify',
    music_minutes: 'spotify',
  };
  const METRICS = Object.keys(METRIC_SOURCE_MAP);

  $effect(() => {
    const mapped = METRIC_SOURCE_MAP[ruleMetric];
    if (mapped) ruleSource = mapped;
  });

  // 'custom' included here (unlike the New page) for backward compatibility with
  // already-seeded custom templates.
  const SCHEDULES: QuestSchedule[] = ['daily', 'weekdays', 'weekly', 'custom'];
  const DIFFICULTIES: Difficulty[] = ['trivial', 'easy', 'medium', 'hard', 'epic'];

  onMount(async () => {
    if (templatesState.templates.length === 0) {
      await templatesState.load(false);
    }
    const t = templatesState.templates.find((x) => x.id === id) ?? null;
    if (!t) {
      notFound = true;
      loading = false;
      return;
    }
    current = t;
    // Populate form fields.
    title = t.title;
    description = t.description ?? '';
    pillar_id = t.pillar_id;
    base_metric = t.base_metric;
    current_value = t.current_value;
    schedule = t.schedule;
    base_xp = t.base_xp;
    difficulty = t.difficulty;
    // INLINE-VISIBLE EXPANDED: auto-open the rule editor if template already has a rule.
    if (t.auto_complete_rule) {
      showRuleEditor = true;
      ruleMetric = t.auto_complete_rule.metric;
      ruleSource = t.auto_complete_rule.source;
      ruleComparison = t.auto_complete_rule.comparison ?? '>=';
      ruleThreshold = t.auto_complete_rule.threshold;
    }
    loading = false;
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    submitting = true;
    const auto_complete_rule = showRuleEditor
      ? {
          type: 'metric_threshold' as const,
          metric: ruleMetric,
          source: ruleSource,
          threshold: ruleThreshold,
          comparison: ruleComparison,
        }
      : null;
    const t = await templatesState.update(id, {
      title,
      description: description || null,
      pillar_id,
      base_metric,
      current_value,
      schedule,
      base_xp,
      difficulty,
      auto_complete_rule,
    });
    submitting = false;
    if (t) goto('/templates');
  }

  function pillarVar(p: PillarId): string {
    return `var(--color-pillar-${p})`;
  }

  const fieldBase =
    'w-full bg-[color:var(--color-bg)] border border-[color:var(--color-border-subtle)] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[color:var(--color-system)] transition-colors text-[color:var(--color-text-primary)]';
</script>

<div class="px-4 pt-4 pb-8 space-y-8 max-w-md mx-auto">
  <AppHeader
    title="Edit Template"
    sub="Modify recurring quest"
    onBack={() => goto(`/templates/${id}`)}
  />
  {#if loading}
    <p class="text-sm text-[color:var(--color-text-secondary)]">Loading…</p>
  {:else if notFound}
    <p class="text-sm text-[color:var(--color-text-secondary)]">
      No template with id {id}.
    </p>
  {:else if current}
    {@const t = current}
    <header class="space-y-0.5">
      <p class="system-tag text-[10px]" style="color: {pillarVar(t.pillar_id)};">
        [ {t.pillar_id.toUpperCase()} · EDIT ]
      </p>
      <p class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]">
        starting {t.starting_value}
        {t.base_metric} · created {t.created_at.slice(0, 10)}
      </p>
    </header>

    <form onsubmit={submit} class="space-y-7">
      <!-- Pillar - editable -->
      <label class="block space-y-2">
        <span class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]"
          >Pillar</span
        >
        <select bind:value={pillar_id} class={fieldBase}>
          {#each PILLARS as p (p.id)}
            <option value={p.id} class="bg-[color:var(--color-bg-elevated)]">{p.label}</option>
          {/each}
        </select>
      </label>

      <label class="block space-y-2">
        <span class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]"
          >Title</span
        >
        <input type="text" bind:value={title} required maxlength="200" class={fieldBase} />
      </label>

      <label class="block space-y-2">
        <span class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]"
          >Description</span
        >
        <textarea bind:value={description} rows="2" maxlength="2000" class="{fieldBase} resize-none"
        ></textarea>
      </label>

      <!-- Metric - editable -->
      <label class="block space-y-2">
        <span class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]"
          >Metric</span
        >
        <input type="text" bind:value={base_metric} required maxlength="100" class={fieldBase} />
      </label>

      <!-- Starting value: READ-ONLY (the baseline never changes) -->
      <label class="block space-y-2">
        <span class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]"
          >Starting value (immutable)</span
        >
        <input
          type="number"
          value={t.starting_value}
          disabled
          class="{fieldBase} num opacity-50 cursor-not-allowed"
        />
      </label>

      <div class="grid grid-cols-2 gap-6">
        <label class="block space-y-2">
          <span class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]"
            >Current value</span
          >
          <input
            type="number"
            bind:value={current_value}
            step="any"
            required
            class="{fieldBase} num"
          />
        </label>
        <label class="block space-y-2">
          <span class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]"
            >Base XP</span
          >
          <input
            type="number"
            bind:value={base_xp}
            min="0"
            max="1000"
            required
            class="{fieldBase} num"
          />
        </label>
      </div>

      <div class="grid grid-cols-2 gap-6">
        <label class="block space-y-2">
          <span class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]"
            >Schedule</span
          >
          <select bind:value={schedule} class={fieldBase}>
            {#each SCHEDULES as s (s)}
              <option value={s} class="bg-[color:var(--color-bg-elevated)]">{s}</option>
            {/each}
          </select>
        </label>
        <label class="block space-y-2">
          <span class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]"
            >Difficulty</span
          >
          <select bind:value={difficulty} class={fieldBase}>
            {#each DIFFICULTIES as d (d)}
              <option value={d} class="bg-[color:var(--color-bg-elevated)]">{d}</option>
            {/each}
          </select>
        </label>
      </div>

      <!-- Auto-complete rule editor - INLINE-VISIBLE EXPANDED if rule exists -->
      <div class="space-y-3 border-t border-[color:var(--color-border-emphasis)] pt-6">
        <button
          type="button"
          onclick={() => (showRuleEditor = !showRuleEditor)}
          class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-system)] transition-colors"
        >
          {showRuleEditor ? '[ − AUTO-COMPLETE RULE ]' : '[ + AUTO-COMPLETE RULE ]'}
        </button>
        {#if showRuleEditor}
          <div class="space-y-5 pt-2">
            <label class="block space-y-2">
              <span
                class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]"
                >Metric</span
              >
              <select bind:value={ruleMetric} class={fieldBase}>
                {#each METRICS as m (m)}
                  <option value={m} class="bg-[color:var(--color-bg-elevated)]">{m}</option>
                {/each}
              </select>
            </label>
            <div class="grid grid-cols-2 gap-6">
              <label class="block space-y-2">
                <span
                  class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]"
                  >Source</span
                >
                <select bind:value={ruleSource} class={fieldBase} disabled>
                  <option value="google_health" class="bg-[color:var(--color-bg-elevated)]"
                    >google_health</option
                  >
                  <option value="spotify" class="bg-[color:var(--color-bg-elevated)]"
                    >spotify</option
                  >
                </select>
              </label>
              <label class="block space-y-2">
                <span
                  class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]"
                  >Compare</span
                >
                <select bind:value={ruleComparison} class={fieldBase}>
                  <option value=">=" class="bg-[color:var(--color-bg-elevated)]">&gt;=</option>
                  <option value=">" class="bg-[color:var(--color-bg-elevated)]">&gt;</option>
                </select>
              </label>
            </div>
            <label class="block space-y-2">
              <span
                class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]"
                >Threshold</span
              >
              <input
                type="number"
                bind:value={ruleThreshold}
                step="any"
                required
                class="{fieldBase} num"
              />
            </label>
            {#if ruleSource === 'spotify' && (ruleMetric === 'library_saves_episodes' || ruleMetric === 'library_saves_audiobooks')}
              <p class="text-[10px] text-[color:var(--color-text-muted)] leading-relaxed">
                Note: Spotify library saves are engagement INTENT, not listening time. Saving an
                episode counts as soft mind-pillar engagement; saves ≠ listened.
              </p>
            {/if}
          </div>
        {/if}
      </div>

      {#if templatesState.error}
        <p class="text-sm" style="color: var(--color-failure);">{templatesState.error}</p>
      {/if}

      <div class="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={submitting}
          class="flex-1 py-3 rounded-xl bg-[color:var(--color-system)] text-white text-xs tracking-[0.18em] uppercase font-medium transition-opacity disabled:opacity-50 hover:opacity-90"
        >
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
        <a
          href={`/templates/${id}`}
          class="text-xs tracking-[0.18em] uppercase text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)] transition-colors"
        >
          Cancel
        </a>
      </div>
    </form>
  {/if}
</div>
