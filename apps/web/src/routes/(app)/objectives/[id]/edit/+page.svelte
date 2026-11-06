<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { objectivesState } from '$lib/state/objectives.svelte';
  import { PILLARS } from '$lib/constants/pillars';
  import type { Objective, ObjectiveStatus, PillarId } from '$lib/api/types';
  import AppHeader from '$lib/components/design-system/AppHeader.svelte';

  const id = Number(page.params.id ?? '0');

  let loading = $state(true);
  let notFound = $state(false);
  let current: Objective | null = $state(null);

  // Form fields - initialized once `current` loads.
  let title = $state('');
  let description = $state('');
  let pillar_id: PillarId = $state('body');
  let target_date = $state('');
  let target_metric = $state('');
  let target_value: number | null = $state(null);
  let status: ObjectiveStatus = $state('active');
  let submitting = $state(false);

  const STATUSES: ObjectiveStatus[] = ['active', 'paused', 'completed', 'abandoned'];

  onMount(async () => {
    if (objectivesState.objectives.length === 0) {
      await objectivesState.load();
    }
    const o = objectivesState.objectives.find((x) => x.id === id) ?? null;
    if (!o) {
      notFound = true;
      loading = false;
      return;
    }
    current = o;
    // Populate form fields.
    title = o.title;
    description = o.description ?? '';
    pillar_id = o.pillar_id;
    target_date = o.target_date;
    target_metric = o.target_metric ?? '';
    target_value = o.target_value;
    status = o.status;
    loading = false;
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    submitting = true;
    const updated = await objectivesState.update(id, {
      title,
      description: description || null,
      pillar_id,
      target_date,
      target_metric: target_metric || null,
      target_value,
      status,
    });
    submitting = false;
    if (updated) goto('/objectives');
  }

  function pillarVar(p: PillarId): string {
    return `var(--color-pillar-${p})`;
  }

  const fieldBase =
    'w-full bg-[color:var(--color-bg)] border border-[color:var(--color-border-subtle)] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[color:var(--color-system)] transition-colors text-[color:var(--color-text-primary)]';
</script>

<div class="px-4 pt-4 pb-8 space-y-8 max-w-md mx-auto">
  <AppHeader title="Edit Goal" sub="Modify objective" onBack={() => goto(`/objectives/${id}`)} />
  {#if loading}
    <p class="text-sm text-[color:var(--color-text-secondary)]">Loading…</p>
  {:else if notFound}
    <p class="text-sm text-[color:var(--color-text-secondary)]">
      No objective with id {id}.
    </p>
  {:else if current}
    {@const o = current}
    <header class="space-y-0.5">
      <p class="system-tag text-[10px]" style="color: {pillarVar(o.pillar_id)};">
        [ {o.pillar_id.toUpperCase()} · EDIT ]
      </p>
      <p class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]">
        created {o.created_at.slice(0, 10)}
      </p>
    </header>

    <form onsubmit={submit} class="space-y-7">
      <!-- Status - free transitions (any status to any status) -->
      <label class="block space-y-2">
        <span class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]"
          >Status</span
        >
        <select bind:value={status} class={fieldBase}>
          {#each STATUSES as s (s)}
            <option value={s} class="bg-[color:var(--color-bg-elevated)]">{s}</option>
          {/each}
        </select>
      </label>

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
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
        <a
          href={`/objectives/${id}`}
          class="text-xs tracking-[0.18em] uppercase text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)] transition-colors"
        >
          Cancel
        </a>
      </div>
    </form>
  {/if}
</div>
