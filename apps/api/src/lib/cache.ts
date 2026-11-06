/**
 * KV cache helpers for today's quests. Single source for key construction
 * + TTL math + invalidation, so route handlers and DO methods stay in sync.
 */

export function cacheKeyForToday(date: string): string {
  // date is YYYY-MM-DD; key namespace: "today:"
  return `today:${date}`;
}

/**
 * Seconds remaining until the next UTC midnight. Used as KV expirationTtl
 * so cached today's-quests auto-expire at day rollover.
 * Returns a minimum of 60s to avoid bizarre near-midnight edge cases
 * (KV rejects TTLs under 60 seconds anyway).
 */
export function secondsUntilMidnightUtc(now: Date = new Date()): number {
  const nextMidnight = new Date(now);
  nextMidnight.setUTCHours(24, 0, 0, 0);
  const diff = Math.floor((nextMidnight.getTime() - now.getTime()) / 1000);
  return Math.max(60, diff);
}

/**
 * Delete the today cache for the given date (or today if omitted).
 * Call after any mutation that affects today's quests.
 */
export async function invalidateTodayCache(kv: KVNamespace, date?: string): Promise<void> {
  const d = date ?? new Date().toISOString().slice(0, 10);
  await kv.delete(cacheKeyForToday(d));
}
