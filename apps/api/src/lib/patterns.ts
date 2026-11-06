import type { DetectedPattern, PillarId } from '../do/state';
import {
  CONSISTENCY_STREAK_DAYS,
  LOW_ENGAGEMENT_RATE,
  LOW_ENGAGEMENT_MIN_ASSIGNED,
  SIGNIFICANT_DROP_POINTS,
  LOCK_IN_WEEKS,
  PATTERN_TTL_DAYS,
  PATTERN_MIN_CONFIDENCE,
  PATTERN_MAX_COUNT,
  DETECTION_MAX_RESULTS_PER_PASS,
} from './patterns/thresholds';
import {
  computeConsistencyConfidence,
  computeLowEngagementConfidence,
  computeRegressionConfidence,
  computeFocusLockInConfidence,
} from './patterns/confidence';

export interface PillarPatternData {
  assigned: number;
  completed: number;
  rate: number; // 0..1
  streakCurrent: number;
}

export interface FocusEntry {
  pillarId: PillarId;
  startedAt: string;
  endedAt: string | null;
}

export interface PatternInput {
  byPillar: Record<PillarId, PillarPatternData>;
  previousByPillar: Record<PillarId, PillarPatternData> | null;
  focusHistory: FocusEntry[];
  now: string;
}

const PILLARS: PillarId[] = ['body', 'mind', 'finance', 'projects'];

export function detectPatterns(input: PatternInput): DetectedPattern[] {
  const out: DetectedPattern[] = [];

  for (const p of PILLARS) {
    const cur = input.byPillar[p];
    const prev = input.previousByPillar?.[p] ?? null;

    if (cur.streakCurrent >= CONSISTENCY_STREAK_DAYS) {
      out.push({
        type: 'consistency_streak',
        description: `${p} consistency pattern detected: ${cur.streakCurrent} consecutive successful days.`,
        confidence: computeConsistencyConfidence({
          streakCurrent: cur.streakCurrent,
          rate: cur.rate,
          assigned: cur.assigned,
        }),
        detectedAt: input.now,
      });
    }

    if (cur.rate < LOW_ENGAGEMENT_RATE && cur.assigned >= LOW_ENGAGEMENT_MIN_ASSIGNED) {
      const pct = Math.round(cur.rate * 100);
      out.push({
        type: 'low_engagement',
        description: `${p} low-engagement pattern: ${cur.completed}/${cur.assigned} quests cleared (${pct}%).`,
        confidence: computeLowEngagementConfidence({
          rate: cur.rate,
          assigned: cur.assigned,
          previousRate: prev?.rate ?? null,
        }),
        detectedAt: input.now,
      });
    }

    if (prev) {
      const dropPts = (prev.rate - cur.rate) * 100;
      if (dropPts > SIGNIFICANT_DROP_POINTS) {
        out.push({
          type: 'regression',
          description: `${p} regression detected: ${Math.round(prev.rate * 100)}% → ${Math.round(cur.rate * 100)}% completion rate.`,
          confidence: computeRegressionConfidence({
            dropPoints: dropPts,
            assigned: cur.assigned,
            previousRate: prev.rate,
          }),
          detectedAt: input.now,
        });
      }
    }
  }

  // focus_lock_in: trailing LOCK_IN_WEEKS entries all same pillar
  const sortedFocus = [...input.focusHistory].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  if (sortedFocus.length >= LOCK_IN_WEEKS) {
    const lastN = sortedFocus.slice(-LOCK_IN_WEEKS);
    const firstPillar = lastN[0]!.pillarId;
    if (lastN.every((f) => f.pillarId === firstPillar)) {
      const consecutive = countTrailingSamePillar(sortedFocus, firstPillar);
      out.push({
        type: 'focus_lock_in',
        description: `Focus lock-in detected: ${firstPillar} pillar held focus for ${consecutive} consecutive periods.`,
        confidence: computeFocusLockInConfidence({
          consecutiveWeeks: consecutive,
          totalWeeks: sortedFocus.length,
        }),
        detectedAt: input.now,
      });
    }
  }

  out.sort((a, b) => b.confidence - a.confidence);
  return out.slice(0, DETECTION_MAX_RESULTS_PER_PASS);
}

function countTrailingSamePillar(sortedFocus: FocusEntry[], pillarId: PillarId): number {
  let n = 0;
  for (let i = sortedFocus.length - 1; i >= 0; i--) {
    if (sortedFocus[i]!.pillarId === pillarId) n++;
    else break;
  }
  return n;
}

// ---------- Lifecycle ----------

export interface PruneOptions {
  now: string;
  ttlDays?: number;
  minConfidence?: number;
  maxCount?: number;
}

/**
 * Lifecycle policy applied after a fresh `detectPatterns` pass.
 *
 * - Merge new detections into existing patterns.
 * - Dedupe by (type + description); newer `detectedAt` wins.
 * - Drop patterns older than TTL (default PATTERN_TTL_DAYS).
 * - Drop patterns below minConfidence (default PATTERN_MIN_CONFIDENCE).
 * - Cap total at maxCount (default PATTERN_MAX_COUNT), keeping highest
 *   confidence then most recent.
 *
 * Without this, state.patterns grows unbounded across weekly bilans,
 * polluting next-day quest-generation context and inflating token cost.
 */
export function prunePatterns(
  existing: DetectedPattern[],
  newDetections: DetectedPattern[],
  options: PruneOptions,
): DetectedPattern[] {
  const ttlDays = options.ttlDays ?? PATTERN_TTL_DAYS;
  const minConfidence = options.minConfidence ?? PATTERN_MIN_CONFIDENCE;
  const maxCount = options.maxCount ?? PATTERN_MAX_COUNT;
  const nowMs = new Date(options.now).getTime();
  const ttlMs = ttlDays * 86_400_000;

  const byKey = new Map<string, DetectedPattern>();
  for (const p of existing) byKey.set(`${p.type}::${p.description}`, p);
  for (const p of newDetections) {
    const key = `${p.type}::${p.description}`;
    const prior = byKey.get(key);
    if (!prior || new Date(p.detectedAt).getTime() >= new Date(prior.detectedAt).getTime()) {
      byKey.set(key, p);
    }
  }

  const filtered = Array.from(byKey.values()).filter((p) => {
    if (p.confidence < minConfidence) return false;
    if (nowMs - new Date(p.detectedAt).getTime() > ttlMs) return false;
    return true;
  });

  filtered.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime();
  });

  return filtered.slice(0, maxCount);
}
