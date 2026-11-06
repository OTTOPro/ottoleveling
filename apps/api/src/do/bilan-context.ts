import type {
  BilanStatsInput,
  FocusHistoryEntry,
  ObjectiveProgressRow,
  TemplateProgressionRow,
  PreviousBilanRef,
  CheckinsSummary,
  PillarStats,
} from '../lib/d1-reads-bilan';
import type { DetectedPattern, PillarId, SystemAgentState } from './state';
import type { PlayerConfig } from '../lib/player';

const PILLARS: PillarId[] = ['body', 'mind', 'finance', 'projects'];

export type PeriodType = 'weekly' | 'monthly' | 'yearly';

export interface BilanContextInput {
  player: PlayerConfig;
  state: SystemAgentState;
  periodType: PeriodType;
  periodStart: string;
  periodEnd: string;
  periodDays: number;
  stats: BilanStatsInput;
  focusHistory: FocusHistoryEntry[];
  previousBilan: PreviousBilanRef | null;
  detectedPatterns: DetectedPattern[];
  /** Rendered {PERFORMANCE_VS_PHYSIOLOGY} section. */
  performanceVsPhysiology: string;
}

export function buildBilanContext(input: BilanContextInput): Record<string, string> {
  return {
    PLAYER_NAME: input.player.name,
    PLAYER_PROFILE: input.player.profile,
    PERIOD_TYPE: input.periodType,
    PERIOD_START: input.periodStart,
    PERIOD_END: input.periodEnd,
    PERIOD_DAYS: String(input.periodDays),
    GLOBAL_STATS: formatGlobal(input.stats),
    PILLAR_STATS: formatPillarStats(input.stats),
    FOCUS_HISTORY: formatFocusHistory(input.focusHistory),
    OBJECTIVES_PROGRESS: formatObjectives(input.stats.objectivesProgress),
    TEMPLATES_PROGRESS: formatTemplates(input.stats.templatesProgress),
    CHECKINS_SUMMARY: formatCheckins(input.stats.checkinsSummary),
    CURRENT_PATTERNS: formatPatterns(input.detectedPatterns),
    PERFORMANCE_VS_PHYSIOLOGY: input.performanceVsPhysiology,
    PREVIOUS_BILAN: formatPreviousBilan(input.previousBilan),
  };
}

function formatGlobal(s: BilanStatsInput): string {
  const g = s.global;
  return [
    `- total_xp: ${g.total_xp}`,
    `- total_quests: ${g.total_quests}`,
    `- completed: ${g.completed}`,
    `- failed: ${g.failed}`,
    `- skipped: ${g.skipped}`,
    `- completion_rate: ${(g.completion_rate * 100).toFixed(1)}%`,
  ].join('\n');
}

function formatPillarStats(s: BilanStatsInput): string {
  return PILLARS.map((p) => {
    const ps: PillarStats = s.byPillar[p];
    const st = s.streaks[p];
    const pct = (ps.rate * 100).toFixed(0);
    return `- ${p}: ${ps.completed}/${ps.assigned} (${pct}%), xp ${ps.xp}, streak current ${st.current} / longest ${st.longest_in_period}`;
  }).join('\n');
}

function formatFocusHistory(entries: FocusHistoryEntry[]): string {
  if (entries.length === 0) return 'No focus active during period.';
  return entries
    .map((e) => {
      const end = e.endedAt ?? 'ongoing';
      return `- ${e.pillarId} (${e.horizon}): ${e.startedAt.slice(0, 10)} → ${end === 'ongoing' ? 'ongoing' : end.slice(0, 10)}`;
    })
    .join('\n');
}

function formatObjectives(rows: ObjectiveProgressRow[]): string {
  if (rows.length === 0) return 'No active objectives.';
  return rows
    .map((o) => {
      const pct = (o.progress_pct * 100).toFixed(0);
      return `- [id=${o.id}] ${o.title}: ${pct}%, completions this period: ${o.delta_in_period}`;
    })
    .join('\n');
}

function formatTemplates(rows: TemplateProgressionRow[]): string {
  if (rows.length === 0) return 'No active templates.';
  return rows
    .map((t) => {
      const adj = t.adjustments_in_period > 0 ? ` (adjusted this period)` : '';
      const last = t.last_progressed_at ?? 'never';
      return `- [id=${t.template_id}] ${t.title}: current ${t.current_value}, last progressed ${last.slice(0, 10)}${adj}`;
    })
    .join('\n');
}

function formatCheckins(cs: CheckinsSummary): string {
  if (cs.count === 0) return 'No check-ins this period.';
  const avg = cs.avg_energy != null ? `, avg energy ${cs.avg_energy.toFixed(1)}/10` : '';
  const moods = cs.recent_moods.length > 0 ? `, recent moods: ${cs.recent_moods.join(', ')}` : '';
  return `${cs.count} check-ins${avg}${moods}`;
}

function formatPatterns(patterns: DetectedPattern[]): string {
  if (patterns.length === 0) return 'None detected.';
  return patterns
    .map((p) => `- [${p.type}] ${p.description} (confidence ${p.confidence.toFixed(2)})`)
    .join('\n');
}

function formatPreviousBilan(prev: PreviousBilanRef | null): string {
  if (!prev) return 'None';
  const lines: string[] = [
    `Previous ${prev.period_type} bilan ${prev.period_start} → ${prev.period_end}:`,
    `- completion_rate: ${(prev.stats.global.completion_rate * 100).toFixed(1)}%`,
    `- total_xp: ${prev.stats.global.total_xp}`,
  ];
  for (const p of PILLARS) {
    const ps = prev.stats.byPillar[p];
    lines.push(
      `- ${p}: ${(ps.rate * 100).toFixed(0)}% (${ps.completed}/${ps.assigned}), xp ${ps.xp}`,
    );
  }
  return lines.join('\n');
}
