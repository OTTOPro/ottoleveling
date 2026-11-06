import type { AutoCompletion } from './types';
import type { ProviderName } from '../data-sources/types';

const SOURCE_LABEL: Record<ProviderName, string> = {
  spotify: 'Spotify',
  google_health: 'Google Health',
};

const METRIC_LABEL: Record<string, string> = {
  library_saves_episodes: 'library-save activity',
  library_saves_audiobooks: 'library-save activity',
  steps: 'step count',
  sleep_minutes: 'sleep duration',
  heart_rate_avg: 'heart rate average',
  resting_hr: 'resting heart rate',
  hrv_rmssd: 'HRV',
  music_minutes: 'music listening',
};

const DISCLAIMER_BY_SOURCE: Record<ProviderName, (metric_label: string) => string> = {
  spotify: () => 'saves ≠ listened - confirm if quest reflects actual listening',
  google_health: (label) => `based on ${label} data - verify if quest goal matches your intent`,
};

export function metricLabelFor(metric: string): string {
  return METRIC_LABEL[metric] ?? metric;
}

export function sourceLabelFor(source: ProviderName): string {
  return SOURCE_LABEL[source] ?? source;
}

export function disclaimerFor(source: ProviderName, metricLabel: string): string {
  const fn = DISCLAIMER_BY_SOURCE[source];
  return fn ? fn(metricLabel) : '';
}

/**
 * Auto-completion notification format. LOCKED by sentinel tests. Every
 * notification carries a per-source disclaimer; the Spotify one restates
 * "saves ≠ listened" (see the PODCAST_LISTENING_SEMANTICS prompt rule).
 *
 * This module mirrors apps/web/src/lib/utils/auto-complete-format.ts.
 * Both modules MUST produce identical output for identical input.
 *
 * Format:
 *   [ AUTO-COMPLETED ] {quest_title} validated by {source_label} {metric_label} ({disclaimer})
 */
export function describeAutoCompletion(a: AutoCompletion): string {
  const source = a.rule.source;
  const mLabel = metricLabelFor(a.rule.metric);
  const srcLabel = sourceLabelFor(source);
  const disclaimer = disclaimerFor(source, mLabel);
  return `[ AUTO-COMPLETED ] ${a.quest_title} validated by ${srcLabel} ${mLabel} (${disclaimer})`;
}
