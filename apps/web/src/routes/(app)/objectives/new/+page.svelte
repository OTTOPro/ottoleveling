<script lang="ts">
  import { goto } from '$app/navigation';
  import { objectivesState } from '$lib/state/objectives.svelte';
  import { PILLARS, type PillarId } from '$lib/constants/pillars';
  import AppHeader from '$lib/components/design-system/AppHeader.svelte';

  let pillar_id: PillarId = $state('body');
  let title = $state('');
  let description = $state('');
  let target_date = $state('');
  let target_metric = $state('');
  let target_value: number | null = $state(null);
  let submitting = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    submitting = true;
    const obj = await objectivesState.create({
      pillar_id,
      title,
      description: description || null,
      target_date,
      target_metric: target_metric || null,
      target_value,
    });
    submitting = false;
    if (obj) goto('/objectives');
  }

  // HYBRIDE light-theme field base: full border, radius 12, white bg
  const fieldBase =
    'w-full bg-[color:var(--color-bg)] border border-[color:var(--color-border-subtle)] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[color:var(--color-system)] transition-colors text-[color:var(--color-text-primary)]';
</script>

<div class="px-4 pt-4 pb-8 space-y-8 max-w-md mx-auto">
  <AppHeader title="New Goal" sub="Register an objective" onBack={() => goto('/objectives')} />

  <form onsubmit={submit} class="space-y-7">
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
      <input
        type="text"
        bind:value={title}
        required
        maxlength="200"
        placeholder="What outcome do you commit to?"
        class={fieldBase}
      />
    </label>

    <label class="block space-y-2">
      <span class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]"
        >Description</span
      >
      <textarea
        bind:value={description}
        rows="3"
        maxlength="2000"
        placeholder="Optional. Why this, why now."
        class="{fieldBase} resize-none"></textarea>
    </label>

    <label class="block space-y-2">
      <span class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]"
        >Target date</span
      >
      <input type="date" bind:value={target_date} required class="{fieldBase} num" />
    </label>

    <div class="grid grid-cols-2 gap-6">
      <label class="block space-y-2">
        <span class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]"
          >Metric</span
        >
        <input
          type="text"
          bind:value={target_metric}
          maxlength="100"
          placeholder="e.g. reps"
          class={fieldBase}
        />
      </label>
      <label class="block space-y-2">
        <span class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]"
          >Target value</span
        >
        <input
          type="number"
          bind:value={target_value}
          step="any"
          placeholder="-"
          class="{fieldBase} num"
        />
      </label>
    </div>

    {#if objectivesState.error}
      <p class="text-sm" style="color: var(--color-failure);">{objectivesState.error}</p>
    {/if}

    <div class="flex items-center gap-4 pt-2">
      <button
        type="submit"
        disabled={submitting}
        class="flex-1 py-3 rounded-xl bg-[color:var(--color-system)] text-white text-xs tracking-[0.18em] uppercase font-medium transition-opacity disabled:opacity-50 hover:opacity-90"
      >
        {submitting ? 'Registering…' : 'Register goal'}
      </button>
      <a
        href="/objectives"
        class="text-xs tracking-[0.18em] uppercase text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)] transition-colors"
      >
        Cancel
      </a>
    </div>
  </form>
</div>
