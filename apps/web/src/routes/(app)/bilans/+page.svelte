<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { bilansState } from '$lib/state/bilans.svelte';
  import type { BilanListItem, PeriodType } from '$lib/api/types';
  import AppHeader from '$lib/components/design-system/AppHeader.svelte';
  import { ChevronRight } from '@lucide/svelte';

  onMount(() => bilansState.load());

  function group(): Record<PeriodType, BilanListItem[]> {
    const out: Record<PeriodType, BilanListItem[]> = { weekly: [], monthly: [], yearly: [] };
    for (const b of bilansState.bilans) out[b.period_type].push(b);
    return out;
  }

  const LABEL: Record<PeriodType, string> = {
    weekly: 'WEEKLY',
    monthly: 'MONTHLY',
    yearly: 'YEARLY',
  };
</script>

<div class="px-4 pt-4 pb-8 space-y-6 max-w-md mx-auto">
  <AppHeader
    title="Reports"
    sub="Weekly · monthly · yearly bilans"
    onBack={() => goto('/system/admin')}
  />

  {#if bilansState.loading}
    <p class="text-sm text-[color:var(--color-text-secondary)]">Loading…</p>
  {:else if bilansState.error}
    <p class="text-sm" style="color: var(--color-failure);">{bilansState.error}</p>
  {:else if bilansState.bilans.length === 0}
    <p class="text-sm text-[color:var(--color-text-secondary)]">
      No bilans generated yet. First weekly bilan generates Sunday 20:00 UTC.
    </p>
  {:else}
    <div class="space-y-8">
      {#each ['weekly', 'monthly', 'yearly'] as const as periodType (periodType)}
        {@const list = group()[periodType]}
        {#if list.length > 0}
          <section class="space-y-3">
            <h2 class="system-tag text-[11px]">[ {LABEL[periodType]} · {list.length} ]</h2>
            <div class="bilan-card-list">
              {#each list as b (b.id)}
                <a href={`/bilans/${b.id}`} class="bilan-card">
                  <div class="bilan-card__content">
                    <p class="bilan-card__dates">
                      {b.period_start} → {b.period_end}
                    </p>
                    <p class="bilan-card__meta">
                      Generated {b.generated_at.slice(0, 10)}
                    </p>
                  </div>
                  <ChevronRight
                    size={18}
                    strokeWidth={1.5}
                    color="var(--color-text-muted)"
                    aria-hidden="true"
                  />
                </a>
              {/each}
            </div>
          </section>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .bilan-card-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 4px;
  }

  .bilan-card {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--color-bg);
    border: 1px solid var(--color-border-subtle);
    border-radius: 14px;
    padding: 14px 16px;
    text-decoration: none;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    transition: border-color 0.15s;
  }

  @media (hover: hover) {
    .bilan-card:hover {
      border-color: var(--color-system);
    }
  }

  .bilan-card__content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .bilan-card__dates {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary);
    font-variant-numeric: tabular-nums;
  }

  .bilan-card__meta {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 11px;
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
  }
</style>
