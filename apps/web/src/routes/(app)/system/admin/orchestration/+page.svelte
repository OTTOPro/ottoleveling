<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import AppHeader from '$lib/components/design-system/AppHeader.svelte';
  import SectionHead from '$lib/components/design-system/SectionHead.svelte';
  import {
    getOrchestrationQueueDepth,
    getOrchestrationDlq,
    getOrchestrationWorkflows,
    retryDlqMessage,
    type QueueDepthEntry,
    type DlqRow,
    type ActiveWorkflow,
  } from '$lib/api/client';

  let queues = $state<QueueDepthEntry[]>([]);
  let llmDlq = $state<DlqRow[]>([]);
  let eventsDlq = $state<DlqRow[]>([]);
  let workflows = $state<ActiveWorkflow[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let retryingId = $state<number | null>(null);
  let retryMsg = $state<string | null>(null);

  async function load() {
    loading = true;
    error = null;
    try {
      const [depth, dlq, wf] = await Promise.all([
        getOrchestrationQueueDepth(),
        getOrchestrationDlq(),
        getOrchestrationWorkflows(),
      ]);
      queues = depth.queues;
      llmDlq = dlq.llm_dlq;
      eventsDlq = dlq.events_dlq;
      workflows = wf.active_objective_workflows;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  onMount(load);

  async function handleRetry(row: DlqRow, queue: 'llm_jobs' | 'events') {
    retryingId = row.id;
    retryMsg = null;
    try {
      await retryDlqMessage(row.id, queue);
      retryMsg = `Message ${row.id} replayed to ${queue}.`;
      // Refresh DLQ lists after retry
      const dlq = await getOrchestrationDlq();
      llmDlq = dlq.llm_dlq;
      eventsDlq = dlq.events_dlq;
    } catch (e) {
      retryMsg = `Retry failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      retryingId = null;
    }
  }

  // Inline SVG bar chart for DLQ counts
  function barWidth(count: number, max: number): number {
    if (max === 0) return 0;
    return Math.round((count / max) * 100);
  }

  const maxDlq = $derived(Math.max(...queues.map((q) => q.dlq_count), 1));

  function phaseLabel(current: number): string {
    return `Phase ${current}`;
  }
</script>

<div class="px-4 pt-4 pb-32 max-w-md mx-auto">
  <AppHeader
    title="Orchestration"
    sub="Queues · Workflows · DLQ"
    onBack={() => goto('/system/admin')}
  />

  {#if loading}
    <p class="status-text">Loading…</p>
  {:else if error}
    <p class="status-text status-text--error">{error}</p>
  {:else}
    <!-- Queue depth summary -->
    <SectionHead label="Queue DLQ counts" />
    <div class="queue-cards">
      {#each queues as q (q.name)}
        <div class="queue-card">
          <div class="queue-card__header">
            <span class="queue-card__name">{q.name.replace('ottoleveling-', '')}</span>
            <span
              class="queue-card__count"
              class:queue-card__count--ok={q.dlq_count === 0}
              class:queue-card__count--warn={q.dlq_count > 0}
            >
              {q.dlq_count} DLQ
            </span>
          </div>
          <!-- Bar chart -->
          <div class="bar-bg">
            <div
              class="bar-fill"
              class:bar-fill--warn={q.dlq_count > 0}
              style="width: {barWidth(q.dlq_count, maxDlq)}%;"
            ></div>
          </div>
          <span class="queue-card__note">{q.note}</span>
        </div>
      {/each}
      {#if queues.length === 0}
        <p class="empty-state">No queue data available.</p>
      {/if}
    </div>

    <!-- Active workflows -->
    <SectionHead label="Active objective workflows" />
    {#if workflows.length === 0}
      <p class="empty-state">No active objective workflows.</p>
    {:else}
      <div class="workflow-list">
        {#each workflows as wf (wf.objective_id)}
          <div class="workflow-row">
            <div class="workflow-row__header">
              <span class="workflow-row__title">{wf.title}</span>
              <span class="workflow-row__phase">{phaseLabel(wf.current_phase)}</span>
            </div>
            <div class="workflow-row__meta">
              <span class="workflow-row__id">run: {wf.workflow_run_id.slice(-12)}</span>
              {#if wf.transitioned_at}
                <span class="workflow-row__date"
                  >transitioned: {wf.transitioned_at.slice(0, 10)}</span
                >
              {/if}
            </div>
            <!-- Phase progress bar -->
            <div class="bar-bg" style="margin-top: 6px;">
              <div
                class="bar-fill bar-fill--phase"
                style="width: {Math.min(100, wf.current_phase * 25)}%;"
              ></div>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <!-- DLQ Inspection: LLM Jobs -->
    {#if retryMsg}
      <div class="retry-msg">{retryMsg}</div>
    {/if}

    <SectionHead label="DLQ - LLM Jobs ({llmDlq.length})" />
    {#if llmDlq.length === 0}
      <p class="empty-state dlq-ok">[ CLEAR ]</p>
    {:else}
      <div class="dlq-table">
        {#each llmDlq as row (row.id)}
          <div class="dlq-row">
            <div class="dlq-row__info">
              <span class="dlq-row__type">{row.message_type}</span>
              <span class="dlq-row__err">{row.error_message?.slice(0, 60) ?? '-'}</span>
              <span class="dlq-row__meta"
                >attempt {row.attempt_count} · {row.failed_at.slice(0, 10)}</span
              >
            </div>
            <button
              type="button"
              class="dlq-retry-btn"
              disabled={retryingId === row.id}
              onclick={() => handleRetry(row, 'llm_jobs')}
            >
              {retryingId === row.id ? '...' : '[ RETRY ]'}
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <!-- DLQ Inspection: Events -->
    <SectionHead label="DLQ - Events ({eventsDlq.length})" />
    {#if eventsDlq.length === 0}
      <p class="empty-state dlq-ok">[ CLEAR ]</p>
    {:else}
      <div class="dlq-table">
        {#each eventsDlq as row (row.id)}
          <div class="dlq-row">
            <div class="dlq-row__info">
              <span class="dlq-row__type">{row.message_type}</span>
              <span class="dlq-row__err">{row.error_message?.slice(0, 60) ?? '-'}</span>
              <span class="dlq-row__meta"
                >attempt {row.attempt_count} · {row.failed_at.slice(0, 10)}</span
              >
            </div>
            <button
              type="button"
              class="dlq-retry-btn"
              disabled={retryingId === row.id}
              onclick={() => handleRetry(row, 'events')}
            >
              {retryingId === row.id ? '...' : '[ RETRY ]'}
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Refresh -->
    <div class="refresh-row">
      <button type="button" class="refresh-btn" onclick={load}>[ REFRESH ]</button>
    </div>
  {/if}
</div>

<style>
  .status-text {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 14px;
    color: var(--color-text-secondary);
  }

  .status-text--error {
    color: var(--color-failure);
  }

  .queue-cards {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 24px;
  }

  .queue-card {
    padding: 14px 16px;
    border: 1px solid var(--color-border-subtle);
    border-radius: 14px;
    background: var(--color-bg);
  }

  .queue-card__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .queue-card__name {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.05em;
    color: var(--color-text-primary);
  }

  .queue-card__count {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 12px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 6px;
  }

  .queue-card__count--ok {
    color: var(--color-pillar-projects);
    background: var(--color-pillar-projects-bg);
  }

  .queue-card__count--warn {
    color: var(--color-failure);
    background: rgba(239, 68, 68, 0.08);
  }

  .queue-card__note {
    display: block;
    margin-top: 6px;
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 9px;
    color: var(--color-text-muted);
    letter-spacing: 0.05em;
  }

  .bar-bg {
    height: 4px;
    background: var(--color-border-subtle);
    border-radius: 2px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    background: var(--color-pillar-projects);
    border-radius: 2px;
    transition: width 0.3s;
    min-width: 2px;
  }

  .bar-fill--warn {
    background: var(--color-failure);
  }

  .bar-fill--phase {
    background: var(--color-system);
  }

  .workflow-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 24px;
  }

  .workflow-row {
    padding: 14px 16px;
    border: 1px solid var(--color-border-subtle);
    border-radius: 14px;
    background: var(--color-bg);
  }

  .workflow-row__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .workflow-row__title {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  .workflow-row__phase {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 11px;
    font-weight: 700;
    color: var(--color-system);
    flex-shrink: 0;
    margin-left: 8px;
  }

  .workflow-row__meta {
    display: flex;
    gap: 10px;
    margin-bottom: 4px;
  }

  .workflow-row__id,
  .workflow-row__date {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 10px;
    color: var(--color-text-muted);
  }

  .retry-msg {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 11px;
    color: var(--color-system);
    margin-bottom: 12px;
    padding: 8px 12px;
    border: 1px solid var(--color-system);
    border-radius: 8px;
    background: rgba(99, 102, 241, 0.05);
  }

  .dlq-table {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--color-border-subtle);
    border: 1px solid var(--color-border-subtle);
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 24px;
  }

  .dlq-row {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--color-bg);
    padding: 12px 14px;
  }

  .dlq-row__info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .dlq-row__type {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 11px;
    font-weight: 600;
    color: var(--color-failure);
    letter-spacing: 0.08em;
  }

  .dlq-row__err {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 12px;
    color: var(--color-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dlq-row__meta {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 9px;
    color: var(--color-text-muted);
  }

  .dlq-retry-btn {
    flex-shrink: 0;
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.12em;
    color: var(--color-system);
    background: none;
    border: 1px solid var(--color-system);
    border-radius: 6px;
    padding: 5px 8px;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
    white-space: nowrap;
  }

  .dlq-retry-btn:hover:not(:disabled) {
    background: var(--color-system);
    color: #fff;
  }

  .dlq-retry-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .empty-state {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 14px;
    color: var(--color-text-secondary);
    margin-bottom: 24px;
  }

  .dlq-ok {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 11px;
    font-weight: 600;
    color: var(--color-pillar-projects);
    letter-spacing: 0.15em;
    margin-bottom: 24px;
  }

  .refresh-row {
    display: flex;
    justify-content: center;
    padding-top: 8px;
  }

  .refresh-btn {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.18em;
    color: var(--color-text-secondary);
    background: none;
    border: 1px solid var(--color-border-subtle);
    border-radius: 8px;
    padding: 8px 18px;
    cursor: pointer;
    transition:
      border-color 0.15s,
      color 0.15s;
  }

  .refresh-btn:hover {
    border-color: var(--color-system);
    color: var(--color-system);
  }
</style>
