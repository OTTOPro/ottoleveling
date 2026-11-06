import type { ArcRow } from './types';

/**
 * Renders the {ACTIVE_ARCS} placeholder. One line per active arc with the
 * stable [arc N] handle so the LLM can reference it in reasoning + tag
 * continuation quests with arc_id: N.
 */
export function formatActiveArcsSnapshot(arcs: ArcRow[]): string {
  const active = arcs.filter((a) => a.status === 'active');
  if (active.length === 0) return 'None active.';
  return active
    .map((a) => {
      const endDate = a.expected_end ? a.expected_end.slice(0, 10) : '-';
      return `- [arc ${a.id}] ${a.pillar_id} · ${a.title} · ${a.completed_steps}/${a.total_steps} steps · ends ${endDate}`;
    })
    .join('\n');
}
