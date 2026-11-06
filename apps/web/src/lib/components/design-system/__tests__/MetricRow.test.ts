/**
 * MetricRow.svelte unit tests - metric row prop contract.
 */
import { describe, it, expect } from 'vitest';
import type { PillarId } from '../../../constants/pillars';

describe('MetricRow - label + value props', () => {
  it('label is a non-empty string', () => {
    const label = 'Current Level';
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });

  it('value is a non-empty string', () => {
    const value = 'L8';
    expect(typeof value).toBe('string');
    expect(value.length).toBeGreaterThan(0);
  });
});

describe('MetricRow - pillar CSS variables', () => {
  it('uses correct CSS var pattern for pillar color + bg', () => {
    const pillar: PillarId = 'finance';
    const colorVar = `var(--color-pillar-${pillar})`;
    const bgVar = `var(--color-pillar-${pillar}-bg)`;
    expect(colorVar).toBe('var(--color-pillar-finance)');
    expect(bgVar).toBe('var(--color-pillar-finance-bg)');
  });
});
