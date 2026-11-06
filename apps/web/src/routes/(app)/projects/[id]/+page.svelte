<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { projectsState } from '$lib/state/projects.svelte';
  import AppHeader from '$lib/components/design-system/AppHeader.svelte';
  import PillarBadge from '$lib/components/design-system/PillarBadge.svelte';
  import { PROJECT_FORM_LABELS } from '$lib/copy/project-actions';

  const id = $derived(Number(page.params.id));
  const project = $derived(projectsState.byId(id));

  onMount(async () => {
    if (!project) {
      await projectsState.load();
    }
  });

  function statusLabel(status: string): string {
    if (status === 'active') return PROJECT_FORM_LABELS.statusActive;
    if (status === 'paused') return PROJECT_FORM_LABELS.statusPaused;
    return PROJECT_FORM_LABELS.statusArchived;
  }

  function ageLabel(startDate: string): string {
    const ms = Date.now() - new Date(startDate + 'T00:00:00Z').getTime();
    const days = Math.floor(ms / 86_400_000);
    if (days < 1) return '<1 jour';
    if (days === 1) return '1 jour';
    if (days < 30) return `${days} jours`;
    if (days < 365) return `${Math.floor(days / 30)} mois`;
    return `${Math.floor(days / 365)} an(s)`;
  }
</script>

<div class="px-4 pt-4 pb-32 max-w-md mx-auto">
  <AppHeader
    title={project?.name ?? 'Projet'}
    sub={project ? statusLabel(project.status) : '...'}
    onBack={() => goto('/projects')}
  />

  {#if !project}
    <p class="loading">Chargement…</p>
  {:else}
    <div class="project-detail">
      <!-- Header row: pillar icon + name + priority -->
      <div class="detail-hero">
        <PillarBadge pillar={project.pillar} size={48} />
        <div class="detail-hero__body">
          <span class="detail-hero__name">{project.name}</span>
          <div class="detail-hero__meta">
            <span class="detail-hero__status" style="color: var(--color-pillar-{project.pillar});">
              {statusLabel(project.status)}
            </span>
            <span class="detail-hero__sep">·</span>
            <span class="detail-hero__age">{ageLabel(project.start_date)}</span>
            <span class="detail-hero__sep">·</span>
            <span class="detail-hero__priority">P{project.priority}/10</span>
          </div>
        </div>
      </div>

      <!-- Description -->
      {#if project.description}
        <div class="detail-section">
          <span class="detail-label">Description</span>
          <p class="detail-text">{project.description}</p>
        </div>
      {/if}

      <!-- Notes -->
      {#if project.notes}
        <div class="detail-section">
          <span class="detail-label">Notes</span>
          <p class="detail-text detail-text--mono">{project.notes}</p>
        </div>
      {/if}

      <!-- Metadata -->
      <div class="detail-section">
        <span class="detail-label">Info</span>
        <div class="detail-meta-grid">
          <div class="detail-meta-row">
            <span class="detail-meta-key">Pillar</span>
            <span class="detail-meta-val" style="color: var(--color-pillar-{project.pillar});">
              {project.pillar}
            </span>
          </div>
          <div class="detail-meta-row">
            <span class="detail-meta-key">Started</span>
            <span class="detail-meta-val">{project.start_date}</span>
          </div>
          <div class="detail-meta-row">
            <span class="detail-meta-key">Updated</span>
            <span class="detail-meta-val">{project.updated_at.slice(0, 10)}</span>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="detail-actions">
        <a href={`/projects/${project.id}/edit`} class="btn-edit"> [ EDIT ] </a>
      </div>
    </div>
  {/if}
</div>

<style>
  .loading {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 14px;
    color: var(--color-text-secondary);
  }

  .project-detail {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .detail-hero {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px;
    border: 1px solid var(--color-border-subtle);
    border-radius: 16px;
    background: var(--color-bg);
  }

  .detail-hero__body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .detail-hero__name {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 700;
    font-size: 18px;
    color: var(--color-text-primary);
    line-height: 1.2;
    word-break: break-word;
  }

  .detail-hero__meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .detail-hero__status {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .detail-hero__sep,
  .detail-hero__age,
  .detail-hero__priority {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 10px;
    color: var(--color-text-muted);
  }

  .detail-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .detail-label {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .detail-text {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 14px;
    font-weight: 400;
    color: var(--color-text-secondary);
    line-height: 1.55;
    white-space: pre-line;
  }

  .detail-text--mono {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 12px;
  }

  .detail-meta-grid {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 14px;
    border: 1px solid var(--color-border-subtle);
    border-radius: 12px;
    background: var(--color-bg);
  }

  .detail-meta-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .detail-meta-key {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .detail-meta-val {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 11px;
    color: var(--color-text-secondary);
  }

  .detail-actions {
    padding-top: 4px;
  }

  .btn-edit {
    display: inline-flex;
    align-items: center;
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--color-system);
    text-decoration: none;
    border: 1px solid var(--color-system);
    border-radius: 10px;
    padding: 10px 18px;
    transition:
      background 0.15s,
      color 0.15s;
  }

  .btn-edit:hover {
    background: var(--color-system);
    color: #fff;
  }
</style>
