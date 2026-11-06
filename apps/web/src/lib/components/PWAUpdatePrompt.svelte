<!--
  PWA update banner. Surfaces when @vite-pwa/sveltekit detects a new SW
  version (registerType='prompt' in vite.config.ts). User clicks Refresh
  to activate the new version + reload. Without this, deploys would silently
  serve stale bundles until the user fully closes all tabs.

  Positioned fixed above the BottomNav so it doesn't cover content. Slides
  in via CSS transition. Design language: bracketed system-tag,
  outline buttons, system-blue accent.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { RefreshCw, X } from '@lucide/svelte';
  import { useRegisterSW } from 'virtual:pwa-register/svelte';

  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegisterError(err: unknown) {
      console.error('[PWA] SW registration error:', err);
    },
  });

  let dismissed = $state(false);

  // Reset dismissal whenever a new version becomes available. Otherwise a
  // user who dismissed v2 would never see v3's prompt.
  let lastSeenNeedRefresh = false;
  onMount(() => {
    const unsubscribe = needRefresh.subscribe((v: boolean) => {
      if (v && !lastSeenNeedRefresh) dismissed = false;
      lastSeenNeedRefresh = v;
    });
    return unsubscribe;
  });

  async function applyUpdate() {
    // updateServiceWorker(true) reloads the page after activating the new SW.
    await updateServiceWorker(true);
  }

  function dismiss() {
    dismissed = true;
  }
</script>

{#if $needRefresh && !dismissed}
  <!-- Fixed above the BottomNav (which sits at bottom: 0 with no defined height
       but renders ~56px tall). The pb-[72px] on the (app) layout already gives
       quest content room; this prompt sits between content and nav. -->
  <div
    class="fixed bottom-[72px] inset-x-0 z-40 flex justify-center px-4 pointer-events-none"
    role="status"
    aria-live="polite"
  >
    <div
      class="pointer-events-auto w-full max-w-md bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border-subtle)]"
      style="
        box-shadow:
          inset 0 1px 0 rgba(96, 165, 250, 0.04),
          inset 0 0 0 1px rgba(96, 165, 250, 0.02);
      "
    >
      <header class="flex items-baseline gap-3 px-4 pt-3">
        <span class="system-tag text-[10px]" style="color: var(--color-system);">
          [ UPDATE AVAILABLE ]
        </span>
        <span class="h-px flex-1 bg-[color:var(--color-border-subtle)]"></span>
        <button
          type="button"
          onclick={dismiss}
          aria-label="Dismiss update notice"
          class="text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-primary)] transition-colors"
        >
          <X size={12} strokeWidth={1.5} />
        </button>
      </header>

      <div class="px-4 py-2">
        <p class="text-xs text-[color:var(--color-text-secondary)] leading-relaxed">
          A newer version of The System is ready. Refresh to apply.
        </p>
      </div>

      <footer class="px-4 pb-3">
        <button
          type="button"
          onclick={applyUpdate}
          class="inline-flex items-center gap-1.5 text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-system)] hover:text-[color:var(--color-text-primary)] transition-colors"
        >
          <RefreshCw size={12} strokeWidth={1.5} />
          Refresh now
        </button>
      </footer>
    </div>
  </div>
{/if}
