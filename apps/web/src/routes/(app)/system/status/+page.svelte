<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { statsState } from '$lib/state/stats.svelte';
  import { calibrationState } from '$lib/state/calibration.svelte';
  import { getSystemState } from '$lib/api/client';
  import type { SystemAgentSnapshot } from '$lib/api/types';

  import AppHeader from '$lib/components/design-system/AppHeader.svelte';
  import MetricRow from '$lib/components/design-system/MetricRow.svelte';
  import SectionHead from '$lib/components/design-system/SectionHead.svelte';
  import CalibrationCard from '$lib/components/CalibrationCard.svelte';

  let snapshot: SystemAgentSnapshot | null = $state(null);
  let loading = $state(true);

  onMount(async () => {
    loading = true;
    try {
      await Promise.all([statsState.load(), calibrationState.load()]);
      snapshot = await getSystemState();
    } catch (e) {
      console.warn('[/system/status] load error', e);
    } finally {
      loading = false;
    }
  });

  // Composite level = sum of pillar levels
  const compositeLevel = $derived(statsState.pillars.reduce((s, p) => s + p.level, 0));

  // Total XP across all pillars as a lifetime snapshot
  const totalXp = $derived(statsState.pillars.reduce((s, p) => s + Math.max(0, p.xp), 0));

  // DO state values - read imperatively after snapshot loads to avoid $derived type inference issues
  let bodyStreak = $state(0);
  let llmCallsToday = $state(0);

  $effect(() => {
    if (snapshot != null) {
      bodyStreak = snapshot.streaks['body']?.current ?? 0;
      llmCallsToday = snapshot.counters.llmCallsToday;
    }
  });
</script>

<div class="px-4 pt-4 pb-32 max-w-md mx-auto">
  <AppHeader title="Status" sub="Live hunter metrics" onBack={() => goto('/system')} />

  {#if loading}
    <p class="status-loading">Loading…</p>
  {:else}
    <!-- Metrics card -->
    <div class="metrics-card">
      <MetricRow icon="crown" pillar="mind" label="Hunter level" value={`LVL ${compositeLevel}`} />
      <MetricRow icon="flame" pillar="body" label="Body streak" value={`${bodyStreak} days`} />
      <MetricRow icon="zap" pillar="finance" label="Total XP" value={totalXp.toLocaleString()} />
      <MetricRow
        icon="target"
        pillar="projects"
        label="LLM calls today"
        value={String(llmCallsToday)}
      />
    </div>

    <!-- Calibration section -->
    <SectionHead label="Calibration" />
    <div class="calibration-wrap">
      <CalibrationCard signals={calibrationState.signals} />
    </div>
  {/if}
</div>

<style>
  .status-loading {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 14px;
    color: var(--color-text-secondary);
    padding: 16px 0;
  }

  .metrics-card {
    background: var(--color-bg);
    border: 1px solid var(--color-border-subtle);
    border-radius: 16px;
    padding: 4px 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    margin-bottom: 24px;
  }

  .calibration-wrap {
    background: var(--color-bg);
    border: 1px solid var(--color-border-subtle);
    border-radius: 16px;
    padding: 4px 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    margin-top: 8px;
  }
</style>
