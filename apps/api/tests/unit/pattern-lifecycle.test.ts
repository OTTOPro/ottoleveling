import { describe, it, expect } from 'vitest';
import { prunePatterns } from '../../src/lib/patterns';
import {
  PATTERN_TTL_DAYS,
  PATTERN_MIN_CONFIDENCE,
  PATTERN_MAX_COUNT,
} from '../../src/lib/patterns/thresholds';
import type { DetectedPattern } from '../../src/do/state';

const NOW = '2026-05-31T20:00:00.000Z';
const NOW_MS = new Date(NOW).getTime();

function p(
  opts: Partial<DetectedPattern> & { type: string; description: string },
): DetectedPattern {
  return {
    confidence: 0.8,
    detectedAt: NOW,
    ...opts,
  };
}

describe('prunePatterns', () => {
  it('drops patterns older than TTL', () => {
    const tooOld = new Date(NOW_MS - (PATTERN_TTL_DAYS + 1) * 86_400_000).toISOString();
    const inWindow = new Date(NOW_MS - (PATTERN_TTL_DAYS - 1) * 86_400_000).toISOString();
    const out = prunePatterns(
      [
        p({ type: 'consistency_streak', description: 'old', detectedAt: tooOld }),
        p({ type: 'consistency_streak', description: 'fresh', detectedAt: inWindow }),
      ],
      [],
      { now: NOW },
    );
    expect(out.map((x) => x.description)).toEqual(['fresh']);
  });

  it('drops patterns below min confidence', () => {
    const out = prunePatterns(
      [
        p({
          type: 'low_engagement',
          description: 'strong',
          confidence: PATTERN_MIN_CONFIDENCE + 0.1,
        }),
        p({
          type: 'low_engagement',
          description: 'weak',
          confidence: PATTERN_MIN_CONFIDENCE - 0.01,
        }),
      ],
      [],
      { now: NOW },
    );
    expect(out.map((x) => x.description)).toEqual(['strong']);
  });

  it('dedupes by (type + description), newer detectedAt wins', () => {
    const older = '2026-05-01T00:00:00.000Z';
    const newer = '2026-05-20T00:00:00.000Z';
    const out = prunePatterns(
      [
        p({
          type: 'consistency_streak',
          description: 'mind 9 days',
          confidence: 0.6,
          detectedAt: older,
        }),
      ],
      [
        p({
          type: 'consistency_streak',
          description: 'mind 9 days',
          confidence: 0.9,
          detectedAt: newer,
        }),
      ],
      { now: NOW },
    );
    expect(out.length).toBe(1);
    expect(out[0]!.confidence).toBe(0.9);
    expect(out[0]!.detectedAt).toBe(newer);
  });

  it(`caps at ${PATTERN_MAX_COUNT}, keeping highest confidence`, () => {
    const existing: DetectedPattern[] = [];
    for (let i = 0; i < PATTERN_MAX_COUNT + 5; i++) {
      existing.push(
        p({ type: 'consistency_streak', description: `p${i}`, confidence: 0.6 + i * 0.01 }),
      );
    }
    const out = prunePatterns(existing, [], { now: NOW });
    expect(out.length).toBe(PATTERN_MAX_COUNT);
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1]!.confidence).toBeGreaterThanOrEqual(out[i]!.confidence);
    }
  });

  it('merging empty new detections returns pruned existing', () => {
    const out = prunePatterns(
      [p({ type: 'low_engagement', description: 'finance 1/8', confidence: 0.7 })],
      [],
      { now: NOW },
    );
    expect(out.length).toBe(1);
  });

  it('empty existing + new detections → returns pruned new', () => {
    const out = prunePatterns(
      [],
      [p({ type: 'low_engagement', description: 'finance 1/8', confidence: 0.7 })],
      { now: NOW },
    );
    expect(out.length).toBe(1);
  });

  it('all empty → empty output', () => {
    expect(prunePatterns([], [], { now: NOW })).toEqual([]);
  });
});
