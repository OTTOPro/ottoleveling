<script lang="ts">
  import { goto } from '$app/navigation';
  import { projectsState } from '$lib/state/projects.svelte';
  import type { ProjectPillar, ProjectStatus } from '$lib/api/types';
  import AppHeader from '$lib/components/design-system/AppHeader.svelte';
  import { PROJECT_FORM_LABELS } from '$lib/copy/project-actions';

  const PILLARS: { id: ProjectPillar; label: string }[] = [
    { id: 'body', label: 'Body' },
    { id: 'mind', label: 'Mind' },
    { id: 'finance', label: 'Finance' },
    { id: 'projects', label: 'Projects' },
  ];

  const STATUSES: { id: ProjectStatus; label: string }[] = [
    { id: 'active', label: PROJECT_FORM_LABELS.statusActive },
    { id: 'paused', label: PROJECT_FORM_LABELS.statusPaused },
    { id: 'archived', label: PROJECT_FORM_LABELS.statusArchived },
  ];

  let name = $state('');
  let description = $state('');
  let pillar = $state<ProjectPillar>('projects');
  let status = $state<ProjectStatus>('active');
  let priority = $state(5);
  let notes = $state('');
  let submitting = $state(false);
  let error = $state<string | null>(null);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    submitting = true;
    error = null;
    const proj = await projectsState.create({
      name,
      description: description || null,
      pillar,
      status,
      priority,
      notes: notes || null,
    });
    submitting = false;
    if (proj) {
      goto('/projects');
    } else {
      error = projectsState.error ?? 'Erreur inconnue';
    }
  }

  const fieldBase =
    'w-full bg-[color:var(--color-bg)] border border-[color:var(--color-border-subtle)] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[color:var(--color-system)] transition-colors text-[color:var(--color-text-primary)] font-[Lexend_Deca,system-ui] text-sm';
</script>

<div class="px-4 pt-4 pb-8 space-y-8 max-w-md mx-auto">
  <AppHeader
    title={PROJECT_FORM_LABELS.pageNew}
    sub="Enregistre un projet actif"
    onBack={() => goto('/projects')}
  />

  <form onsubmit={submit} class="space-y-7">
    <!-- Name -->
    <label class="block space-y-2">
      <span class="field-label">{PROJECT_FORM_LABELS.fieldName}</span>
      <input
        type="text"
        bind:value={name}
        required
        maxlength="200"
        placeholder={PROJECT_FORM_LABELS.fieldNamePlaceholder}
        class={fieldBase}
      />
    </label>

    <!-- Description -->
    <label class="block space-y-2">
      <span class="field-label">{PROJECT_FORM_LABELS.fieldDescription}</span>
      <textarea
        bind:value={description}
        rows="2"
        maxlength="2000"
        placeholder="Contexte, objectif principal..."
        class="{fieldBase} resize-none"></textarea>
    </label>

    <!-- Pillar -->
    <fieldset class="space-y-2">
      <legend class="field-label">{PROJECT_FORM_LABELS.fieldPillar}</legend>
      <div class="radio-grid">
        {#each PILLARS as p (p.id)}
          <label
            class="radio-card"
            style={pillar === p.id
              ? `border-color: var(--color-pillar-${p.id}); color: var(--color-pillar-${p.id}); background: var(--color-pillar-${p.id}-bg);`
              : ''}
          >
            <input type="radio" bind:group={pillar} value={p.id} class="sr-only" />
            {p.label}
          </label>
        {/each}
      </div>
    </fieldset>

    <!-- Status -->
    <fieldset class="space-y-2">
      <legend class="field-label">{PROJECT_FORM_LABELS.fieldStatus}</legend>
      <div class="radio-grid">
        {#each STATUSES as s (s.id)}
          <label
            class="radio-card"
            style={status === s.id
              ? 'border-color: var(--color-system); color: var(--color-system); background: rgba(99,102,241,0.07);'
              : ''}
          >
            <input type="radio" bind:group={status} value={s.id} class="sr-only" />
            {s.label}
          </label>
        {/each}
      </div>
    </fieldset>

    <!-- Priority -->
    <label class="block space-y-2">
      <span class="field-label">{PROJECT_FORM_LABELS.fieldPriority} - {priority}</span>
      <input
        type="range"
        bind:value={priority}
        min="1"
        max="10"
        step="1"
        class="w-full accent-[color:var(--color-system)]"
      />
      <div class="priority-labels">
        <span>1 - bas</span>
        <span>10 - haut</span>
      </div>
    </label>

    <!-- Notes -->
    <label class="block space-y-2">
      <span class="field-label">{PROJECT_FORM_LABELS.fieldNotes}</span>
      <textarea
        bind:value={notes}
        rows="3"
        maxlength="5000"
        placeholder="Free notes, next step, context..."
        class="{fieldBase} resize-none"></textarea>
    </label>

    {#if error}
      <p class="form-error">{error}</p>
    {/if}

    <!-- Actions -->
    <div class="form-actions">
      <button type="button" class="btn-cancel" onclick={() => goto('/projects')}>
        {PROJECT_FORM_LABELS.buttonCancel}
      </button>
      <button type="submit" class="btn-submit" disabled={submitting || !name.trim()}>
        {submitting ? '...' : PROJECT_FORM_LABELS.buttonCreate}
      </button>
    </div>
  </form>
</div>

<style>
  .field-label {
    display: block;
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .radio-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .radio-card {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px 8px;
    border: 1px solid var(--color-border-subtle);
    border-radius: 10px;
    cursor: pointer;
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-secondary);
    background: var(--color-bg);
    transition:
      border-color 0.15s,
      color 0.15s,
      background 0.15s;
    text-align: center;
  }

  .priority-labels {
    display: flex;
    justify-content: space-between;
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 10px;
    color: var(--color-text-muted);
    margin-top: 2px;
  }

  .form-actions {
    display: flex;
    gap: 10px;
    padding-top: 4px;
  }

  .btn-cancel {
    flex: 1;
    padding: 12px 0;
    background: none;
    border: none;
    cursor: pointer;
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-text-secondary);
    transition: color 0.15s;
  }

  .btn-cancel:hover {
    color: var(--color-text-primary);
  }

  .btn-submit {
    flex: 2;
    padding: 12px 0;
    background: var(--color-system);
    border: none;
    border-radius: 12px;
    cursor: pointer;
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #fff;
    transition: opacity 0.15s;
  }

  .btn-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .form-error {
    font-size: 13px;
    color: var(--color-failure);
  }
</style>
