<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { Pencil } from '@lucide/svelte';
  import { objectivesState } from '$lib/state/objectives.svelte';
  import type { Objective } from '$lib/api/types';
  import AppHeader from '$lib/components/design-system/AppHeader.svelte';

  const id = Number(page.params.id ?? '0');

  let loading = $state(true);
  let notFound = $state(false);
  let current: Objective | null = $state(null);

  onMount(async () => {
    if (objectivesState.objectives.length === 0 && objectivesState.trash.length === 0) {
      await objectivesState.load();
    }
    const o = objectivesState.byId(id) ?? null;
    if (!o) {
      notFound = true;
      loading = false;
      return;
    }
    current = o;
    loading = false;
  });

  function pillarVar(pillar_id: string): string {
    return `var(--color-pillar-${pillar_id})`;
  }

  function formatDate(iso: string): string {
    const d = new Date(iso + 'T00:00:00Z');
    if (Number.isNaN(d.getTime())) return iso;
    const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const day = d.getUTCDate();
    const year = d.getUTCFullYear();
    const sameYear = year === new Date().getUTCFullYear();
    return sameYear ? `${month} ${day}` : `${month} ${day}, ${year}`;
  }

  function statusLabel(status: string): string {
    switch (status) {
      case 'active':
        return '[ ACTIF ]';
      case 'paused':
        return '[ PAUSE ]';
      case 'completed':
        return '[ COMPLÉTÉ ]';
      case 'abandoned':
        return '[ ABANDONNÉ ]';
      default:
        return `[ ${status.toUpperCase()} ]`;
    }
  }

  function statusColor(status: string): string {
    switch (status) {
      case 'active':
        return 'var(--color-pillar-mind)';
      case 'paused':
        return '#d4a017';
      default:
        return 'var(--color-text-muted)';
    }
  }
</script>

<div class="px-4 pt-4 pb-8 space-y-6 max-w-md mx-auto">
  <AppHeader title="Objective" sub="Goal detail" onBack={() => goto('/objectives')}>
    {#snippet right()}
      {#if current}
        <a
          href={`/objectives/${current.id}/edit`}
          class="inline-flex items-center gap-1.5 text-xs text-[color:var(--color-system)] hover:text-[color:var(--color-text-primary)] transition-colors"
        >
          <Pencil size={14} strokeWidth={1.5} />
          <span class="tracking-wider uppercase">Edit</span>
        </a>
      {/if}
    {/snippet}
  </AppHeader>
  {#if loading}
    <p class="text-sm text-[color:var(--color-text-secondary)]">Loading…</p>
  {:else if notFound}
    <p class="text-sm text-[color:var(--color-text-secondary)]">
      No objective with id {id}.
    </p>
  {:else if current}
    {@const o = current}
    <header class="space-y-1">
      <p class="system-tag text-[10px]" style="color: {pillarVar(o.pillar_id)};">
        [ OBJECTIVE · {o.pillar_id.toUpperCase()} ]
      </p>
      <h1 class="text-xl font-bold text-[color:var(--color-text-primary)]">{o.title}</h1>
      <p
        class="text-[10px] tracking-[0.18em] uppercase pt-0.5"
        style="color: {statusColor(o.status)};"
      >
        {statusLabel(o.status)}
      </p>
    </header>

    <dl class="space-y-4">
      {#if o.description}
        <div>
          <dt
            class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)] mb-1"
          >
            Description
          </dt>
          <dd class="text-sm text-[color:var(--color-text-secondary)] leading-relaxed">
            {o.description}
          </dd>
        </div>
      {/if}

      <div class="grid grid-cols-2 gap-4">
        <div>
          <dt
            class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)] mb-1"
          >
            Target date
          </dt>
          <dd class="num text-sm text-[color:var(--color-text-primary)]">
            {formatDate(o.target_date)}
          </dd>
        </div>
        <div>
          <dt
            class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)] mb-1"
          >
            Registered
          </dt>
          <dd class="num text-sm text-[color:var(--color-text-muted)]">
            {o.created_at.slice(0, 10)}
          </dd>
        </div>
      </div>

      {#if o.target_metric || o.target_value != null}
        <div class="grid grid-cols-2 gap-4">
          {#if o.target_metric}
            <div>
              <dt
                class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)] mb-1"
              >
                Metric
              </dt>
              <dd class="num text-sm text-[color:var(--color-text-primary)]">{o.target_metric}</dd>
            </div>
          {/if}
          {#if o.target_value != null}
            <div>
              <dt
                class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)] mb-1"
              >
                Target value
              </dt>
              <dd class="num text-sm text-[color:var(--color-text-primary)]">{o.target_value}</dd>
            </div>
          {/if}
        </div>
      {/if}

      {#if o.current_value != null}
        <div>
          <dt
            class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)] mb-1"
          >
            Current value
          </dt>
          <dd class="num text-sm text-[color:var(--color-text-primary)]">{o.current_value}</dd>
        </div>
      {/if}

      {#if o.completed_at}
        <div>
          <dt
            class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)] mb-1"
          >
            Completed
          </dt>
          <dd class="num text-sm text-[color:var(--color-system)]">
            {o.completed_at.slice(0, 10)}
          </dd>
        </div>
      {/if}
    </dl>
  {/if}
</div>
