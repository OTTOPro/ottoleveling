<script lang="ts">
  import { fade } from 'svelte/transition';
  import { onMount, onDestroy } from 'svelte';
  import type { RecentUnlock } from '$lib/api/types';

  interface Props {
    unlock: RecentUnlock;
    onAcknowledge: (id: string) => void;
  }
  let { unlock, onAcknowledge }: Props = $props();

  let timer: ReturnType<typeof setTimeout> | null = null;
  let dismissed = $state(false);

  onMount(() => {
    timer = setTimeout(() => dismiss(), 8000);
  });

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    onAcknowledge(unlock.id);
  }
</script>

{#if !dismissed}
  <button
    type="button"
    class="block w-full text-left border-2 border-[color:var(--color-system)] px-4 py-3 mb-4 cursor-pointer"
    onclick={dismiss}
    in:fade={{ duration: 250 }}
    out:fade={{ duration: 200 }}
  >
    <p class="text-[10px] tracking-[0.18em] uppercase" style="color: var(--color-system);">
      [ ACHIEVEMENT UNLOCKED ]
    </p>
    <p class="text-sm mt-1" style="color: var(--color-text-primary);">
      {unlock.name}
    </p>
    <p class="text-[11px] text-[color:var(--color-text-muted)] mt-0.5">
      {unlock.description}
    </p>
  </button>
{/if}
