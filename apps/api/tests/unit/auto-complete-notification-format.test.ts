import { describe, it, expect } from 'vitest';
import { describeAutoCompletion } from '../../src/lib/auto-complete/format';
import type { AutoCompletion } from '../../src/lib/auto-complete/types';

describe('describeAutoCompletion - per-source disclaimer sentinel', () => {
  it('Spotify library-save trigger renders the "saves ≠ listened" disclaimer verbatim', () => {
    const ac: AutoCompletion = {
      id: 'ac1',
      quest_id: 1,
      quest_title: 'Apprentissage quotidien',
      pillar_id: 'mind',
      rule: {
        type: 'metric_threshold',
        metric: 'library_saves_episodes',
        source: 'spotify',
        threshold: 1,
      },
      metric_value: 2,
      fired_at: '2026-05-31T05:31:42Z',
    };
    const text = describeAutoCompletion(ac);
    expect(text).toContain('Apprentissage quotidien');
    expect(text).toContain('Spotify library-save activity');
    expect(text).toContain('saves ≠ listened - confirm if quest reflects actual listening');
  });

  it('Google Health steps trigger renders the "based on step count data" disclaimer verbatim', () => {
    const ac: AutoCompletion = {
      id: 'ac2',
      quest_id: 2,
      quest_title: '10K steps daily',
      pillar_id: 'body',
      rule: {
        type: 'metric_threshold',
        metric: 'steps',
        source: 'google_health',
        threshold: 10000,
      },
      metric_value: 12345,
      fired_at: '2026-05-31T05:30:42Z',
    };
    const text = describeAutoCompletion(ac);
    expect(text).toContain('10K steps daily');
    expect(text).toContain('Google Health step count');
    expect(text).toContain('based on step count data - verify if quest goal matches your intent');
  });

  it('Google Health sleep trigger uses "sleep duration" metric_label', () => {
    const ac: AutoCompletion = {
      id: 'ac3',
      quest_id: 3,
      quest_title: 'Sleep 7h+',
      pillar_id: 'body',
      rule: {
        type: 'metric_threshold',
        metric: 'sleep_minutes',
        source: 'google_health',
        threshold: 420,
      },
      metric_value: 480,
      fired_at: '2026-05-31T05:30:42Z',
    };
    const text = describeAutoCompletion(ac);
    expect(text).toContain('Google Health sleep duration');
    expect(text).toContain(
      'based on sleep duration data - verify if quest goal matches your intent',
    );
  });
});
