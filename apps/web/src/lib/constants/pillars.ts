export const PILLARS = [
  { id: 'body', label: 'Body', icon: 'heart' },
  { id: 'mind', label: 'Mind', icon: 'brain' },
  { id: 'finance', label: 'Finance', icon: 'wallet' },
  { id: 'projects', label: 'Projects', icon: 'rocket' },
] as const;

export type PillarId = (typeof PILLARS)[number]['id'];

/**
 * The pillar color is held in CSS custom properties under
 * --color-pillar-{id}. Use the variable directly in templates:
 *
 *   style="color: var(--color-pillar-{id})"
 *
 * No JS helper needed - keeps the color binding in CSS where it belongs.
 */
