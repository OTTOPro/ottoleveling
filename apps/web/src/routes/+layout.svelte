<script lang="ts">
  import '../app.css';
  import PWAUpdatePrompt from '$lib/components/PWAUpdatePrompt.svelte';
  import { accessJwtStore } from '$lib/state/access-jwt.svelte';
  import type { LayoutProps } from './$types';

  let { children, data }: LayoutProps = $props();

  // Seed the JWT store from server-side page data on first load.
  // The CF_Authorization cookie is HttpOnly; the server hook reads it and
  // passes it here via the root +layout.server.ts. apiFetch will then use
  // the JWT for Authorization: Bearer auth instead of x-dev-token.
  //
  // Fix (JWT race): use $effect.pre so the JWT is seeded BEFORE the DOM
  // update and before any child component's onMount fires. With plain $effect
  // the seed runs after children mount, causing the first apiFetch call
  // (from onMount in the Today page etc.) to see null and throw.
  $effect.pre(() => {
    // Always call seed (even with null) so the ready promise resolves.
    accessJwtStore.seed(data.accessJwt ?? null);
  });
</script>

{@render children?.()}

<!-- Globally mounted: shows when a new SW version is ready (registerType='prompt'). -->
<PWAUpdatePrompt />
