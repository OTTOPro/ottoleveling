import { describe, it, expect } from 'vitest';
import { extractPainFlag, formatYesterdaySummary } from '../../src/lib/yesterday-summary';
import type { PillarId } from '../../src/do/state';

// Helpers to keep test fixtures compact
const allPillars: PillarId[] = ['body', 'mind', 'finance', 'projects'];
const brokenStreaks = (days = 0) => ({
  perPillar: allPillars.map((p) => ({ pillar: p, days, status: 'BROKEN' as const })),
  global: { days, status: 'BROKEN' as const },
});
const maintainedStreaks = (days = 1) => ({
  perPillar: allPillars.map((p) => ({ pillar: p, days, status: 'maintained' as const })),
  global: { days, status: 'maintained' as const },
});

describe('formatYesterdaySummary - with streak status', () => {
  // Case 1 - Zero-completion day: all pillars 0/N, all streaks BROKEN, no pain
  it('zero-completion day renders all-BROKEN streaks + no pain', () => {
    const out = formatYesterdaySummary({
      yesterdayIso: '2026-05-30',
      perPillar: allPillars.map((p) => ({ pillar: p, assigned: 3, completed: 0 })),
      missed: allPillars.map((p) => ({ pillar: p, questTitle: 'q' })),
      checkinPain: null,
      checkinRowExists: true,
      streaks: brokenStreaks(0),
    });
    expect(out).toContain('YESTERDAY (2026-05-30)');
    expect(out).toContain('Body 0/3');
    expect(out).toContain('Mind 0/3');
    expect(out).toContain('BROKEN');
    expect(out).toContain('global-streak');
  });

  // Case 2 - Perfect day: all N/N, all streaks maintained+1d, no pain, NO "Missed:" line
  it('perfect day omits the Missed: line entirely', () => {
    const out = formatYesterdaySummary({
      yesterdayIso: '2026-05-30',
      perPillar: allPillars.map((p) => ({ pillar: p, assigned: 2, completed: 2 })),
      missed: [],
      checkinPain: null,
      checkinRowExists: true,
      streaks: maintainedStreaks(5),
    });
    expect(out).not.toMatch(/^- Missed:/m);
    expect(out).toContain('maintained');
    expect(out).toContain('Body 2/2');
  });

  // Case 3 - Mixed day: some pillars succeeded, others didn't, mixed streak status
  it('mixed day renders heterogeneous streak status across pillars', () => {
    const out = formatYesterdaySummary({
      yesterdayIso: '2026-05-30',
      perPillar: [
        { pillar: 'body', assigned: 3, completed: 2 },
        { pillar: 'mind', assigned: 2, completed: 1 },
        { pillar: 'finance', assigned: 1, completed: 0 },
        { pillar: 'projects', assigned: 1, completed: 1 },
      ],
      missed: [{ pillar: 'finance', questTitle: 'review expenses' }],
      checkinPain: null,
      checkinRowExists: true,
      streaks: {
        perPillar: [
          { pillar: 'body', days: 12, status: 'maintained' },
          { pillar: 'mind', days: 3, status: 'maintained' },
          { pillar: 'finance', days: 0, status: 'BROKEN' },
          { pillar: 'projects', days: 7, status: 'maintained' },
        ],
        global: { days: 5, status: 'maintained' },
      },
    });
    expect(out).toContain('Body 2/3');
    expect(out).toContain('Finance 0/1');
    expect(out).toContain('body-streak 12d maintained');
    expect(out).toContain('finance-streak 0d BROKEN');
    expect(out).toContain('global-streak 5d maintained');
    expect(out).toContain('Missed: Finance "review expenses"');
  });

  // Case 4 - Broken streak day: at least one pillar streak went 0 yesterday, BROKEN flag fires
  it('broken streak day surfaces BROKEN flag for the affected pillar', () => {
    const out = formatYesterdaySummary({
      yesterdayIso: '2026-05-30',
      perPillar: [
        { pillar: 'body', assigned: 3, completed: 0 },
        { pillar: 'mind', assigned: 2, completed: 2 },
        { pillar: 'finance', assigned: 0, completed: 0 },
        { pillar: 'projects', assigned: 1, completed: 1 },
      ],
      missed: [{ pillar: 'body', questTitle: 'glute bridge isometric' }],
      checkinPain: null,
      checkinRowExists: false,
      streaks: {
        perPillar: [
          { pillar: 'body', days: 0, status: 'BROKEN' },
          { pillar: 'mind', days: 4, status: 'maintained' },
          { pillar: 'finance', days: 2, status: 'maintained' },
          { pillar: 'projects', days: 8, status: 'maintained' },
        ],
        global: { days: 0, status: 'BROKEN' },
      },
    });
    expect(out).toContain('body-streak 0d BROKEN');
    expect(out).toContain('global-streak 0d BROKEN');
  });

  // Case 5 - Maintained streak day: pillar succeeded yesterday, streak +1d, maintained flag
  it('maintained streak day renders +1d maintained markers', () => {
    const out = formatYesterdaySummary({
      yesterdayIso: '2026-05-30',
      perPillar: allPillars.map((p) => ({ pillar: p, assigned: 2, completed: 2 })),
      missed: [],
      checkinPain: null,
      checkinRowExists: true,
      streaks: maintainedStreaks(13),
    });
    expect(out).toContain('maintained');
    expect(out).toContain('13d');
  });

  // Case 6 - Check-in pain present: area + severity + side rendered correctly
  it('renders check-in pain area + severity + side', () => {
    const out = formatYesterdaySummary({
      yesterdayIso: '2026-05-30',
      perPillar: allPillars.map((p) => ({ pillar: p, assigned: 1, completed: 1 })),
      missed: [],
      checkinPain: { area: 'shoulder', severity: 'mild', side: 'left' },
      checkinRowExists: true,
      streaks: maintainedStreaks(3),
    });
    expect(out).toContain('Check-in pain:');
    expect(out).toContain('shoulder');
    expect(out).toContain('mild');
    expect(out).toContain('left');
  });

  // Case 7 - Check-in pain absent but row exists: "Check-in pain: none" rendered
  // Design choice: render "none" when checkin row exists but no pain keyword.
  // When no check-in row at all (checkinRowExists=false), render "(no check-in yesterday)".
  it('renders "Check-in pain: none" when check-in present but no pain keyword', () => {
    const out = formatYesterdaySummary({
      yesterdayIso: '2026-05-30',
      perPillar: allPillars.map((p) => ({ pillar: p, assigned: 1, completed: 1 })),
      missed: [],
      checkinPain: null,
      checkinRowExists: true,
      streaks: maintainedStreaks(3),
    });
    expect(out).toMatch(/Check-in pain:\s*none/);
  });

  it('renders "(no check-in yesterday)" when checkinRowExists=false', () => {
    const out = formatYesterdaySummary({
      yesterdayIso: '2026-05-30',
      perPillar: allPillars.map((p) => ({ pillar: p, assigned: 1, completed: 1 })),
      missed: [],
      checkinPain: null,
      checkinRowExists: false,
      streaks: maintainedStreaks(3),
    });
    expect(out).toContain('(no check-in yesterday)');
  });
});

// Supplementary extractPainFlag tests - notes → fragment extraction
describe('extractPainFlag (caller-side keyword extraction)', () => {
  it('matches "douleur" (French)', () => {
    expect(extractPainFlag('douleur au dos ce matin')).toBe('douleur au dos ce matin');
  });

  it.each([
    ['back', 'lower back stiff after the drive'],
    ['dos', 'mal au dos en fin de journée'],
    ['knee', 'knee felt off after the run'],
    ['genou', 'genou sensible dans les escaliers'],
    ['shoulder', 'shoulder tight after swimming'],
    ['épaule', 'épaule raide au réveil'],
    ['tendon', 'achilles tendon sore'],
    ['tendinite', 'tendinite au poignet'],
    ['pain', 'some pain in the wrist'],
  ])('matches "%s"', (word, notes) => {
    const out = extractPainFlag(notes);
    expect(out).not.toBeNull();
    expect(out!.toLowerCase()).toContain(word);
  });

  it.each(['good feedback from the team', 'checked the dosage', 'new backpack'])(
    'does not match a body-area word inside another word: %s',
    (notes) => {
      expect(extractPainFlag(notes)).toBeNull();
    },
  );

  it('returns null for null/empty notes', () => {
    expect(extractPainFlag(null)).toBeNull();
    expect(extractPainFlag('')).toBeNull();
  });

  it('returns null when no keyword match', () => {
    expect(extractPainFlag('felt great, ran 5k')).toBeNull();
  });

  it('truncates long fragments to 60 chars', () => {
    const long = 'back ' + 'x'.repeat(200);
    const out = extractPainFlag(long);
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(60);
  });
});
