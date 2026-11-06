<script lang="ts">
  import type { DataSourceRow, ProviderName } from '$lib/api/types';
  import { dataSourcesState } from '$lib/state/dataSources.svelte';

  interface Props {
    row: DataSourceRow;
  }
  let { row }: Props = $props();

  const PROVIDER_LABELS: Record<ProviderName, string> = {
    google_health: 'Google Health',
    spotify: 'Spotify',
  };

  const STATUS_LABEL: Record<DataSourceRow['status'], string> = {
    disconnected: 'Disconnected',
    connected: 'Connected',
    reauth_required: 'Re-auth required',
    error: 'Error',
  };

  function formatDate(iso: string | null): string {
    if (!iso) return 'never';
    return new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
  }

  // Countdown UX for the Re-connect button. Google OAuth Test mode
  // refresh_tokens expire after 7 days of inactivity (locked policy per
  // https://developers.google.com/identity/protocols/oauth2). The countdown
  // gives the user visible warning before they hit a re-auth wall. This is
  // informational, not a contract guarantee - Google may change the policy.
  const REFRESH_INACTIVITY_LIMIT_DAYS = 7;

  function daysSinceLastSync(): number | null {
    if (!row.last_sync_at) return null;
    const last = new Date(row.last_sync_at).getTime();
    const now = Date.now();
    return Math.floor((now - last) / (24 * 60 * 60 * 1000));
  }

  function daysRemaining(): number | null {
    const since = daysSinceLastSync();
    if (since == null) return null;
    return REFRESH_INACTIVITY_LIMIT_DAYS - since;
  }

  function reconnectLabel(): string {
    // Spotify refresh tokens are long-lived; suppress the Google-Test-mode countdown.
    if (row.provider === 'spotify') return 'Re-connect';
    if (row.status === 'reauth_required' || row.status === 'error') return 'Re-connect';
    const remaining = daysRemaining();
    if (remaining == null || remaining > 2) return 'Re-connect';
    if (remaining <= 0) return 'Re-connect';
    return `Re-connect (expires in ${remaining} day${remaining === 1 ? '' : 's'})`;
  }

  function reconnectBorderColor(): string {
    if (row.provider === 'spotify') {
      if (row.status === 'reauth_required' || row.status === 'error') return 'var(--color-failure)';
      return 'var(--color-system)';
    }
    if (row.status === 'reauth_required' || row.status === 'error') return 'var(--color-failure)';
    const remaining = daysRemaining();
    if (remaining == null || remaining > 2) return 'var(--color-system)';
    if (remaining <= 0) return 'var(--color-failure)';
    return 'var(--color-warning, #d4a017)'; // fallback warning yellow if token not defined
  }

  function onConnect() {
    dataSourcesState.connect(row.provider);
  }

  async function onDisconnect() {
    await dataSourcesState.disconnect(row.provider);
  }
</script>

<li class="space-y-1.5 border border-[color:var(--color-border-subtle)] px-3 py-2">
  <div class="flex items-baseline justify-between gap-3">
    <p class="text-[12px] tracking-[0.06em]" style="color: var(--color-system);">
      {PROVIDER_LABELS[row.provider]}
    </p>
    <p
      class="num text-[10px] tracking-[0.18em] uppercase"
      style="color: {row.status === 'connected'
        ? 'var(--color-success)'
        : row.status === 'reauth_required' || row.status === 'error'
          ? 'var(--color-failure)'
          : 'var(--color-text-muted)'};"
    >
      {STATUS_LABEL[row.status]}
    </p>
  </div>
  {#if row.provider === 'spotify'}
    <p class="text-[9px] italic mt-0.5" style="color: var(--color-text-muted);">
      Library activity tracker (saves ≠ listens)
    </p>
  {/if}
  <p class="text-[10px] text-[color:var(--color-text-muted)]">
    Last sync: {formatDate(row.last_sync_at)}{row.last_sync_status
      ? ` · ${row.last_sync_status}`
      : ''}
  </p>
  {#if row.error_message}
    <p class="text-[10px]" style="color: var(--color-failure);">
      {row.error_message}
    </p>
  {/if}
  <div class="flex gap-2 pt-1">
    {#if row.status === 'disconnected'}
      <button
        type="button"
        onclick={onConnect}
        class="text-[10px] tracking-[0.18em] uppercase border border-[color:var(--color-system)] px-2 py-1 text-[color:var(--color-system)] hover:bg-[color:var(--color-system)] hover:text-[color:var(--color-bg)] transition-colors"
      >
        Connect
      </button>
    {:else if row.status === 'reauth_required' || row.status === 'error'}
      <button
        type="button"
        onclick={onConnect}
        class="text-[10px] tracking-[0.18em] uppercase px-2 py-1 hover:opacity-80 transition-opacity"
        style="border: 1px solid {reconnectBorderColor()}; color: {reconnectBorderColor()};"
      >
        {reconnectLabel()}
      </button>
      <button
        type="button"
        onclick={onDisconnect}
        class="text-[10px] tracking-[0.18em] uppercase border border-[color:var(--color-border-subtle)] px-2 py-1 text-[color:var(--color-text-muted)]"
      >
        Disconnect
      </button>
    {:else}
      <!-- Connected: show countdown-aware Re-connect only when approaching 7-day expiry, else just Disconnect.
           Spotify refresh tokens are long-lived; suppress the countdown for Spotify. -->
      {@const remaining = daysRemaining()}
      {#if row.provider !== 'spotify' && remaining != null && remaining <= 2}
        <button
          type="button"
          onclick={onConnect}
          class="text-[10px] tracking-[0.18em] uppercase px-2 py-1 hover:opacity-80 transition-opacity"
          style="border: 1px solid {reconnectBorderColor()}; color: {reconnectBorderColor()};"
        >
          {reconnectLabel()}
        </button>
      {/if}
      <button
        type="button"
        onclick={onDisconnect}
        class="text-[10px] tracking-[0.18em] uppercase border border-[color:var(--color-border-subtle)] px-2 py-1 text-[color:var(--color-text-muted)]"
      >
        Disconnect
      </button>
    {/if}
  </div>
</li>
