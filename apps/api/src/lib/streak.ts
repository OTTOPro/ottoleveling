export interface PillarStreak {
  current: number;
  longest: number;
  lastSuccessDate: string | null; // YYYY-MM-DD UTC, or null if no success ever
}

export function emptyStreak(): PillarStreak {
  return { current: 0, longest: 0, lastSuccessDate: null };
}

export function yesterdayOf(today: string): string {
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns the streak state after a successful completion on `today`.
 * Rules:
 *  - lastSuccessDate === today  → no change (multiple completions same day)
 *  - lastSuccessDate === yesterday(today) → current += 1
 *  - else → current = 1 (gap or first ever)
 *  - longest = max(longest, current)
 *  - lastSuccessDate = today
 */
export function updateStreak(current: PillarStreak, today: string): PillarStreak {
  if (current.lastSuccessDate === today) return current;
  const nextCurrent = current.lastSuccessDate === yesterdayOf(today) ? current.current + 1 : 1;
  return {
    current: nextCurrent,
    longest: Math.max(current.longest, nextCurrent),
    lastSuccessDate: today,
  };
}

/**
 * Opportunity-aware streak update.
 *
 * A streak is consecutive days with EITHER a successful completion OR no quest
 * assigned at all (neutral). A gap day with assigned quests but no completion
 * → streak resets.
 *
 * @param current - existing streak state
 * @param today - YYYY-MM-DD UTC of the success that triggered this update
 * @param missedOpportunities - count of days strictly between current.lastSuccessDate
 *        and today where ≥1 quest was assigned to this pillar with no successful
 *        completion. Computed by the DO via a D1 query (see countMissedOpportunities
 *        in lib/d1-reads.ts) before calling this fn.
 * @returns new PillarStreak
 */
export function streakWithOpportunityCheck(
  current: PillarStreak,
  today: string,
  missedOpportunities: number,
): PillarStreak {
  if (current.lastSuccessDate === today) return current;
  if (current.lastSuccessDate === null) {
    return { current: 1, longest: Math.max(current.longest, 1), lastSuccessDate: today };
  }
  if (missedOpportunities > 0) {
    return { current: 1, longest: current.longest, lastSuccessDate: today };
  }
  const nextCurrent = current.current + 1;
  return {
    current: nextCurrent,
    longest: Math.max(current.longest, nextCurrent),
    lastSuccessDate: today,
  };
}
