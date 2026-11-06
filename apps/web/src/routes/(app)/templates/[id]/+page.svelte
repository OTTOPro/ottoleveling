<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { Pencil } from '@lucide/svelte';
  import { templatesState } from '$lib/state/templates.svelte';
  import type { QuestTemplate, PillarId } from '$lib/api/types';
  import AppHeader from '$lib/components/design-system/AppHeader.svelte';

  const id = Number(page.params.id ?? '0');

  let loading = $state(true);
  let notFound = $state(false);
  let current: QuestTemplate | null = $state(null);

  onMount(async () => {
    if (templatesState.templates.length === 0 && templatesState.trash.length === 0) {
      await templatesState.load(false);
    }
    const t = templatesState.byId(id) ?? null;
    if (!t) {
      notFound = true;
      loading = false;
      return;
    }
    current = t;
    loading = false;
  });

  function pillarVar(p: PillarId): string {
    return `var(--color-pillar-${p})`;
  }
</script>

<div class="px-4 pt-4 pb-8 space-y-6 max-w-md mx-auto">
  <AppHeader title="Template" sub="Recurring quest" onBack={() => goto('/templates')}>
    {#snippet right()}
      {#if current}
        <a
          href={`/templates/${current.id}/edit`}
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
      No template with id {id}.
    </p>
  {:else if current}
    {@const t = current}
    <header class="space-y-1">
      <p class="system-tag text-[10px]" style="color: {pillarVar(t.pillar_id)};">
        [ TEMPLATE · {t.pillar_id.toUpperCase()} ]
      </p>
      <h1 class="text-xl font-bold text-[color:var(--color-text-primary)]">{t.title}</h1>
      <p class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)] pt-1">
        {t.base_metric} · {t.current_value} current · created {t.created_at.slice(0, 10)}
      </p>
    </header>

    <dl class="space-y-4">
      {#if t.description}
        <div>
          <dt
            class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)] mb-1"
          >
            Description
          </dt>
          <dd class="text-sm text-[color:var(--color-text-secondary)] leading-relaxed">
            {t.description}
          </dd>
        </div>
      {/if}

      <div class="grid grid-cols-2 gap-4">
        <div>
          <dt
            class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)] mb-1"
          >
            Schedule
          </dt>
          <dd class="num text-sm text-[color:var(--color-text-primary)] uppercase">{t.schedule}</dd>
        </div>
        <div>
          <dt
            class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)] mb-1"
          >
            Difficulty
          </dt>
          <dd class="num text-sm text-[color:var(--color-text-primary)] uppercase">
            {t.difficulty}
          </dd>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <dt
            class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)] mb-1"
          >
            Base XP
          </dt>
          <dd class="num text-sm text-[color:var(--color-text-primary)]">{t.base_xp}</dd>
        </div>
        <div>
          <dt
            class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)] mb-1"
          >
            Starting value
          </dt>
          <dd class="num text-sm text-[color:var(--color-text-primary)]">
            {t.starting_value}
            {t.base_metric}
          </dd>
        </div>
      </div>

      {#if t.auto_complete_rule}
        <div>
          <dt
            class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)] mb-1"
          >
            Auto-complete rule
          </dt>
          <dd class="num text-sm text-[color:var(--color-text-primary)]">
            {t.auto_complete_rule.metric}
            {t.auto_complete_rule.comparison ?? '>='}
            {t.auto_complete_rule.threshold}
            <span class="text-[color:var(--color-text-muted)]">({t.auto_complete_rule.source})</span
            >
          </dd>
        </div>
      {/if}

      <div class="grid grid-cols-2 gap-4">
        <div>
          <dt
            class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)] mb-1"
          >
            Active
          </dt>
          <dd
            class="num text-sm"
            style="color: {t.active ? 'var(--color-system)' : 'var(--color-failure)'};"
          >
            {t.active ? 'Yes' : 'No'}
          </dd>
        </div>
        <div>
          <dt
            class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)] mb-1"
          >
            Created by
          </dt>
          <dd class="num text-sm text-[color:var(--color-text-muted)] uppercase">{t.created_by}</dd>
        </div>
      </div>
    </dl>
  {/if}
</div>
