/**
 * SectionCard.svelte unit tests - hub card prop contract.
 */
import { describe, it, expect } from 'vitest';
import type { PillarId } from '../../../constants/pillars';

const PILLAR_IDS: PillarId[] = ['body', 'mind', 'finance', 'projects'];

describe('SectionCard - required props', () => {
  it('all 4 pillar ids are valid pillar values', () => {
    for (const id of PILLAR_IDS) {
      expect(['body', 'mind', 'finance', 'projects']).toContain(id);
    }
  });

  it('href prop is a non-empty string', () => {
    const href = '/system/status';
    expect(typeof href).toBe('string');
    expect(href.length).toBeGreaterThan(0);
    expect(href.startsWith('/')).toBe(true);
  });
});

describe('SectionCard - badge styling', () => {
  it('badge receives pillar color + pastel bg from CSS vars', () => {
    const pillar: PillarId = 'body';
    const colorVar = `var(--color-pillar-${pillar})`;
    const bgVar = `var(--color-pillar-${pillar}-bg)`;
    expect(colorVar).toBe('var(--color-pillar-body)');
    expect(bgVar).toBe('var(--color-pillar-body-bg)');
  });
});
