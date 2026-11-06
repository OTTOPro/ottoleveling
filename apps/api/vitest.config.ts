import path from 'node:path';
import fs from 'node:fs';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig, defineProject } from 'vitest/config';
import type { Plugin } from 'vite';
import {
  EXAMPLE_DAY_JOB_EXCLUSIONS,
  EXAMPLE_PLAYER_NAME,
  EXAMPLE_PLAYER_PROFILE,
} from './tests/fixtures/player-profile';

/**
 * Vite plugin that loads `*.md` imports as raw strings.
 * Mirrors the behaviour of Wrangler's `[[rules]] type = "Text"` for `*.md` files.
 */
function markdownRawPlugin(): Plugin {
  return {
    name: 'markdown-raw',
    transform(_, id) {
      if (id.endsWith('.md')) {
        const content = fs.readFileSync(id, 'utf-8');
        return { code: `export default ${JSON.stringify(content)};`, map: null };
      }
      return null;
    },
  };
}

export default defineConfig({
  test: {
    projects: [
      // Unit tests run in Node.js - no Workers runtime needed.
      defineProject({
        // markdownRawPlugin mirrors the Wrangler [[rules]] type="Text" glob for *.md.
        plugins: [markdownRawPlugin()],
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      }),

      // Integration tests run inside the Workers runtime via Miniflare.
      defineProject({
        plugins: [
          cloudflareTest(async () => {
            const migrationsPath = path.resolve('../../migrations');
            const migrations = await readD1Migrations(migrationsPath);
            return {
              wrangler: { configPath: './wrangler.toml' },
              // Workflow classes must be declared so miniflare knows their type.
              additionalExports: {
                DailyCycleWorkflow: 'WorkflowEntrypoint',
                ObjectiveMilestoneWorkflow: 'WorkflowEntrypoint',
              },
              miniflare: {
                bindings: {
                  // Not 'production': the x-dev-token path in verifyAccess is
                  // disabled in production, and most tests authenticate with it.
                  ENV: 'test',
                  PLAYER_NAME: EXAMPLE_PLAYER_NAME,
                  PLAYER_PROFILE: EXAMPLE_PLAYER_PROFILE,
                  DAY_JOB_EXCLUSIONS: EXAMPLE_DAY_JOB_EXCLUSIONS,
                  WEB_ORIGIN: 'https://web.example.test',
                  DEV_TOKEN: 'integration-test-token-deadbeef',
                  TEST_MIGRATIONS: migrations,
                  LLM_PROVIDER: 'mock',
                  GROQ_API_KEY: 'unused-test-key',
                  PUSH_PROVIDER: 'mock',
                  VAPID_PUBLIC_KEY: 'BMxx-test-public-key-not-real',
                  VAPID_PRIVATE_KEY: 'xx-test-private-key-not-real',
                  VAPID_SUBJECT: 'mailto:test@example.com',
                  // OAuth and encryption stubs.
                  GOOGLE_HEALTH_CLIENT_ID: 'integration-test-google-health-client-id',
                  GOOGLE_HEALTH_CLIENT_SECRET: 'integration-test-google-health-secret',
                  GOOGLE_HEALTH_REDIRECT_URI:
                    'https://x.test/api/data-sources/google_health/callback',
                  SPOTIFY_CLIENT_ID: 'integration-test-spotify-client-id',
                  SPOTIFY_CLIENT_SECRET: 'integration-test-spotify-secret',
                  SPOTIFY_REDIRECT_URI: 'https://x.test/api/data-sources/spotify/callback',
                  ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
                  // Cloudflare Access JWT validation stubs.
                  CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'test.cloudflareaccess.com',
                  CLOUDFLARE_ACCESS_AUD: 'test-aud-tag',
                  CLOUDFLARE_ACCESS_ALLOWED_EMAIL: 'test@example.com',
                },
              },
            };
          }),
        ],
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['tests/setup-d1.ts'],
          // workerd startup makes some integration tests slow under load.
          // A generous timeout plus retries on CI keeps them from flaking.
          testTimeout: 15_000,
          retry: process.env.CI ? 2 : 0,
        },
      }),
    ],
  },
});
