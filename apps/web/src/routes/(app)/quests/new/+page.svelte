<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { questsState } from '$lib/state/quests.svelte';
  import { objectivesState } from '$lib/state/objectives.svelte';
  import { PILLARS, type PillarId } from '$lib/constants/pillars';
  import type { Difficulty } from '$lib/api/types';
  import AppHeader from '$lib/components/design-system/AppHeader.svelte';

  let pillar_id: PillarId = $state('body');
  let title = $state('');
  let description = $state('');
  let difficulty: Difficulty = $state('medium');
  let xp_value = $state<number>(50);
  let objective_id: number | null = $state(null);
  let submitting = $state(false);

  onMount(() => objectivesState.load());

  const DIFFICULTIES: Difficulty[] = ['trivial', 'easy', 'medium', 'hard', 'epic'];

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    submitting = true;
    const q = await questsState.create({
      pillar_id,
      title,
      description: description || null,
      difficulty,
      xp_value,
      objective_id,
    });
    submitting = false;
    if (q) goto('/');
  }

  const fieldBase =
    'w-full bg-[color:var(--color-bg)] border border-[color:var(--color-border-subtle)] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[color:var(--color-system)] transition-colors text-[color:var(--color-text-primary)]';
</script>

<div class="px-4 pt-4 pb-8 space-y-8 max-w-md mx-auto">
  <AppHeader title="Manual Quest" sub="Assign a one-time quest" onBack={() => goto('/')} />

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
        placeholder="What action does this quest demand?"
        class={fieldBase}
      />
    </label>

    <label class="block space-y-2">
      <span class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]"
        >Description</span
      >
      <textarea
        bind:value={description}
        rows="2"
        maxlength="2000"
        placeholder="Optional. Conditions, constraints, context."
        class="{fieldBase} resize-none"></textarea>
    </label>

    <div class="grid grid-cols-2 gap-6">
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
      <label class="block space-y-2">
        <span class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]"
          >XP reward</span
        >
        <input
          type="number"
          bind:value={xp_value}
          min="0"
          max="1000"
          required
          class="{fieldBase} num"
        />
      </label>
    </div>

    <label class="block space-y-2">
      <span class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]"
        >Linked objective</span
      >
      <select bind:value={objective_id} class={fieldBase}>
        <option value={null} class="bg-[color:var(--color-bg-elevated)]">None</option>
        {#each objectivesState.objectives.filter((o) => o.pillar_id === pillar_id) as o (o.id)}
          <option value={o.id} class="bg-[color:var(--color-bg-elevated)]">{o.title}</option>
        {/each}
      </select>
    </label>

    {#if questsState.error}
      <p class="text-sm" style="color: var(--color-failure);">{questsState.error}</p>
    {/if}

    <div class="flex items-center gap-4 pt-2">
      <button
        type="submit"
        disabled={submitting}
        class="flex-1 py-3 rounded-xl bg-[color:var(--color-system)] text-white text-xs tracking-[0.18em] uppercase font-medium transition-opacity disabled:opacity-50 hover:opacity-90"
      >
        {submitting ? 'Assigning…' : 'Assign quest'}
      </button>
      <a
        href="/"
        class="text-xs tracking-[0.18em] uppercase text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)] transition-colors"
      >
        Cancel
      </a>
    </div>
  </form>
</div>
