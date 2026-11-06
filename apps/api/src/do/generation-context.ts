import type { ObjectiveRow } from '../lib/d1';
import type {
  PillarLevel,
  PillarPerformance,
  TemplateForDay,
  CheckinSummary,
} from '../lib/d1-reads';
import type { CurrentFocus, DetectedPattern, PillarId, SystemAgentState } from './state';
import type { PillarStreak } from '../lib/streak';
import { formatLifetimeSnapshot, type LifetimeStatsRow } from '../lib/lifetime-stats';
import { formatTitlesSnapshot } from '../lib/titles';
import { formatRecentAchievementsSnapshot } from '../lib/achievements/evaluate';
import type { AchievementRow, ClosestAchievement } from '../lib/achievements/types';
import { formatActiveArcsSnapshot } from '../lib/arcs/format';
import type { ArcRow } from '../lib/arcs/types';
import { formatObjectiveMetricsSnapshot } from '../lib/data-sources/format';
import type { MetricSummary } from '../lib/data-sources/types';
import type { LibrarySaveSummary } from '../lib/data-sources/library-save-events';
import {
  formatYesterdaySummary,
  extractPainFlag,
  PAIN_AREA_REGEX,
  type YesterdaySummaryInput,
} from '../lib/yesterday-summary';
import { formatCalibrationSignals } from '../lib/calibration/format';
import type { CalibrationSignals } from '../lib/calibration/types';
import type { ActiveProjectRow } from '../lib/active-projects';
import { formatDayJobExclusions, type PlayerConfig } from '../lib/player';

const DAY_NAMES: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

export function dayOfWeekFromIso(today: string): string {
  const d = new Date(today + 'T00:00:00Z');
  return DAY_NAMES[d.getUTCDay()] ?? 'Unknown';
}

export interface GenerationContextInput {
  player: PlayerConfig;
  state: SystemAgentState;
  today: string;
  // Show URIs the user excluded; filtered out of {CURRENT_LISTENING}.
  excludedShowUris?: Set<string>;
  activeObjectives: ObjectiveRow[];
  pillarLevels: PillarLevel[];
  recentPerformance: PillarPerformance[];
  activeTemplates: TemplateForDay[];
  latestCheckin: CheckinSummary | null;
  lifetimeStats: LifetimeStatsRow[];
  pillarLevelsForTitles: Record<PillarId, number>;
  recentAchievements: AchievementRow[];
  closestToThreshold: ClosestAchievement[];
  activeArcs: ArcRow[];
  objectiveMetrics: Record<PillarId, MetricSummary[]>;
  currentListening: LibrarySaveSummary[];
  // {YESTERDAY_SUMMARY} inputs
  yesterdayIso: string;
  yesterdayPerPillar: { pillar: PillarId; completed: number; assigned: number }[];
  yesterdayMissed: { pillar: PillarId; questTitle: string }[];
  yesterdayCheckinNotes: string | null;
  yesterdayCheckinRowExists: boolean;
  // {CALIBRATION_SIGNALS} input
  calibrationSignals?: CalibrationSignals | null;
  // {ACTIVE_PROJECTS} input
  activeProjects: ActiveProjectRow[];
}

export function buildGenerationContext(input: GenerationContextInput): Record<string, string> {
  // Derive per-pillar + global streak status for {YESTERDAY_SUMMARY}.
  // Does NOT re-derive streak counts - reads them directly from state.streaks (mutated
  // by lib/streak.ts after recordCompletion). Only derives the maintained/BROKEN flag.
  const pillarsAll: PillarId[] = ['body', 'mind', 'finance', 'projects'];
  const yesterdayIso = input.yesterdayIso;

  const perPillarStreakStatus = pillarsAll.map((pillar) => {
    const s = input.state.streaks[pillar];
    const counts = input.yesterdayPerPillar.find((p) => p.pillar === pillar);
    let status: 'maintained' | 'BROKEN';
    if (s?.lastSuccessDate === yesterdayIso) {
      status = 'maintained';
    } else if (counts !== undefined && counts.assigned > 0 && counts.completed === 0) {
      status = 'BROKEN';
    } else {
      // No quests yesterday for this pillar, or streak live - treat as maintained
      // if there's an active streak, otherwise BROKEN.
      status = (s?.current ?? 0) > 0 ? 'maintained' : 'BROKEN';
    }
    return { pillar, days: s?.current ?? 0, status };
  });

  const globalAssigned = input.yesterdayPerPillar.reduce((sum, p) => sum + p.assigned, 0);
  const globalCompleted = input.yesterdayPerPillar.reduce((sum, p) => sum + p.completed, 0);
  const globalStatus: 'maintained' | 'BROKEN' =
    globalAssigned > 0 && globalCompleted === 0 ? 'BROKEN' : 'maintained';

  // Global streak days: minimum non-zero streak across pillars with any activity, or 0
  const activePillarStreaks = perPillarStreakStatus.filter((s) => s.days > 0);
  const globalDays =
    activePillarStreaks.length > 0 ? Math.min(...activePillarStreaks.map((s) => s.days)) : 0;

  // Build pain object from raw notes (caller passes raw text; extract fragment → structured type)
  let checkinPain: YesterdaySummaryInput['checkinPain'] = null;
  if (input.yesterdayCheckinNotes !== null) {
    const fragment = extractPainFlag(input.yesterdayCheckinNotes);
    if (fragment) {
      const areaMatch = fragment.match(PAIN_AREA_REGEX);
      const area = areaMatch?.[1]?.toLowerCase() ?? 'unspecified';
      const severityMatch = fragment.match(/(severe|moderate|mild)/i);
      const sideMatch = fragment.match(/(left|right|both|gauche|droit)/i);
      const sideMap: Record<string, 'left' | 'right' | 'both'> = {
        left: 'left',
        gauche: 'left',
        right: 'right',
        droit: 'right',
        both: 'both',
      };
      checkinPain = {
        area,
        severity:
          (severityMatch?.[1]?.toLowerCase() as 'mild' | 'moderate' | 'severe' | undefined) ??
          'mild',
        side: sideMatch?.[1] !== undefined ? sideMap[sideMatch[1].toLowerCase()] : undefined,
      };
    }
  }

  return {
    PLAYER_NAME: input.player.name,
    PLAYER_PROFILE: input.player.profile,
    DAY_JOB_EXCLUSIONS: formatDayJobExclusions(input.player.dayJobExclusions),
    CURRENT_DATE: input.today,
    DAY_OF_WEEK: dayOfWeekFromIso(input.today),
    CURRENT_FOCUS: formatFocus(input.state.currentFocus),
    ACTIVE_OBJECTIVES: formatObjectives(input.activeObjectives),
    PILLAR_LEVELS: formatPillarLevels(input.pillarLevels),
    STREAKS: formatStreaks(input.state.streaks),
    RECENT_PERFORMANCE: formatPerformance(input.recentPerformance),
    DETECTED_PATTERNS: formatPatterns(input.state.patterns),
    LAST_CHECKIN: formatCheckin(input.latestCheckin),
    ACTIVE_TEMPLATES: formatTemplates(input.activeTemplates),
    LIFETIME_SNAPSHOT: formatLifetimeSnapshot(input.lifetimeStats),
    CURRENT_TITLES: formatTitlesSnapshot(input.pillarLevelsForTitles),
    RECENT_ACHIEVEMENTS: formatRecentAchievementsSnapshot(
      input.recentAchievements,
      input.closestToThreshold,
    ),
    ACTIVE_ARCS: formatActiveArcsSnapshot(input.activeArcs),
    OBJECTIVE_METRICS: formatObjectiveMetricsSnapshot(input.objectiveMetrics),
    CURRENT_LISTENING: formatCurrentListeningSnapshot(
      input.currentListening,
      input.excludedShowUris,
    ),
    YESTERDAY_SUMMARY: formatYesterdaySummary({
      yesterdayIso,
      perPillar: input.yesterdayPerPillar,
      missed: input.yesterdayMissed,
      checkinPain,
      checkinRowExists: input.yesterdayCheckinRowExists,
      streaks: {
        perPillar: perPillarStreakStatus,
        global: { days: globalDays, status: globalStatus },
      },
    }),
    CALIBRATION_SIGNALS: formatCalibrationSignals(input.calibrationSignals ?? null),
    ACTIVE_PROJECTS: formatActiveProjectsSnapshot(input.activeProjects),
  };
}

function formatFocus(focus: CurrentFocus | null): string {
  if (!focus) return 'None';
  const startedDate = focus.startedAt.slice(0, 10);
  return `Pillar: ${focus.pillarId}, Horizon: ${focus.horizon}, started: ${startedDate}`;
}

function formatObjectives(objectives: ObjectiveRow[]): string {
  if (objectives.length === 0) return 'No active objectives.';
  return objectives
    .map((o) => {
      const metric = o.target_metric ? `, metric: ${o.target_metric}` : '';
      const target = o.target_value != null ? `, target: ${o.target_value}` : '';
      return `- [id=${o.id}] [${o.pillar_id}] ${o.title} (deadline: ${o.target_date}${metric}${target})`;
    })
    .join('\n');
}

function formatPillarLevels(levels: PillarLevel[]): string {
  return levels
    .map(
      (l) =>
        `- ${l.pillarId}: level ${l.level} (${l.xp} XP, ${l.xpToNext - Math.max(0, l.xp)} to next)`,
    )
    .join('\n');
}

function formatStreaks(streaks: Record<PillarId, PillarStreak>): string {
  const pillars: PillarId[] = ['body', 'mind', 'finance', 'projects'];
  return pillars
    .map((p) => {
      const s = streaks[p];
      const last = s.lastSuccessDate ?? 'never';
      return `- ${p}: current ${s.current}, longest ${s.longest}, last success ${last}`;
    })
    .join('\n');
}

function formatPerformance(perf: PillarPerformance[]): string {
  return perf
    .map((p) => {
      const pct = (p.rate * 100).toFixed(0);
      return `- ${p.pillarId}: ${p.completed}/${p.assigned} (${pct}%)`;
    })
    .join('\n');
}

function formatPatterns(patterns: DetectedPattern[]): string {
  if (patterns.length === 0) return 'None detected yet.';
  return patterns
    .map((p) => `- [${p.type}] ${p.description} (confidence ${p.confidence.toFixed(2)})`)
    .join('\n');
}

function formatCheckin(checkin: CheckinSummary | null): string {
  if (!checkin) return 'None';
  const parts: string[] = [`${checkin.date}`];
  if (checkin.energyLevel != null) parts.push(`energy ${checkin.energyLevel}/10`);
  if (checkin.mood) parts.push(`mood: ${checkin.mood}`);
  if (checkin.notes) parts.push(`notes: "${checkin.notes}"`);
  return parts.join(', ');
}

function formatTemplates(templates: TemplateForDay[]): string {
  if (templates.length === 0) return 'None active for today.';
  return templates
    .map(
      (t) =>
        `- [id=${t.id}] [${t.pillarId}] ${t.title} (current ${t.currentValue} ${t.baseMetric}, ${t.difficulty}, ${t.baseXp} XP)`,
    )
    .join('\n');
}

/**
 * Renders the {CURRENT_LISTENING} placeholder.
 *
 * CRITICAL - "saved ≠ listened" disclaimer is mandatory.
 *
 * Format spec:
 *   - Max 3 entries shown; drop entries with fewest saves_in_window if 4+ passed in.
 *   - Episode format: `- "Show Name" · saved N new episode(s) today (saved ≠ listened)`
 *   - Audiobook format: `- "Book Title" by Author · saved to library today`
 *   - Weekly aggregate footer (rendered when 2+ entries total):
 *     `- Library activity: +N podcast episodes, +M audiobooks this week`
 *   - Empty state: `(no podcast/audiobook library activity today)`
 *
 * The format helper MUST NEVER emit any "min today" or minute-listened number:
 * Spotify's /me/player/recently-played returns only music tracks
 * (track.type === 'track'); podcast episodes and audiobook chapters never
 * appear there, so the integration diffs the saved library instead and has no
 * listening-time data. Unit tests enforce this via
 * `expect(out).not.toMatch(/\d+\s*min today/)`.
 *
 * Accepts an optional excludedShowUris set. When provided, items whose show_or_book_spotify_uri is in the set are dropped
 * from the rendered output. If filtering reduces the list to zero entries,
 * the empty-state string is returned.
 */
export function formatCurrentListeningSnapshot(
  items: LibrarySaveSummary[],
  excludedShowUris?: Set<string>,
): string {
  // Filter excluded shows. Forward-only: past prompts are never rewritten.
  const filtered =
    excludedShowUris != null && excludedShowUris.size > 0
      ? items.filter(
          (it) =>
            it.show_or_book_spotify_uri == null ||
            !excludedShowUris.has(it.show_or_book_spotify_uri),
        )
      : items;

  if (filtered.length === 0) return '(no podcast/audiobook library activity today)';

  const sorted = [...filtered].sort((a, b) => b.saves_in_window - a.saves_in_window).slice(0, 3);

  const lines = sorted.map((it) => {
    if (it.listening_type === 'episode_save') {
      return `- "${it.show_or_book_title}" · saved ${it.saves_in_window} new episode(s) today (saved ≠ listened)`;
    }
    const byPart = it.show_or_book_author ? ` by ${it.show_or_book_author}` : '';
    return `- "${it.show_or_book_title}"${byPart} · saved to library today`;
  });

  const totalEpisodes = filtered
    .filter((i) => i.listening_type === 'episode_save')
    .reduce((acc, i) => acc + i.saves_in_window, 0);
  const totalAudiobooks = filtered
    .filter((i) => i.listening_type === 'audiobook_save')
    .reduce((acc, i) => acc + i.saves_in_window, 0);

  if (filtered.length >= 2) {
    lines.push(
      `- Library activity: +${totalEpisodes} podcast episodes, +${totalAudiobooks} audiobooks this week`,
    );
  }

  return lines.join('\n');
}

/**
 * Renders the {ACTIVE_PROJECTS} placeholder.
 * Mirrors formatActiveProjectsPlaceholder in lib/active-projects.ts but
 * operates on pre-fetched rows (avoids an extra D1 round-trip from the context builder).
 */
function formatActiveProjectsSnapshot(projects: ActiveProjectRow[]): string {
  const active = projects.filter((p) => p.status === 'active' && p.deleted_at === null);
  if (active.length === 0) return '(no active personal projects)';
  const lines = active.map((p) => {
    const ageHours = Math.floor((Date.now() - new Date(p.start_date + 'Z').getTime()) / 3_600_000);
    const ageStr = ageHours < 24 ? `${ageHours}h` : `${Math.floor(ageHours / 24)}d`;
    return `- **${p.name}** (pillar: ${p.pillar}, priority: ${p.priority}/10, age: ${ageStr})${p.description ? ` - ${p.description}` : ''}`;
  });
  return lines.join('\n');
}
