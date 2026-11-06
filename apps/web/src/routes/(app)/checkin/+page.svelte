<script lang="ts">
  import { goto } from '$app/navigation';
  import { checkinsState } from '$lib/state/checkins.svelte';
  import AppHeader from '$lib/components/design-system/AppHeader.svelte';

  let date = $state(new Date().toISOString().slice(0, 10));
  let energy = $state<number>(7);
  let mood = $state('');
  let notes = $state('');
  let submitting = $state(false);

  async function submit(e: Event) {
    e.preventDefault();
    submitting = true;
    const c = await checkinsState.create({
      date,
      energy_level: energy,
      mood: mood.trim() || null,
      notes: notes.trim() || null,
    });
    submitting = false;
    if (c) await goto('/');
  }
</script>

<div class="px-4 pt-4 pb-8 space-y-6 max-w-md mx-auto">
  <AppHeader title="Check-in" sub="Tonight's record" onBack={() => goto('/')} />

  <form class="space-y-5" onsubmit={submit}>
    <label class="block space-y-2">
      <span class="checkin-label">Date</span>
      <input
        type="date"
        bind:value={date}
        class="w-full bg-[color:var(--color-bg)] border border-[color:var(--color-border-subtle)] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[color:var(--color-system)] transition-colors text-[color:var(--color-text-primary)]"
      />
    </label>

    <label class="block space-y-2">
      <span class="checkin-label">Energy ({energy}/10)</span>
      <input
        type="range"
        min="1"
        max="10"
        step="1"
        bind:value={energy}
        class="w-full accent-[color:var(--color-system)]"
        style="height: 6px;"
      />
    </label>

    <label class="block space-y-2">
      <span class="checkin-label">Mood</span>
      <input
        type="text"
        maxlength="50"
        bind:value={mood}
        placeholder="focused, tired, scattered, …"
        class="w-full bg-[color:var(--color-bg)] border border-[color:var(--color-border-subtle)] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[color:var(--color-system)] transition-colors text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-muted)]"
      />
    </label>

    <label class="block space-y-2">
      <span class="checkin-label">Notes</span>
      <textarea
        bind:value={notes}
        rows="4"
        maxlength="2000"
        class="w-full bg-[color:var(--color-bg)] border border-[color:var(--color-border-subtle)] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[color:var(--color-system)] transition-colors text-[color:var(--color-text-primary)] resize-none"
      ></textarea>
    </label>

    {#if checkinsState.error}
      <p class="text-xs" style="color: var(--color-failure);">{checkinsState.error}</p>
    {/if}

    <button
      type="submit"
      disabled={submitting}
      class="w-full py-3 rounded-xl bg-[color:var(--color-system)] text-white text-xs tracking-[0.18em] uppercase font-medium transition-opacity disabled:opacity-50 hover:opacity-90"
    >
      {submitting ? 'Submitting…' : 'Record'}
    </button>
  </form>
</div>

<style>
  .checkin-label {
    display: block;
    font-family:
      'Inter',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 500;
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }
</style>
