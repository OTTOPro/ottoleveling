<script lang="ts">
  import { autoCompletionsState } from '$lib/state/autoCompletions.svelte';
  import { describeAutoCompletion } from '$lib/utils/auto-complete-format';

  const visible = $derived(autoCompletionsState.visible);
  let autoDismissTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (autoDismissTimer) {
      clearTimeout(autoDismissTimer);
      autoDismissTimer = null;
    }
    if (visible) {
      autoDismissTimer = setTimeout(() => {
        autoCompletionsState.acknowledge(visible.id);
      }, 8000);
    }
    return () => {
      if (autoDismissTimer) {
        clearTimeout(autoDismissTimer);
        autoDismissTimer = null;
      }
    };
  });
</script>

{#if visible}
  <button
    type="button"
    onclick={() => autoCompletionsState.acknowledge(visible.id)}
    class="block w-full text-left border-2 border-[color:var(--color-system)] px-4 py-3 mb-4 cursor-pointer"
    style="background: color-mix(in oklab, var(--color-system) 6%, transparent);"
  >
    <p class="text-[10px] tracking-[0.18em] uppercase" style="color: var(--color-system);">
      [ AUTO-COMPLETE ]
    </p>
    <p class="text-sm mt-1 leading-snug" style="color: var(--color-text-primary);">
      {describeAutoCompletion(visible)}
    </p>
  </button>
{/if}
