import { describe, it, expect } from 'vitest';
import {
  evaluateProgression,
  type TemplateForProgression,
  type RecentAttempts,
} from '../../src/lib/template-progression';

function tpl(partial: Partial<TemplateForProgression> = {}): TemplateForProgression {
  return {
    current_value: 20,
    starting_value: 20,
    progression_rule: { type: 'none' },
    ...partial,
  };
}

describe('evaluateProgression - none', () => {
  it('always returns action:none', () => {
    const d = evaluateProgression(tpl({ progression_rule: { type: 'none' } }), {
      total: 30,
      successful: 30,
    });
    expect(d.action).toBe('none');
  });
});

describe('evaluateProgression - linear', () => {
  const rule = { type: 'linear' as const, step: 5, after_successes: 14 };

  it('below threshold → none', () => {
    const d = evaluateProgression(tpl({ progression_rule: rule }), { total: 13, successful: 13 });
    expect(d.action).toBe('none');
  });

  it('exactly at threshold → progress', () => {
    const d = evaluateProgression(tpl({ progression_rule: rule, current_value: 20 }), {
      total: 14,
      successful: 14,
    });
    expect(d.action).toBe('progress');
    if (d.action === 'progress') expect(d.newValue).toBe(25);
  });

  it('above threshold → still single step (one progression per evaluation)', () => {
    const d = evaluateProgression(tpl({ progression_rule: rule, current_value: 20 }), {
      total: 50,
      successful: 30,
    });
    expect(d.action).toBe('progress');
    if (d.action === 'progress') expect(d.newValue).toBe(25);
  });

  it('counts only successful - high total but low successful → none', () => {
    const d = evaluateProgression(tpl({ progression_rule: rule }), { total: 20, successful: 5 });
    expect(d.action).toBe('none');
  });
});

describe('evaluateProgression - hybrid', () => {
  const rule = {
    type: 'hybrid' as const,
    min_successes: 10,
    success_threshold: 0.8,
    step: 5,
    regression_threshold: 0.5,
    regression_step: -3,
  };

  it('insufficient data (total < min_successes) → none', () => {
    const d = evaluateProgression(tpl({ progression_rule: rule }), { total: 8, successful: 8 });
    expect(d.action).toBe('none');
  });

  it('high success rate, sufficient data → progress', () => {
    const d = evaluateProgression(tpl({ progression_rule: rule, current_value: 20 }), {
      total: 10,
      successful: 9,
    });
    expect(d.action).toBe('progress');
    if (d.action === 'progress') expect(d.newValue).toBe(25);
  });

  it('exactly at success_threshold → progress', () => {
    const d = evaluateProgression(tpl({ progression_rule: rule, current_value: 20 }), {
      total: 10,
      successful: 8,
    });
    expect(d.action).toBe('progress');
  });

  it('mid range (above regression, below success) → none', () => {
    const d = evaluateProgression(tpl({ progression_rule: rule }), { total: 10, successful: 6 });
    expect(d.action).toBe('none');
  });

  it('at regression_threshold exactly → regress', () => {
    const d = evaluateProgression(tpl({ progression_rule: rule, current_value: 25 }), {
      total: 10,
      successful: 5,
    });
    expect(d.action).toBe('regress');
    if (d.action === 'regress') expect(d.newValue).toBe(22);
  });

  it('regression caps at starting_value (no descent below baseline)', () => {
    const d = evaluateProgression(
      tpl({ progression_rule: rule, current_value: 21, starting_value: 20 }),
      { total: 10, successful: 0 },
    );
    expect(d.action).toBe('regress');
    if (d.action === 'regress') expect(d.newValue).toBe(20); // floored
  });

  it('regression_step of 0 → no descent', () => {
    const zeroReg = { ...rule, regression_step: 0 };
    const d = evaluateProgression(tpl({ progression_rule: zeroReg, current_value: 25 }), {
      total: 10,
      successful: 0,
    });
    expect(d.action).toBe('none');
  });
});

describe('evaluateProgression - unknown rule type', () => {
  it('returns none with reason mentioning unknown', () => {
    const d = evaluateProgression(
      tpl({
        progression_rule: {
          type: 'magic',
        } as unknown as TemplateForProgression['progression_rule'],
      }),
      { total: 100, successful: 100 },
    );
    expect(d.action).toBe('none');
    expect(d.reason.toLowerCase()).toContain('unknown');
  });
});

describe('evaluateProgression - empty data', () => {
  it('total=0 → none for all rule types', () => {
    const empty: RecentAttempts = { total: 0, successful: 0 };
    expect(evaluateProgression(tpl({ progression_rule: { type: 'none' } }), empty).action).toBe(
      'none',
    );
    expect(
      evaluateProgression(
        tpl({ progression_rule: { type: 'linear', step: 5, after_successes: 14 } }),
        empty,
      ).action,
    ).toBe('none');
    expect(
      evaluateProgression(
        tpl({
          progression_rule: {
            type: 'hybrid',
            min_successes: 10,
            success_threshold: 0.8,
            step: 5,
            regression_threshold: 0.5,
            regression_step: -3,
          },
        }),
        empty,
      ).action,
    ).toBe('none');
  });
});
