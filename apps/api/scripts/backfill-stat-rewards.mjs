/**
 * Historical stat rewards backfill caller.
 *
 * Loops POST /api/admin/backfill-stat-rewards until has_more=false.
 * Each batch uses the Groq LLM to extract stat types from quest titles.
 *
 * Usage:
 *   DEV_TOKEN=xxx node apps/api/scripts/backfill-stat-rewards.mjs
 *   DEV_TOKEN=xxx API_URL=http://localhost:8787 node apps/api/scripts/backfill-stat-rewards.mjs
 *
 * Options via env:
 *   API_URL      - defaults to http://localhost:8787 (x-dev-token only works outside production)
 *   DEV_TOKEN    - required; x-dev-token header value
 *   BATCH_SIZE   - number of completions per LLM call (default: 20)
 *   DRY_RUN      - if 'true', preview without INSERTs (first batch only)
 */

const url = process.env.API_URL ?? 'http://localhost:8787';
const token = process.env.DEV_TOKEN;
const batchSize = parseInt(process.env.BATCH_SIZE ?? '20', 10);
const dryRun = process.env.DRY_RUN === 'true';

if (!token) {
  console.error('DEV_TOKEN env var is required.');
  process.exit(1);
}

let totalProcessed = 0;
let iteration = 0;

while (true) {
  iteration++;
  const res = await fetch(`${url}/api/admin/backfill-stat-rewards`, {
    method: 'POST',
    headers: {
      'x-dev-token': token,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ batch_size: batchSize, dry_run: dryRun }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Batch ${iteration} failed: HTTP ${res.status}`, text);
    process.exit(1);
  }

  const body = await res.json();

  if (dryRun) {
    console.log('DRY RUN preview:', JSON.stringify(body, null, 2));
    process.exit(0);
  }

  totalProcessed += body.processed ?? 0;
  console.log(`Batch ${iteration}: processed=${body.processed} has_more=${body.has_more}`);

  if (!body.has_more) break;
  if (body.processed === 0) {
    // Safety guard: avoid infinite loop if LLM returns 0 entries but has_more=true
    console.warn('processed=0 but has_more=true - stopping to avoid infinite loop.');
    break;
  }
}

console.log(`Backfill complete. Total completions backfilled: ${totalProcessed}`);
