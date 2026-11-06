<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { focusState } from '$lib/state/focus.svelte';
  import { PILLARS, type PillarId } from '$lib/constants/pillars';
  import type { FocusHorizon } from '$lib/api/types';
  import PillarIcon from '$lib/components/PillarIcon.svelte';
  import AppHeader from '$lib/components/design-system/AppHeader.svelte';

  onMount(() => focusState.load());

  const HORIZONS: { id: FocusHorizon; label: string; desc: string }[] = [
    { id: 'weekly', label: 'Weekly', desc: '7-day intensive focus' },
    { id: 'monthly', label: 'Monthly', desc: 'Sustained 30-day arc' },
    { id: 'sprint', label: 'Sprint', desc: 'Short bounded push (3-7 days)' },
  ];

  let selectedPillar: PillarId = $state('body');
  let selectedHorizon: FocusHorizon = $state('weekly');
  let submitting = $state(false);

  // Sync selection from server-loaded focus EXACTLY ONCE when it first arrives.
  // After that, the user's local selection wins (so picking a different option
  // doesn't get clobbered by a stale focusState.current reactive update).
  let syncedFromServer = false;
  $effect(() => {
    if (focusState.current && !syncedFromServer) {
      selectedPillar = focusState.current.pillarId;
      selectedHorizon = focusState.current.horizon;
      syncedFromServer = true;
    }
  });

  async function apply() {
    submitting = true;
    await focusState.set(selectedPillar, selectedHorizon);
    submitting = false;
  }

  function pillarVar(id: PillarId): string {
    return `var(--color-pillar-${id})`;
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
</script>

<div class="px-4 pt-4 pb-8 space-y-6 max-w-md mx-auto">
  <AppHeader title="Focus" sub="Active pillar selection" onBack={() => goto('/system/status')} />

  {#if focusState.loading}
    <p class="text-sm text-[color:var(--color-text-secondary)]">Loading…</p>
  {:else if focusState.current}
    {@const cur = focusState.current}
    <div
      class="px-4 py-4 border border-[color:var(--color-border-subtle)] space-y-2"
      style="background: color-mix(in oklab, {pillarVar(cur.pillarId)} 8%, transparent);"
    >
      <p class="system-tag text-[10px]" style="color: {pillarVar(cur.pillarId)};">
        [ CURRENT · {cur.horizon.toUpperCase()} ]
      </p>
      <p class="num text-2xl leading-none" style="color: {pillarVar(cur.pillarId)};">
        {PILLARS.find((p) => p.id === cur.pillarId)?.label}
      </p>
      <p class="num text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]">
        Since {formatDate(cur.startedAt)}
      </p>
    </div>
  {:else}
    <p class="text-sm text-[color:var(--color-text-secondary)]">
      No focus assigned. Pick a pillar below to set one.
    </p>
  {/if}

  <!-- Pillar selector: 2x2 grid of outline buttons that fill in the pillar's
       color when selected. No solid primary cliché. -->
  <div class="space-y-3">
    <p class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]">
      Pillar
    </p>
    <div class="grid grid-cols-2 gap-2">
      {#each PILLARS as p (p.id)}
        {@const active = selectedPillar === p.id}
        <button
          type="button"
          onclick={() => (selectedPillar = p.id)}
          class="py-3 border rounded-xl text-xs tracking-[0.18em] uppercase transition-colors flex items-center justify-center gap-2"
          style="
            border-color: {active ? pillarVar(p.id) : 'var(--color-border-subtle)'};
            color: {active ? pillarVar(p.id) : 'var(--color-text-secondary)'};
            background: {active ? `var(--color-pillar-${p.id}-bg)` : 'var(--color-bg)'};
          "
        >
          <PillarIcon pillarId={p.id} size={14} />
          {p.label}
        </button>
      {/each}
    </div>
  </div>

  <!-- Horizon selector: 3 stacked options with label + description. -->
  <div class="space-y-3">
    <p class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]">
      Horizon
    </p>
    <div class="space-y-2">
      {#each HORIZONS as h (h.id)}
        {@const active = selectedHorizon === h.id}
        <button
          type="button"
          onclick={() => (selectedHorizon = h.id)}
          class="w-full px-4 py-3 border rounded-xl text-left transition-colors"
          style="
            border-color: {active ? 'var(--color-system)' : 'var(--color-border-subtle)'};
            background: {active
            ? 'color-mix(in oklab, var(--color-system) 7%, transparent)'
            : 'var(--color-bg)'};
          "
        >
          <p
            class="text-xs tracking-[0.18em] uppercase"
            style="color: {active ? 'var(--color-system)' : 'var(--color-text-primary)'};"
          >
            {h.label}
          </p>
          <p class="text-xs text-[color:var(--color-text-secondary)] mt-0.5">
            {h.desc}
          </p>
        </button>
      {/each}
    </div>
  </div>

  {#if focusState.error}
    <p class="text-sm" style="color: var(--color-failure);">
      {focusState.error}
    </p>
  {/if}

  <button
    type="button"
    onclick={apply}
    disabled={submitting}
    class="w-full py-3 rounded-xl bg-[color:var(--color-system)] text-white text-xs tracking-[0.18em] uppercase font-medium transition-opacity disabled:opacity-50 hover:opacity-90"
  >
    {submitting ? 'Setting focus…' : 'Apply focus'}
  </button>
</div>
