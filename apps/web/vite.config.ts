import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    SvelteKitPWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      // Filename must match SvelteKit's service worker path
      // (`service-worker.ts`, built as `service-worker.js`). Any other name
      // makes the plugin and SvelteKit register two different paths, one of
      // which does not exist (404).
      filename: 'service-worker.ts',
      // 'prompt' instead of 'autoUpdate' so new SW versions don't silently
      // serve stale chunks across a deploy. The app surfaces the update via
      // <PWAUpdatePrompt> and the user clicks 'Refresh' to activate.
      registerType: 'prompt',
      manifest: {
        name: 'OttoLeveling',
        short_name: 'OttoLeveling',
        description: 'Personal progression system - The System notification interface',
        theme_color: '#0a0e1a',
        background_color: '#0a0e1a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
      },
      injectManifest: {
        globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff2}'],
        globIgnores: [
          '**/node_modules/**/*',
          // Drop non-latin font subsets from precache. Browser still
          // loads on-demand via @font-face unicode-range if a page renders the
          // matching script - we just don't precache them for offline.
          '**/*-greek-*.woff2',
          '**/*-greek-ext-*.woff2',
          '**/*-cyrillic-*.woff2',
          '**/*-cyrillic-ext-*.woff2',
          '**/*-vietnamese-*.woff2',
          '**/*-latin-ext-*.woff2',
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
