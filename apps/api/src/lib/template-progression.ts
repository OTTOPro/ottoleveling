export interface RecentAttempts {
  total: number;
  successful: number;
}

export type ProgressionRule =
  | { type: 'none' }
  | { type: 'linear'; step: number; after_successes: number }
  | {
      type: 'hybrid';
      min_successes: number;
      success_threshold: number;
      step: number;
      regression_threshold: number;
      regression_step: number;
    };

export interface TemplateForProgression {
  current_value: number;
  starting_value: number;
  progression_rule: ProgressionRule;
}

export type ProgressionDecision =
  | { action: 'none'; reason: string }
  | { action: 'progress'; newValue: number; reason: string }
  | { action: 'regress'; newValue: number; reason: string };

export function evaluateProgression(
  template: TemplateForProgression,
  attempts: RecentAttempts,
): ProgressionDecision {
  const rule = template.progression_rule;
  if (!rule || typeof rule !== 'object' || !('type' in rule)) {
    return { action: 'none', reason: 'Invalid progression_rule' };
  }

  switch (rule.type) {
    case 'none':
      return { action: 'none', reason: 'Rule type: none' };

    case 'linear': {
      if (attempts.successful < rule.after_successes) {
        return {
          action: 'none',
          reason: `Linear rule: ${attempts.successful}/${rule.after_successes} successes`,
        };
      }
      return {
        action: 'progress',
        newValue: template.current_value + rule.step,
        reason: `Linear rule fired: ${attempts.successful} successes ≥ ${rule.after_successes} → +${rule.step}`,
      };
    }

    case 'hybrid': {
      if (attempts.total < rule.min_successes) {
        return {
          action: 'none',
          reason: `Hybrid rule: only ${attempts.total}/${rule.min_successes} total attempts`,
        };
      }
      const rate = attempts.successful / attempts.total;

      if (rate >= rule.success_threshold) {
        return {
          action: 'progress',
          newValue: template.current_value + rule.step,
          reason: `Hybrid rule progress: rate ${(rate * 100).toFixed(0)}% ≥ ${(rule.success_threshold * 100).toFixed(0)}% → +${rule.step}`,
        };
      }

      if (rate <= rule.regression_threshold) {
        if (rule.regression_step === 0) {
          return {
            action: 'none',
            reason: `Hybrid rule: rate ${(rate * 100).toFixed(0)}% triggers regression but regression_step=0`,
          };
        }
        const proposed = template.current_value + rule.regression_step; // step is negative
        const floored = Math.max(template.starting_value, proposed);
        return {
          action: 'regress',
          newValue: floored,
          reason: `Hybrid rule regress: rate ${(rate * 100).toFixed(0)}% ≤ ${(rule.regression_threshold * 100).toFixed(0)}% → ${rule.regression_step} (floored at starting_value=${template.starting_value})`,
        };
      }

      return {
        action: 'none',
        reason: `Hybrid rule: rate ${(rate * 100).toFixed(0)}% in mid-band`,
      };
    }

    default:
      return { action: 'none', reason: `Unknown rule type: ${(rule as { type: string }).type}` };
  }
}
