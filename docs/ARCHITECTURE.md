# Architecture

OttoLeveling is a pnpm monorepo with three deployable parts, all on Cloudflare:

| Path                  | Deploys as                           | Role                                                                                                        |
| --------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `apps/web`            | Cloudflare Pages                     | SvelteKit 5 PWA. Mobile first. SSR is off for the app routes; the server part only reads the Access cookie. |
| `apps/api`            | Worker `ottoleveling-api`            | Hono router, the `SystemAgent` Durable Object, two Workflows.                                               |
| `apps/queue-consumer` | Worker `ottoleveling-queue-consumer` | Consumes two queues and calls back into the Durable Object.                                                 |

`migrations/` holds the D1 schema. `prompts/` holds the two LLM prompts, bundled into the API Worker as text.

## Components

```text
 Browser (PWA)
   |  HTTPS, Authorization: Bearer <Cloudflare Access JWT>
   v
 Worker: ottoleveling-api (Hono)
   |-- reads ---------------------> D1 (source of truth)
   |-- cache --------------------->  KV (today's quests, generation status)
   |-- mutations, generation ----> Durable Object: SystemAgent (single instance)
                                     |-- D1 writes
                                     |-- LLM provider (Groq, or mock)
                                     |-- Web Push
                                     |-- alarm queue (one active alarm)
 Workflows (same Worker)
   |-- daily-cycle: one instance per day
   |-- objective-milestone: one instance per dated objective
 Queues
   |-- ottoleveling-llm-jobs  --> queue consumer --> SystemAgent RPC
   |-- ottoleveling-events    --> queue consumer --> SystemAgent RPC
 External APIs: Google Health, Spotify (OAuth, tokens encrypted in D1)
```

The Worker stays thin. Simple reads go straight to D1 or KV. Anything that changes state, or needs the agent's memory, goes through the Durable Object so writes are serialized.

## The Durable Object

`SystemAgent` is addressed with `idFromName('main')`: one instance, one player. It exposes typed RPC methods (`stub.recordCompletion(...)`, `stub.generateDaily(...)`) rather than a `fetch` handler.

Its hot state is one JSON blob in `ctx.storage`: current focus, per-pillar streaks, detected patterns, recent unlocks and auto-completions, LLM call counters, and the queue of scheduled events. D1 remains the source of truth for everything historical; the blob is a cache of derived state plus the scheduler.

Scheduling is an event queue with a single active alarm set to the earliest event. Recurring events:

| Event                        | When (UTC)              | Does                                           |
| ---------------------------- | ----------------------- | ---------------------------------------------- |
| `daily_cycle_spawn`          | 06:00 daily             | Starts the `daily-cycle` Workflow for the date |
| `template_progression_check` | Sunday 19:00            | Applies each template's progression rule       |
| `weekly_bilan`               | Sunday 20:00            | Weekly report                                  |
| `monthly_bilan`              | Last day of month 20:00 | Monthly report                                 |
| `yearly_bilan`               | Dec 31 20:00            | Yearly report                                  |

The class lives in `apps/api/src/index.ts`, next to the Hono app. That file is too long and should be split; see Known limits in the README.

## Daily flow

```text
06:00  DO alarm: daily_cycle_spawn
         |
         v
       Workflow daily-cycle (instance id = date, so it runs once)
         |
         |-- step morning-generation-dispatch
         |     send {type: generate_daily} to ottoleveling-llm-jobs
         |         |
         |         v
         |     queue consumer: KV generation_status = pending
         |         -> SystemAgent.generateDailyFromQueue(date)
         |              1. sweep expired arcs, recompute lifetime stats
         |              2. 18 D1 reads in parallel (objectives, levels, history,
         |                 templates, check-ins, metrics, listening, arcs...)
         |              3. render prompts/quest-generation.md (22 placeholders)
         |              4. LLM call, JSON mode
         |              5. Zod validation; on any failure: inert fallback batch
         |              6. validator: drop quests matching forbidden patterns
         |              7. insert quests in one D1 batch, invalidate KV
         |              8. run auto-completion against today's metrics
         |         -> KV generation_status = ready (or failed)
         |
         |-- sleep until 06:30, step google-health-sync  (via events queue)
         |-- sleep until 06:31, step spotify-sync        (via events queue)
         |-- sleep until 21:00, step evening-bilan-check (Sunday: sends a
         |     generate_bilan_weekly message; the consumer acknowledges it
         |     without processing, the weekly report comes from the DO alarm)
         |-- sleep until 23:59, step close: SystemAgent.workflowCloseDay
               (awards the FOCUS stat when 3+ pillars were completed)

 During the day
   PWA -> POST /api/quests/:id/complete -> SystemAgent.recordCompletion
            completion + xp_event (one D1 batch), streak update,
            achievements, arc progress, stat rewards
```

If the Workflow cannot be created, the alarm falls back to sending the queue message directly; if that fails too, it logs and moves on. Manual regeneration (`POST /api/quests/regenerate`) skips the queue and runs inline so the user gets an immediate answer.

## Where decisions are made

| Concern                                   | Decided by                            | Module                                                              |
| ----------------------------------------- | ------------------------------------- | ------------------------------------------------------------------- |
| XP, levels                                | Code                                  | `lib/xp.ts`: `level = floor(sqrt(xp / 100))`                        |
| Penalties                                 | Code + table                          | `lib/penalty.ts`, `penalty_rules`                                   |
| Streaks                                   | Code                                  | `lib/streak.ts` (days with no assigned quest do not break a streak) |
| Template progression                      | Code                                  | `lib/template-progression.ts`                                       |
| Ranks and titles                          | Code                                  | `lib/titles.ts`                                                     |
| Achievements                              | Code                                  | `lib/achievements/`                                                 |
| Arcs (multi-day quest chains)             | LLM proposes, code accepts or rejects | `lib/arcs/` (caps, expiry)                                          |
| Patterns and confidence                   | Code                                  | `lib/patterns/`                                                     |
| Report statistics                         | Code (SQL)                            | `lib/d1-reads-bilan.ts`                                             |
| Auto-completion                           | Code                                  | `lib/auto-complete/`                                                |
| Calibration signals (HRV, sleep, reading) | Code                                  | `lib/calibration/`                                                  |
| Which quests today, their wording         | LLM                                   | `prompts/quest-generation.md`                                       |
| Report narrative                          | LLM                                   | `prompts/bilan.md`                                                  |
| Forbidden quests                          | Prompt, then code                     | `lib/quest-validator.ts`                                            |

## LLM pipeline

`lib/llm/` defines a two-method provider interface with three implementations: `GroqProvider` (OpenAI-compatible HTTP API), `MockProvider` (fixtures set by tests) and `DevSampleProvider` (a fixed sample batch for local development). `getLLMProvider(env)` picks one from `LLM_PROVIDER` and `ENV`.

The prompt files are Markdown with the prompt inside a fenced block. `extractFencedSection` pulls it out and `renderPrompt` replaces `{KEY}` placeholders. Every placeholder is produced by a pure formatter in `do/generation-context.ts` or `do/bilan-context.ts`, which keeps the prompt inputs unit-testable.

Every response is parsed with Zod (`schemas/llm-response.ts`, `schemas/bilan-response.ts`). A failed call or a failed parse never reaches the user as an error: generation falls back to four observational quests that prescribe no movement, and reports fall back to a narrative built from the deterministic statistics.

After a successful parse, `lib/quest-validator.ts` rereads every quest. Forbidden patterns come from the `Forbidden:` list and `(no X)` asides of `PLAYER_PROFILE`, and from `metadata.contraindicated` on quest templates. A matching quest is replaced by the inert fallback quest of its pillar and the rejection is logged. Matching is lexical.

## Data model

D1 tables, by migration:

| Table                                                 | Role                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `pillars`                                             | The four pillars (seeded)                                                             |
| `objectives`                                          | Goals with deadlines, soft-deletable                                                  |
| `quests`                                              | Generated or manual quests; `generation_id` groups an LLM batch                       |
| `completions`                                         | One result per quest (`completed`, `failed`, `skipped`), with `source` manual or auto |
| `xp_events`                                           | XP ledger; levels are derived from it                                                 |
| `quest_templates`                                     | Recurring quests with progression rules and optional auto-complete rule               |
| `penalty_rules`                                       | XP penalty per difficulty                                                             |
| `focus_periods`, `daily_checkins`, `bilans`           | Focus history, evening check-ins, generated reports                                   |
| `push_subscriptions`                                  | Web Push endpoints                                                                    |
| `lifetime_stats`                                      | Per-pillar all-time totals, recomputed before each generation                         |
| `achievements`                                        | Seeded achievements with trigger configs                                              |
| `quest_arcs`                                          | Multi-day quest chains                                                                |
| `data_sources`, `data_source_tokens`, `daily_metrics` | OAuth state, encrypted tokens, normalized daily metrics                               |
| `library_save_events`, `spotify_show_filters`         | Spotify library diff log and per-show filters                                         |
| `stat_rewards`                                        | Per-completion stat points (END, STR, INT...) for the stats radar                     |
| `active_projects`                                     | Personal projects the projects pillar may draw from                                   |
| `llm_jobs_dlq`, `events_dlq`                          | Dead-letter records from the queues                                                   |
| `objective_workflow_state`                            | Progress of objective-milestone Workflow instances                                    |

There is no `users` table.

## Auth

Production: the Pages domain sits behind a Cloudflare Access application. Access sets the `CF_Authorization` cookie; `hooks.server.ts` reads it and the client sends it as `Authorization: Bearer`. The API Worker is not behind Access: `lib/auth-access.ts` verifies the JWT itself (RS256 against the team's JWKS, cached one hour; checks `aud`, `iss`, `exp` and the allowed email) and answers a generic 403 on any failure.

Outside production (`ENV` is not `production`) the API also accepts a shared `x-dev-token`, compared in constant time. The web client sends it only under `vite dev`.

Public routes: `/api/health`, `/api/push/vapid-key`, and the OAuth `authorize` and `callback` routes (a provider redirect cannot carry headers; the callback is protected by a signed `state`).

## Data sources

`lib/data-sources/` defines a provider interface (`authorize`, `handleCallback`, `refreshTokens`, `syncDaily`) with two implementations.

- **Google Health**: OAuth with PKCE. Daily sync of steps, average heart rate, resting heart rate, HRV and sleep minutes for the previous UTC day. Two metrics use `:dailyRollUp`, three use list endpoints (see `docs/decisions.md`).
- **Spotify**: OAuth with PKCE. Each sync diffs the saved shows, episodes and audiobooks against the stored log and records new saves. It measures saves, not listening.

Tokens are encrypted with AES-GCM-256 before they reach D1. Two sub-keys are derived from `ENCRYPTION_KEY` with HKDF, one for AES and one for the HMAC that signs the OAuth `state`. The provider name is bound to each ciphertext as additional data, and stored values carry a `v1:` version prefix.

## Caching

KV holds `today:<date>` (the Today payload, TTL to midnight UTC) and `generation_status:<date>`. Every mutation that affects Today deletes the key. KV is eventually consistent, so a read right after a write can briefly return the old value.

## Tests

- `apps/api/tests/unit`: pure modules, run in Node.
- `apps/api/tests/integration`: run inside workerd through `@cloudflare/vitest-pool-workers`, with real D1, KV and Durable Object bindings simulated by Miniflare. Migrations are applied before the suite; tables are wiped between tests. The LLM and push providers are mocked.
- `apps/web/tests` and `apps/web/src/**/*.test.ts`: copy modules, Markdown sanitization, component logic.

Prompt tests check that rules and placeholders are present in the prompt text. They cannot check that the model obeys them; the validator is the part that is tested against bad output.
