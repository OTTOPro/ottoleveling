<script lang="ts">
  import { page } from '$app/state';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { motionPreferences } from '$lib/state/motion-preferences.svelte';
  import BottomNav from '$lib/components/BottomNav.svelte';
  import Ceremony from '$lib/components/Ceremony.svelte';
  import { ceremonyState } from '$lib/state/ceremony.svelte';

  let { children } = $props();

  // Zero duration when user prefers reduced motion - transition still mounts
  // (no layout shift), just runs instantly. Same pattern as the other animations.
  const duration = $derived(motionPreferences.reduced ? 0 : 350);
</script>

<!--
  (app)/+layout.svelte
  - pb-24 (96px) clears the gradient BottomNav + iOS safe-area on PWA.
  - {#key page.url.pathname} re-mounts on every route change, firing the
    fly(y: 8, 350ms) screenIn transition. Reduced-motion zeroes the duration.
  - Ceremony is mounted here (layout level) so it covers BottomNav.
-->
<div class="min-h-screen pb-24">
  {#key page.url.pathname}
    <div in:fly={{ y: 8, duration, easing: cubicOut }}>
      {@render children?.()}
    </div>
  {/key}
</div>

<BottomNav />

<!-- Ceremony overlay - covers BottomNav. Renders nothing when data is null. -->
<Ceremony data={ceremonyState.data} onClose={() => ceremonyState.dismiss()} />
