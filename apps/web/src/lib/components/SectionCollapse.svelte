<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    sectionKey: string;
    title: string;
    defaultOpen?: boolean;
    children?: Snippet;
  }
  const { sectionKey, title, defaultOpen = false, children }: Props = $props();

  // Defaults are all-sections-open.
  // Bumped key version to flush stale `collapsed` preferences from any user
  // who collapsed sections under the previous default (only STATUS open).
  const lsKey = `system_section_${sectionKey}_expanded_v2`;
  let open = $state(defaultOpen);

  onMount(() => {
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw === 'true') open = true;
      else if (raw === 'false') open = false;
      // else fall back to defaultOpen
    } catch {
      // localStorage unavailable - fall back to default
    }
  });

  function onToggle(e: Event) {
    const detailsEl = e.currentTarget as HTMLDetailsElement;
    open = detailsEl.open;
    try {
      localStorage.setItem(lsKey, String(open));
    } catch {
      /* ignore */
    }
  }
</script>

<details class="border-t border-[color:var(--color-border-subtle)]" {open} ontoggle={onToggle}>
  <summary class="cursor-pointer py-3 list-none flex items-center justify-between">
    <h2 class="system-tag text-[11px]">[ {title} ]</h2>
    <span class="text-[10px] text-[color:var(--color-text-muted)]">{open ? '−' : '+'}</span>
  </summary>
  <div class="pt-2 pb-6 space-y-6">
    {@render children?.()}
  </div>
</details>
