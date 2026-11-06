/**
 * D1 query-count instrumentation.
 *
 * Wraps a D1Database in a Proxy that increments a per-label counter on every
 * .prepare() and .batch() call. flushInstrumentation(label) logs the counts
 * and resets. Always-on in production - one console.log per generateDailyInternal
 * is effectively free.
 *
 * Watch threshold: 40 round-trips. If the count stays above 40 across 3
 * consecutive daily generations, batching getClosestToThreshold into a single
 * GROUP BY query is the first optimization to make.
 *
 * Proxy approach (vs explicit per-site counters): zero changes to call sites;
 * counts ANY future D1 use automatically; trivial self-removal (delete file +
 * revert the wrap in index.ts).
 */

interface Counters {
  prepareCount: number;
  batchCount: number;
}

const labelCounters = new Map<string, Counters>();

function getOrInit(label: string): Counters {
  let c = labelCounters.get(label);
  if (!c) {
    c = { prepareCount: 0, batchCount: 0 };
    labelCounters.set(label, c);
  }
  return c;
}

export function instrumentD1(db: D1Database, label: string): D1Database {
  return new Proxy(db, {
    get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver);
      if (prop === 'prepare') {
        const counters = getOrInit(label);
        return function (query: string) {
          counters.prepareCount++;
          return (orig as (q: string) => unknown).call(target, query);
        };
      }
      if (prop === 'batch') {
        const counters = getOrInit(label);
        return function (stmts: unknown[]) {
          counters.batchCount++;
          return (orig as (s: unknown[]) => unknown).call(target, stmts);
        };
      }
      return typeof orig === 'function'
        ? (orig as (...args: unknown[]) => unknown).bind(target)
        : orig;
    },
  }) as D1Database;
}

export function flushInstrumentation(label: string): { prepareCount: number; batchCount: number } {
  const c = getOrInit(label);
  const snapshot = { ...c };
  // Compact one-line format for easy grep in Cloudflare worker logs
  console.log(
    `[D1] ${label}: ${snapshot.prepareCount} prepare + ${snapshot.batchCount} batch round-trips`,
  );
  c.prepareCount = 0;
  c.batchCount = 0;
  return snapshot;
}
