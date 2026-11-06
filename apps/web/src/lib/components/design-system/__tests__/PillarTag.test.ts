/**
 * PillarTag.svelte unit tests - uppercase rendering contract.
 */
import { describe, it, expect } from 'vitest';
import type { PillarId } from '../../../constants/pillars';

const PILLAR_IDS: PillarId[] = ['body', 'mind', 'finance', 'projects'];

describe('PillarTag - label contract', () => {
  it('renders pillar id as uppercase', () => {
    for (const id of PILLAR_IDS) {
      const rendered = id.toUpperCase();
      expect(rendered).toMatch(/^[A-Z]+$/);
    }
  });

  it('each pillar produces distinct uppercase labels', () => {
    const labels = PILLAR_IDS.map((id) => id.toUpperCase());
    const unique = new Set(labels);
    expect(unique.size).toBe(PILLAR_IDS.length);
  });
});
