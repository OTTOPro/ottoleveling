<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import Markdown from '$lib/components/Markdown.svelte';
  import PillarBarChart from '$lib/components/PillarBarChart.svelte';
  import { bilansState } from '$lib/state/bilans.svelte';
  import type { PillarId, BilanPhysiologyState } from '$lib/api/types';
  import AppHeader from '$lib/components/design-system/AppHeader.svelte';

  const PILLARS: PillarId[] = ['body', 'mind', 'finance', 'projects'];

  onMount(() => {
    const id = Number(page.params.id);
    if (Number.isFinite(id)) bilansState.loadOne(id);
  });

  function xpChart() {
    if (!bilansState.current) return [];
    const stats = bilansState.current.stats;
    const byPillar = stats.by_pillar ?? stats.byPillar;
    if (!byPillar) return [];
    const max = Math.max(1, ...PILLARS.map((p) => byPillar[p]?.xp ?? 0));
    return PILLARS.map((p) => ({ pillarId: p, value: byPillar[p]?.xp ?? 0, max }));
  }

  function rateChart() {
    if (!bilansState.current) return [];
    const stats = bilansState.current.stats;
    const byPillar = stats.by_pillar ?? stats.byPillar;
    if (!byPillar) return [];
    return PILLARS.map((p) => ({
      pillarId: p,
      value: (byPillar[p]?.rate ?? 0) * 100,
      max: 100,
      suffix: '%',
    }));
  }

  function streakChart() {
    if (!bilansState.current) return [];
    const streaks = bilansState.current.stats.streaks;
    if (!streaks) return [];
    const max = Math.max(1, ...PILLARS.map((p) => streaks[p]?.longest_in_period ?? 0));
    return PILLARS.map((p) => ({ pillarId: p, value: streaks[p]?.longest_in_period ?? 0, max }));
  }

  const tagLabel = $derived(
    bilansState.current ? `${bilansState.current.period_type.toUpperCase()} BILAN` : 'BILAN',
  );

  /**
   * Returns the physiology state from the bilan stats if available and if
   * at least one field is non-null. Returns null to skip the row entirely.
   */
  function physiologyState(): BilanPhysiologyState | null {
    const phys = bilansState.current?.stats?.physiologyState;
    if (!phys) return null;
    const hasData =
      phys.hrv_period_avg != null ||
      phys.hrv_baseline_avg != null ||
      phys.hrv_delta_pct != null ||
      phys.sleep_period_avg_min != null ||
      phys.worst_sleep_night_min != null;
    return hasData ? phys : null;
  }

  function fmtMin(min: number): string {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return `${h}h ${m}m`;
  }
</script>

<div class="px-4 pt-4 pb-8 space-y-6 max-w-md mx-auto">
  <AppHeader
    title={tagLabel}
    sub={bilansState.current
      ? `${bilansState.current.period_start} → ${bilansState.current.period_end}`
      : 'Loading…'}
    onBack={() => goto('/bilans')}
  />

  {#if bilansState.loading && !bilansState.current}
    <p class="text-sm text-[color:var(--color-text-secondary)]">Loading…</p>
  {:else if bilansState.error}
    <p class="text-sm" style="color: var(--color-failure);">{bilansState.error}</p>
  {:else if bilansState.current}
    {@const b = bilansState.current}

    <section>
      <Markdown markdown={b.narrative} />
    </section>

    <!-- Physiology aggregate - skipped entirely when all fields null. -->
    {#if physiologyState() != null}
      {@const phys = physiologyState()!}
      <section class="border border-[color:var(--color-border-subtle)] px-3 py-2 space-y-2">
        <h2 class="system-tag text-[11px]">[ PHYSIOLOGY ]</h2>
        <dl class="divide-y divide-[color:var(--color-border-subtle)] text-sm">
          {#if phys.hrv_period_avg != null}
            <div class="grid grid-cols-[auto_1fr] gap-x-4 py-1.5 items-baseline">
              <dt
                class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]"
              >
                HRV avg
              </dt>
              <dd class="num text-[11px] text-right" style="color: var(--color-pillar-body);">
                {Math.round(phys.hrv_period_avg)} ms
                {#if phys.hrv_delta_pct != null}
                  <span
                    class="text-[10px]"
                    style="color: {phys.hrv_delta_pct < -0.1
                      ? 'var(--color-failure)'
                      : 'var(--color-text-muted)'};"
                  >
                    ({phys.hrv_delta_pct > 0 ? '+' : ''}{Math.round(phys.hrv_delta_pct * 100)}% vs
                    baseline)
                  </span>
                {/if}
              </dd>
            </div>
          {/if}
          {#if phys.sleep_period_avg_min != null}
            <div class="grid grid-cols-[auto_1fr] gap-x-4 py-1.5 items-baseline">
              <dt
                class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]"
              >
                Sleep avg
              </dt>
              <dd class="num text-[11px] text-right" style="color: var(--color-pillar-body);">
                {fmtMin(phys.sleep_period_avg_min)}
              </dd>
            </div>
          {/if}
          {#if phys.worst_sleep_night_min != null}
            <div class="grid grid-cols-[auto_1fr] gap-x-4 py-1.5 items-baseline">
              <dt
                class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]"
              >
                Worst night
              </dt>
              <dd
                class="num text-[11px] text-right"
                style="color: {phys.worst_sleep_night_min < 300
                  ? 'var(--color-failure)'
                  : phys.worst_sleep_night_min < 360
                    ? 'var(--color-pillar-body)'
                    : 'var(--color-text-muted)'};"
              >
                {fmtMin(phys.worst_sleep_night_min)}
              </dd>
            </div>
          {/if}
        </dl>
      </section>
    {/if}

    <section class="space-y-4 pt-2">
      <PillarBarChart data={xpChart()} label="XP PER PILLAR" />
      <PillarBarChart
        data={rateChart()}
        label="COMPLETION RATE"
        valueFormatter={(v) => v.toFixed(0)}
      />
      <PillarBarChart data={streakChart()} label="LONGEST STREAK IN PERIOD" />
    </section>

    {#if b.source && b.source === 'fallback'}
      <section
        class="px-3 py-2 border border-[color:var(--color-border-subtle)] text-xs"
        style="background: color-mix(in oklab, var(--color-failure) 6%, transparent); color: var(--color-failure);"
      >
        [ FALLBACK ] LLM analysis unavailable. Narrative synthesized from raw stats.
      </section>
    {/if}
  {/if}
</div>
