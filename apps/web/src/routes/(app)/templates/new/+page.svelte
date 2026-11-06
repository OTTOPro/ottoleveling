<script lang="ts">
  import { goto } from '$app/navigation';
  import { templatesState } from '$lib/state/templates.svelte';
  import AppHeader from '$lib/components/design-system/AppHeader.svelte';
  import { PILLARS, type PillarId } from '$lib/constants/pillars';
  import type { QuestSchedule, Difficulty } from '$lib/api/types';

  let pillar_id: PillarId = $state('body');
  let title = $state('');
  let description = $state('');
  let base_metric = $state('');
  let starting_value: number = $state(1);
  let schedule: QuestSchedule = $state('daily');
  let base_xp: number = $state(30);
  let difficulty: Difficulty = $state('easy');
  let submitting = $state(false);

  // Auto-complete rule editor (collapsed by default).
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

  // 'custom' is intentionally OMITTED from this list. A custom schedule requires
  // a schedule_config (day-of-week selector etc.) which this form does
  // NOT collect - selecting 'custom' would create a template that silently
  // never fires. The edit page accepts custom in its dropdown for backwards
  // compatibility with already-seeded custom templates, but new templates can
  // only be 'daily', 'weekdays', or 'weekly' until the day-picker UI lands.
  const SCHEDULES: QuestSchedule[] = ['daily', 'weekdays', 'weekly'];
  const DIFFICULTIES: Difficulty[] = ['trivial', 'easy', 'medium', 'hard', 'epic'];

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
    const t = await templatesState.create({
      pillar_id,
      title,
      description: description || null,
      base_metric,
      starting_value,
      schedule,
      base_xp,
      difficulty,
      auto_complete_rule,
    });
    submitting = false;
    if (t) goto('/templates');
  }

  // HYBRIDE light-theme field base: full border, radius 12, white bg, focus border system-color
  const fieldBase =
    'w-full bg-[color:var(--color-bg)] border border-[color:var(--color-border-subtle)] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[color:var(--color-system)] transition-colors text-[color:var(--color-text-primary)]';
</script>

<div class="px-4 pt-4 pb-8 space-y-8 max-w-md mx-auto">
  <AppHeader
    title="New Template"
    sub="Recurring quest registration"
    onBack={() => goto('/templates')}
  />

  <form onsubmit={submit} class="space-y-7">
    <label class="block space-y-2">
      <span
        class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-secondary)] font-medium"
        >Pillar</span
      >
      <select bind:value={pillar_id} class={fieldBase}>
        {#each PILLARS as p (p.id)}
          <option value={p.id} class="bg-[color:var(--color-bg-elevated)]">{p.label}</option>
        {/each}
      </select>
    </label>

    <label class="block space-y-2">
      <span
        class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-secondary)] font-medium"
        >Title</span
      >
      <input
        type="text"
        bind:value={title}
        required
        maxlength="200"
        placeholder="What recurring action does this template assign?"
        class={fieldBase}
      />
    </label>

    <label class="block space-y-2">
      <span
        class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-secondary)] font-medium"
        >Description</span
      >
      <textarea
        bind:value={description}
        rows="2"
        maxlength="2000"
        placeholder="Optional. Conditions, constraints, expected rhythm."
        class="{fieldBase} resize-none"></textarea>
    </label>

    <div class="grid grid-cols-2 gap-6">
      <label class="block space-y-2">
        <span
          class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-secondary)] font-medium"
          >Metric</span
        >
        <input
          type="text"
          bind:value={base_metric}
          required
          maxlength="100"
          placeholder="e.g. reps, pages, minutes"
          class={fieldBase}
        />
      </label>
      <label class="block space-y-2">
        <span
          class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-secondary)] font-medium"
          >Starting value</span
        >
        <input
          type="number"
          bind:value={starting_value}
          step="any"
          required
          class="{fieldBase} num"
        />
      </label>
    </div>

    <div class="grid grid-cols-2 gap-6">
      <label class="block space-y-2">
        <span
          class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-secondary)] font-medium"
          >Schedule</span
        >
        <!-- TODO: enable 'custom' schedule UI with day-of-week selector -->
        <select bind:value={schedule} class={fieldBase}>
          {#each SCHEDULES as s (s)}
            <option value={s} class="bg-[color:var(--color-bg-elevated)]">{s}</option>
          {/each}
        </select>
      </label>
      <label class="block space-y-2">
        <span
          class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-secondary)] font-medium"
          >Difficulty</span
        >
        <select bind:value={difficulty} class={fieldBase}>
          {#each DIFFICULTIES as d (d)}
            <option value={d} class="bg-[color:var(--color-bg-elevated)]">{d}</option>
          {/each}
        </select>
      </label>
    </div>

    <label class="block space-y-2">
      <span
        class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-secondary)] font-medium"
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
              class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-secondary)] font-medium"
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
                class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-secondary)] font-medium"
                >Source</span
              >
              <select bind:value={ruleSource} class={fieldBase} disabled>
                <option value="google_health" class="bg-[color:var(--color-bg-elevated)]"
                  >google_health</option
                >
                <option value="spotify" class="bg-[color:var(--color-bg-elevated)]">spotify</option>
              </select>
            </label>
            <label class="block space-y-2">
              <span
                class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-secondary)] font-medium"
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
              class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-secondary)] font-medium"
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
        {submitting ? 'Registering…' : 'Register template'}
      </button>
      <a
        href="/templates"
        class="text-xs tracking-[0.18em] uppercase text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)] transition-colors"
      >
        Cancel
      </a>
    </div>
  </form>
</div>
