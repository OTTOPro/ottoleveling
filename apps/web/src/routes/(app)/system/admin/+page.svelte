<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { questsState } from '$lib/state/quests.svelte';
  import { dataSourcesState } from '$lib/state/dataSources.svelte';
  import { configState } from '$lib/state/config.svelte';
  import { apiRequest, getSystemState, triggerAutoCompleteNow } from '$lib/api/client';
  import type { SystemAgentSnapshot } from '$lib/api/types';
  import ConfirmModal from '$lib/components/ConfirmModal.svelte';
  import AppHeader from '$lib/components/design-system/AppHeader.svelte';
  import SectionHead from '$lib/components/design-system/SectionHead.svelte';
  import SectionCollapse from '$lib/components/SectionCollapse.svelte';
  import PushNotificationToggle from '$lib/components/PushNotificationToggle.svelte';

  let snapshot: SystemAgentSnapshot | null = $state(null);
  let loading = $state(true);
  let error: string | null = $state(null);
  let regenerating = $state(false);
  let confirmOpen = $state(false);
  let syncingAll = $state(false);
  let recomputingLifetime = $state(false);
  let autoCompleting = $state(false);
  let actionMsg = $state<string | null>(null);

  async function load() {
    loading = true;
    error = null;
    try {
      const [s] = await Promise.all([
        getSystemState(),
        configState.load(),
        dataSourcesState.load(),
      ]);
      snapshot = s;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  onMount(load);

  function formatDateTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  // Regen handlers
  function onForceRegenClick() {
    confirmOpen = true;
  }

  async function onConfirmRegen() {
    confirmOpen = false;
    regenerating = true;
    actionMsg = null;
    try {
      await questsState.forceRegenerate();
      await load();
      actionMsg = 'Today regenerated.';
    } catch {
      actionMsg = 'Regeneration failed.';
    } finally {
      regenerating = false;
    }
  }

  function onCancelRegen() {
    confirmOpen = false;
  }

  // Re-sync all connected sources
  async function onResyncSources() {
    syncingAll = true;
    actionMsg = null;
    try {
      const connected = dataSourcesState.dataSources.filter((d) => d.status === 'connected');
      await Promise.all(
        connected.map((d) =>
          apiRequest(`/api/data-sources/${d.provider}/sync`, { method: 'POST' }),
        ),
      );
      await dataSourcesState.load();
      actionMsg = `Re-synced ${connected.length} source(s).`;
    } catch {
      actionMsg = 'Sync failed.';
    } finally {
      syncingAll = false;
    }
  }

  // Recompute lifetime
  async function onRecomputeLifetime() {
    recomputingLifetime = true;
    actionMsg = null;
    try {
      const res = await apiRequest('/api/admin/recompute-lifetime', { method: 'POST' });
      const data = (await res.json()) as { ok: boolean; recomputed_at: string };
      actionMsg = data.ok
        ? `Lifetime recomputed at ${data.recomputed_at.slice(0, 16)}.`
        : 'Recompute failed.';
    } catch {
      actionMsg = 'Recompute failed.';
    } finally {
      recomputingLifetime = false;
    }
  }

  // Force auto-complete now
  async function onAutoCompleteNow() {
    autoCompleting = true;
    actionMsg = null;
    try {
      const result = await triggerAutoCompleteNow();
      actionMsg = `Auto-complete: ${result.completed}/${result.attempted} completed.`;
    } catch {
      actionMsg = 'Auto-complete failed.';
    } finally {
      autoCompleting = false;
    }
  }

  /**
   * Secret redaction for RAW STATE disclosure.
   */
  const SECRET_KEY_PATTERN = /(token|key|secret|password|credential|bearer|api[_-]?key)/i;

  function redactSecrets(obj: unknown): string {
    return JSON.stringify(
      obj,
      (key, value) => {
        if (typeof key === 'string' && key.length > 0 && SECRET_KEY_PATTERN.test(key)) {
          return '[REDACTED]';
        }
        return value;
      },
      2,
    );
  }

  // Last sync ago helper
  function lastSyncAgo(): string {
    const connected = dataSourcesState.dataSources.filter((d) => d.status === 'connected');
    if (connected.length === 0) return 'never';
    const last = connected
      .map((d) => d.last_sync_at)
      .filter(Boolean)
      .sort()
      .at(-1);
    if (!last) return 'never';
    const mins = Math.round((Date.now() - new Date(last).getTime()) / 60000);
    if (mins < 60) return `${mins}m ago`;
    return `${Math.round(mins / 60)}h ago`;
  }
</script>

<div class="px-4 pt-4 pb-32 max-w-md mx-auto">
  <AppHeader title="Admin" sub="Debug · alarms · raw state" onBack={() => goto('/system')} />

  {#if loading && !snapshot}
    <p class="admin-loading">Loading…</p>
  {:else if error}
    <p class="admin-error">{error}</p>
  {:else if snapshot}
    <!-- Status block -->
    <div class="status-block">
      <div class="status-block__online">
        <span class="status-block__dot" aria-hidden="true"></span>
        <span class="status-block__label">system online · build {configState.version}</span>
      </div>
      <span class="status-block__meta">
        last sync {lastSyncAgo()} · {snapshot.scheduledEvents.length} alarm{snapshot.scheduledEvents
          .length === 1
          ? ''
          : 's'} queued
      </span>
    </div>

    <!-- Action message -->
    {#if actionMsg}
      <div class="action-msg">{actionMsg}</div>
    {/if}

    <!-- Action rows card -->
    <SectionHead label="Actions" />
    <div class="actions-card">
      <!-- Push notifications -->
      <div class="actions-card__row">
        <PushNotificationToggle />
      </div>

      <!-- Force regen -->
      <div class="actions-card__row actions-card__row--action">
        <div class="actions-card__row-info">
          <span class="actions-card__row-title">Regenerate today's quests</span>
          <span class="actions-card__row-sub">Wipes uncompleted system quests and re-generates</span
          >
        </div>
        <button
          type="button"
          onclick={onForceRegenClick}
          disabled={regenerating}
          class="action-btn"
        >
          {regenerating ? 'Running…' : 'Run'}
        </button>
      </div>

      <!-- Re-sync sources -->
      <div class="actions-card__row actions-card__row--action">
        <div class="actions-card__row-info">
          <span class="actions-card__row-title">Re-sync data sources</span>
          <span class="actions-card__row-sub">Fetch latest Google Health + Spotify data</span>
        </div>
        <button type="button" onclick={onResyncSources} disabled={syncingAll} class="action-btn">
          {syncingAll ? 'Syncing…' : 'Sync'}
        </button>
      </div>

      <!-- Recompute lifetime -->
      <div class="actions-card__row actions-card__row--action">
        <div class="actions-card__row-info">
          <span class="actions-card__row-title">Recompute lifetime stats</span>
          <span class="actions-card__row-sub">Recalculates lifetime_stats from D1</span>
        </div>
        <button
          type="button"
          onclick={onRecomputeLifetime}
          disabled={recomputingLifetime}
          class="action-btn"
        >
          {recomputingLifetime ? 'Running…' : 'Run'}
        </button>
      </div>

      <!-- Auto-complete now -->
      <div class="actions-card__row actions-card__row--action">
        <div class="actions-card__row-info">
          <span class="actions-card__row-title">Auto-complete eligible quests</span>
          <span class="actions-card__row-sub">Applies metric-threshold rules now</span>
        </div>
        <button
          type="button"
          onclick={onAutoCompleteNow}
          disabled={autoCompleting}
          class="action-btn"
        >
          {autoCompleting ? 'Running…' : 'Run'}
        </button>
      </div>
    </div>

    <!-- Orchestration link -->
    <SectionHead label="Orchestration" />
    <a href="/system/admin/orchestration" class="orch-link">
      <div class="orch-link__body">
        <span class="orch-link__title">[ ORCHESTRATION ]</span>
        <span class="orch-link__sub">Queue DLQ counts · Active workflows · Retry</span>
      </div>
      <span class="orch-link__arrow">→</span>
    </a>

    <!-- Scheduled alarms via SectionCollapse -->
    <SectionCollapse sectionKey="admin_alarms" title="ALARMS" defaultOpen={false}>
      {#if snapshot.scheduledEvents.length > 0}
        <ol class="alarm-list">
          {#each [...snapshot.scheduledEvents].sort( (a, b) => a.scheduledFor.localeCompare(b.scheduledFor), ) as ev (ev.id)}
            <li class="alarm-row">
              <span class="alarm-row__type">{ev.type}</span>
              <span class="alarm-row__time">{formatDateTime(ev.scheduledFor)}</span>
            </li>
          {/each}
        </ol>
      {:else}
        <p class="admin-empty">No events queued. Setting focus seeds the initial 5 events.</p>
      {/if}
    </SectionCollapse>

    <!-- Raw state disclosure -->
    <SectionCollapse sectionKey="admin_raw" title="RAW STATE · REDACTED" defaultOpen={false}>
      <pre class="raw-state">{redactSecrets(snapshot)}</pre>
    </SectionCollapse>

    <!-- Footer: phase + LLM model -->
    <div class="admin-footer">
      version {configState.version} · llm {configState.llmModel}
    </div>
  {/if}
</div>

<!-- Confirm regen modal -->
<ConfirmModal
  open={confirmOpen}
  title="[ CONFIRM REGENERATION ]"
  message="This wipes today's uncompleted system-generated quests and asks The System for a new batch.

Completed quests stay as history.

Proceed?"
  confirmLabel="Regenerate"
  cancelLabel="Cancel"
  variant="danger"
  onConfirm={onConfirmRegen}
  onCancel={onCancelRegen}
/>

<style>
  .orch-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border: 1px solid var(--color-border-subtle);
    border-radius: 14px;
    background: var(--color-bg);
    text-decoration: none;
    color: inherit;
    transition: border-color 0.15s;
    margin-bottom: 20px;
  }

  .orch-link:hover {
    border-color: var(--color-system);
  }

  .orch-link__body {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1;
  }

  .orch-link__title {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--color-system);
  }

  .orch-link__sub {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 12px;
    color: var(--color-text-secondary);
  }

  .orch-link__arrow {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 14px;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .admin-loading,
  .admin-error,
  .admin-empty {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 14px;
    color: var(--color-text-secondary);
    padding: 12px 0;
  }

  .admin-error {
    color: var(--color-failure);
  }

  /* Status block */
  .status-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: var(--color-surface, #fafafc);
    border: 1px solid var(--color-border-subtle);
    border-radius: 14px;
    padding: 14px 16px;
    margin-bottom: 20px;
  }

  .status-block__online {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .status-block__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-success, #10b981);
    flex-shrink: 0;
  }

  .status-block__label {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 12px;
    color: var(--color-text-primary);
  }

  .status-block__meta {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 11px;
    color: var(--color-text-muted);
    padding-left: 16px;
  }

  .action-msg {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 11px;
    color: var(--color-system);
    padding: 8px 0 12px;
    letter-spacing: 0.05em;
  }

  /* Actions card */
  .actions-card {
    background: var(--color-bg);
    border: 1px solid var(--color-border-subtle);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    margin-bottom: 16px;
  }

  .actions-card__row {
    padding: 14px 16px;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .actions-card__row:last-child {
    border-bottom: none;
  }

  .actions-card__row--action {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .actions-card__row-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .actions-card__row-title {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 500;
    font-size: 14px;
    color: var(--color-text-primary);
  }

  .actions-card__row-sub {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 12px;
    color: var(--color-text-secondary);
  }

  .action-btn {
    flex-shrink: 0;
    padding: 8px 14px;
    background: transparent;
    border: 1px solid var(--color-border-subtle);
    border-radius: 10px;
    cursor: pointer;
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-system);
    transition:
      border-color 0.15s,
      background 0.15s;
  }

  @media (hover: hover) {
    .action-btn:hover:not(:disabled) {
      border-color: var(--color-system);
      background: color-mix(in oklab, var(--color-system) 8%, transparent);
    }
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Alarm list */
  .alarm-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .alarm-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .alarm-row:last-child {
    border-bottom: none;
  }

  .alarm-row__type {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 13px;
    color: var(--color-text-primary);
  }

  .alarm-row__time {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 11px;
    color: var(--color-text-secondary);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* Raw state pre */
  .raw-state {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 10px;
    color: var(--color-text-muted);
    overflow-x: auto;
    line-height: 1.6;
    white-space: pre;
  }

  /* Footer */
  .admin-footer {
    margin-top: 20px;
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 10px;
    color: var(--color-text-muted);
    text-align: center;
    padding: 8px 0;
  }
</style>
