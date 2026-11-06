<script lang="ts">
  import type { CalibrationSignals } from '$lib/api/types';

  interface Props {
    signals: CalibrationSignals | null;
  }
  let { signals }: Props = $props();

  /**
   * Maps HRV status to a display string with optional pillar tint color.
   * HRV is a body signal - tinted with --color-pillar-body.
   */
  function hrvLabel(signals: CalibrationSignals): string {
    return signals.hrv.charAt(0).toUpperCase() + signals.hrv.slice(1);
  }

  /**
   * Maps sleep deficit to a display string. Mirrors the sleep wording
   * variants from the format helper (display only - not the full prompt line).
   */
  function sleepLabel(signals: CalibrationSignals): string {
    const s = signals.sleep;
    if (s.status === 'none') return 'None';
    const upper = s.status.toUpperCase();
    const causeStr = s.cause === 'both' ? 'acute + chronic' : s.cause;
    const parts: string[] = [`${upper} (${causeStr}`];
    if (s.previousNightMinutes != null)
      parts.push(`, ${Math.round(s.previousNightMinutes)} min last night`);
    if (s.sevenDayAvgMinutes != null) parts.push(`, ${Math.round(s.sevenDayAvgMinutes)} min avg`);
    return parts.join('') + ')';
  }

  /**
   * Maps reading trend to a display string.
   * Reading is a mind signal - tinted with --color-pillar-mind.
   */
  function readingLabel(signals: CalibrationSignals): string {
    switch (signals.reading) {
      case 'drought':
        return 'Drought';
      case 'engaged':
        return 'Engaged';
      case 'normal':
        return 'Normal';
    }
  }

  /**
   * Severity color for sleep:
   * - severe → var(--color-failure)
   * - mild   → color-mix warning-like (amber-ish via pillar-body tint)
   * - none   → text-muted
   */
  function sleepColor(signals: CalibrationSignals): string {
    if (signals.sleep.status === 'severe') return 'var(--color-failure)';
    if (signals.sleep.status === 'mild') return 'var(--color-pillar-body)';
    return 'var(--color-text-muted)';
  }

  /**
   * HRV color: declining → failure, stable → muted, improving → body tint.
   */
  function hrvColor(signals: CalibrationSignals): string {
    if (signals.hrv === 'declining') return 'var(--color-failure)';
    if (signals.hrv === 'improving') return 'var(--color-pillar-body)';
    return 'var(--color-text-muted)';
  }

  /**
   * Reading color: drought → failure, engaged → mind tint, normal → muted.
   */
  function readingColor(signals: CalibrationSignals): string {
    if (signals.reading === 'drought') return 'var(--color-failure)';
    if (signals.reading === 'engaged') return 'var(--color-pillar-mind)';
    return 'var(--color-text-muted)';
  }
</script>

<section class="space-y-3">
  <h2 class="system-tag text-[11px]">[ CALIBRATION ]</h2>

  {#if signals == null}
    <p class="text-sm text-[color:var(--color-text-secondary)]">
      No calibration data available yet.
    </p>
  {:else}
    <dl class="divide-y divide-[color:var(--color-border-subtle)] text-sm">
      <!-- HRV row - body pillar signal -->
      <div class="grid grid-cols-[auto_1fr] gap-x-4 py-2 items-baseline">
        <dt class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]">
          HRV
        </dt>
        <dd class="num text-[11px] text-right" style="color: {hrvColor(signals)};">
          {hrvLabel(signals)}
          {#if signals.hrvDeltaPct != null && signals.hrv !== 'stable'}
            <span class="text-[10px]">
              ({signals.hrvDeltaPct > 0 ? '+' : ''}{Math.round(signals.hrvDeltaPct * 100)}%)
            </span>
          {/if}
        </dd>
      </div>

      <!-- Sleep row - body pillar signal -->
      <div class="grid grid-cols-[auto_1fr] gap-x-4 py-2 items-baseline">
        <dt class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]">
          Sleep
        </dt>
        <dd class="text-[11px] text-right leading-snug" style="color: {sleepColor(signals)};">
          {sleepLabel(signals)}
        </dd>
      </div>

      <!-- Reading row - mind pillar signal -->
      <div class="grid grid-cols-[auto_1fr] gap-x-4 py-2 items-baseline">
        <dt class="text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)]">
          Reading
        </dt>
        <dd class="num text-[11px] text-right" style="color: {readingColor(signals)};">
          {readingLabel(signals)}
          {#if signals.episodeSaves7dFiltered != null}
            <span class="text-[10px]">
              ({signals.episodeSaves7dFiltered} save{signals.episodeSaves7dFiltered === 1
                ? ''
                : 's'}/7d)
            </span>
          {/if}
        </dd>
      </div>
    </dl>
  {/if}
</section>
