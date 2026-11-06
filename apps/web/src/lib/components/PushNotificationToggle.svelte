<!--
  apps/web/src/lib/components/PushNotificationToggle.svelte

  Subscription status + enable/disable button. Shows an iOS hint for
  iOS user-agents (requires Add to Home Screen first per Apple's PWA rules).
  Reads pushState - call pushState.init() from the parent on mount.

  "Send test" button visible when subscribed; reads
  pushState.testConfirmation for 3s "Test sent." status text.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { pushState, isIos } from '$lib/state/push.svelte';

  onMount(() => {
    pushState.init();
  });

  const ios = isIos();
</script>

<div class="space-y-3">
  {#if pushState.permission === 'unsupported'}
    <p class="text-sm text-[color:var(--color-text-secondary)]">
      Push notifications unsupported on this browser.
    </p>
  {:else if pushState.permission === 'denied'}
    <p class="text-sm" style="color: var(--color-failure);">
      Permission denied. Re-enable in browser settings, then reload.
    </p>
  {:else}
    <div class="flex items-baseline justify-between gap-3">
      <div class="space-y-0.5">
        <p class="text-sm text-[color:var(--color-text-primary)]">
          {pushState.subscribed ? 'Subscribed' : 'Not subscribed'}
        </p>
        {#if pushState.subscribed && pushState.endpoint}
          <p
            class="num text-[10px] tracking-[0.16em] uppercase text-[color:var(--color-text-muted)] truncate max-w-[18rem]"
          >
            {new URL(pushState.endpoint).hostname}
          </p>
        {/if}
      </div>
      {#if pushState.subscribed}
        <button
          type="button"
          onclick={() => pushState.disable()}
          disabled={pushState.loading}
          class="px-3 py-2 border border-[color:var(--color-border-subtle)] hover:border-[color:var(--color-failure)] hover:text-[color:var(--color-failure)] text-[color:var(--color-text-secondary)] transition-colors text-xs tracking-[0.18em] uppercase disabled:opacity-50"
        >
          {pushState.loading ? 'Disabling…' : 'Disable'}
        </button>
      {:else}
        <button
          type="button"
          onclick={() => pushState.enable()}
          disabled={pushState.loading}
          class="px-3 py-2 border border-[color:var(--color-system)] text-[color:var(--color-system)] hover:bg-[color:var(--color-system)] hover:text-[color:var(--color-bg)] transition-colors text-xs tracking-[0.18em] uppercase disabled:opacity-50"
        >
          {pushState.loading ? 'Enabling…' : 'Enable'}
        </button>
      {/if}
    </div>

    <!--
      Send test notification button. Visible only when a subscription
      is active. Default to 'daily' (most-used path). Shows 3s confirmation
      after a successful send via pushState.testConfirmation.
    -->
    {#if pushState.subscribed}
      <div class="flex items-center justify-between gap-3 pt-1">
        <p class="text-[10px] tracking-[0.16em] uppercase text-[color:var(--color-text-muted)]">
          {pushState.testConfirmation ? 'Test sent. Check your device.' : 'Verify delivery'}
        </p>
        <button
          type="button"
          onclick={() => pushState.sendTest('daily')}
          disabled={pushState.loading}
          class="px-3 py-2 border border-[color:var(--color-border-subtle)] hover:border-[color:var(--color-system)] hover:text-[color:var(--color-system)] text-[color:var(--color-text-secondary)] transition-colors text-xs tracking-[0.18em] uppercase disabled:opacity-50"
        >
          Send test
        </button>
      </div>
    {/if}

    {#if ios && !pushState.subscribed}
      <p class="text-[10px] tracking-[0.16em] uppercase text-[color:var(--color-text-muted)]">
        iOS: requires Add to Home Screen first.
      </p>
    {/if}

    {#if pushState.error}
      <p class="text-xs" style="color: var(--color-failure);">
        {pushState.error}
      </p>
    {/if}
  {/if}
</div>
