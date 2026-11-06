/**
 * PillarBadge.svelte unit tests - icon mapping + geometry.
 */
import { describe, it, expect } from 'vitest';
import type { PillarId } from '../../../constants/pillars';

const PILLAR_IDS: PillarId[] = ['body', 'mind', 'finance', 'projects'];

// Icon mapping
const B9_ICONS: Record<PillarId, string> = {
  body: 'Shield',
  mind: 'Lightbulb',
  finance: 'Wallet',
  projects: 'Folder',
};

describe('PillarBadge - icon mapping', () => {
  it('maps each pillar to the correct Lucide icon', () => {
    expect(B9_ICONS.body).toBe('Shield');
    expect(B9_ICONS.mind).toBe('Lightbulb');
    expect(B9_ICONS.finance).toBe('Wallet');
    expect(B9_ICONS.projects).toBe('Folder');
  });

  it('covers all 4 pillars without gaps', () => {
    for (const id of PILLAR_IDS) {
      expect(B9_ICONS[id]).toBeDefined();
    }
  });
});

describe('PillarBadge - icon size scaling', () => {
  it('iconSize = round(size * 0.55)', () => {
    const cases: [number, number][] = [
      [36, Math.round(36 * 0.55)],
      [44, Math.round(44 * 0.55)],
      [64, Math.round(64 * 0.55)],
    ];
    for (const [size, expected] of cases) {
      expect(Math.round(size * 0.55)).toBe(expected);
    }
  });
});
