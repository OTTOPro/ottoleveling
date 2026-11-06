# Decisions

Six choices that shape the code, with the reason for each.

## 1. Pattern confidence is computed, not asked of the LLM

Reports detect patterns such as a consistency streak, low engagement, a regression or a long focus on one pillar. Each pattern carries a confidence score between 0 and 1. An early version let the model fill that number in. It answered around 0.85 for almost everything, so the field carried no information.

Confidence is now a weighted sum in `apps/api/src/lib/patterns/confidence.ts`: a dominant signal (streak length, how low the rate is, size of the drop) weighs 0.5 to 0.7, sample size weighs 0.2 to 0.3, a corroborating signal makes up the rest, and the result is clamped to [0, 1]. The thresholds live in one file, `thresholds.ts`, and tests import them rather than hard-coding numbers. The weights are judgment calls, not a fitted model: the score orders patterns sensibly, it is not a probability.

## 2. Spotify measures saves, not listens

The plan was to count minutes of podcasts and audiobooks from `/me/player/recently-played`. A probe against the live API showed that endpoint returns music tracks only: episodes and audiobook chapters never appear, and no parameter changes that. `/me/player/currently-playing` sees episodes, but only at the moment of the call.

So the integration diffs the saved library instead. Each daily sync reads saved shows, episodes and audiobooks, compares them with the log in `library_save_events`, and records new saves. A save is a signal of intent, not proof of listening. That limit is stated everywhere the data surfaces: in the prompt placeholder ("saved, not listened"), in a strictness rule that forbids treating a save as completed listening, in the auto-complete notification, and in the UI. If saving stops being part of how the player listens, this integration gives no signal and should be removed.

## 3. Google Health: list endpoints for three of five metrics

Steps and heart rate come from `POST .../dataPoints:dailyRollUp`, which returns one aggregate per day. Resting heart rate and HRV return `UNSUPPORTED_DATA_TYPE_ACTION` on that method (only `list` and `reconcile` are allowed), and sleep is not part of the roll-up union at all. Those three use `GET .../dataPoints` and filter the day on the client.

The response shapes were taken from the API's Discovery document and checked against live responses, because the human documentation hides them. Several are not what one would guess: `steps.countSum` is a string-encoded integer, heart-rate fields are flat (`beatsPerMinuteAvg`), civil dates are nested (`{date: {year, month, day}}`), and the sleep payload is under `sleep.summary.minutesAsleep`. The test fixtures keep those shapes with invented values.

## 4. Lifetime statistics are recomputed before every generation

`lifetime_stats` keeps per-pillar all-time totals: XP, completions, failures, longest streak, highest level, first quest date. The prompt uses them to announce when the player approaches, matches or beats a personal record.

Recomputing monthly was cheaper but wrong: the live streak in the Durable Object would pass the stored record mid-month and the prompt would compare against a stale number. Recomputing at the end of generation was also wrong: today's prompt then saw yesterday's state minus yesterday's last writes. The recompute now runs at the start of `generateDailyInternal`, before the parallel reads. It is idempotent and a failure is logged without stopping generation. There is also an admin endpoint to run it by hand.

## 5. Authentication through Cloudflare Access

The app has one user. An early version shipped a shared token to the browser as a build-time variable, which meant anyone with the bundle had the API key.

Production now relies on Cloudflare Access in front of the Pages domain, with an email allow-list. The API Worker stays on its own domain and verifies the Access JWT itself: RS256 signature against the team's JWKS (cached one hour), audience, issuer, expiry and email. Any failure returns the same generic 403. The shared `x-dev-token` remains for local development and tests, and is refused whenever `ENV` is `production`. This avoids building login, sessions and password storage for a single person; the price is a dependency on Cloudflare Access and some Access configuration for the PWA's static assets (service worker, manifest, icons and `/_app/*` must bypass the login redirect).

## 6. A fallback that prescribes nothing

When the LLM call fails, times out or returns something the schema rejects, the day still needs quests. The fallback batch is four observational quests, one per pillar: note how your body feels, read for ten minutes, review yesterday's expenses, look at yesterday's diff. None prescribes a movement, so none can conflict with a physical constraint the code does not know about. A test asserts that the body fallback contains no exercise keywords.

The same batch now serves the post-generation validator: a quest that matches a forbidden pattern is replaced by the fallback quest of its pillar. A failure on the safety path therefore degrades into something boring rather than something harmful.
