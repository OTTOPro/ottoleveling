// Virtual modules emitted by @vite-pwa/sveltekit at build time.
// The package doesn't ship these declarations itself. Needed for TS to accept
// `import { useRegisterSW } from 'virtual:pwa-register/svelte'`.
//
// Kept in its own ambient .d.ts (no top-level imports/exports) so svelte-check
// picks up the `declare module` blocks. Putting these in app.d.ts didn't work
// because that file has `export {}` which makes it a module - and `declare
// module` only augments the global ambient namespace when in an ambient file.

declare module 'virtual:pwa-register/svelte' {
  import type { Writable } from 'svelte/store';

  export interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: unknown) => void;
  }

  export function useRegisterSW(options?: RegisterSWOptions): {
    needRefresh: Writable<boolean>;
    offlineReady: Writable<boolean>;
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  };
}
