<!--
  apps/web/src/lib/components/PillarBarChart.svelte

  Horizontal bar chart, 4 rows (one per pillar), tinted with the pillar color.
  Pure SVG, no Chart.js. Mobile-first (works at ~340px width).
  No animation.
-->
<script lang="ts">
  import type { PillarId } from '$lib/api/types';
  import PillarIcon from './PillarIcon.svelte';

  interface Row {
    pillarId: PillarId;
    value: number;
    max: number;
    suffix?: string;
  }

  interface Props {
    data: Row[];
    label?: string;
    valueFormatter?: (v: number) => string;
  }

  let { data, label, valueFormatter = (v: number) => String(Math.round(v)) }: Props = $props();

  const PILLAR_LABEL: Record<PillarId, string> = {
    body: 'BODY',
    mind: 'MIND',
    finance: 'FINANCE',
    projects: 'PROJECTS',
  };

  function pillarVar(id: PillarId): string {
    return `var(--color-pillar-${id})`;
  }

  function pct(row: Row): number {
    if (row.max <= 0) return 0;
    return Math.max(0, Math.min(100, (row.value / row.max) * 100));
  }
</script>

<figure class="space-y-2">
  {#if label}
    <figcaption class="system-tag text-[10px]">[ {label} ]</figcaption>
  {/if}
  <ol class="space-y-1.5">
    {#each data as row (row.pillarId)}
      <li class="flex items-center gap-3 text-xs">
        <span
          class="w-20 shrink-0 tracking-[0.16em] text-[color:var(--color-text-muted)] uppercase flex items-center gap-1.5"
        >
          <PillarIcon pillarId={row.pillarId} size={11} />
          {PILLAR_LABEL[row.pillarId]}
        </span>
        <span
          class="flex-1 h-2 relative border border-[color:var(--color-border-subtle)]"
          style="background: color-mix(in oklab, {pillarVar(row.pillarId)} 6%, transparent);"
        >
          <span
            class="absolute inset-y-0 left-0"
            style="width: {pct(row)}%; background: {pillarVar(row.pillarId)};"
            aria-hidden="true"
          ></span>
        </span>
        <span class="num w-16 shrink-0 text-right text-[color:var(--color-text-secondary)]">
          {valueFormatter(row.value)}{row.suffix ?? ''}
        </span>
      </li>
    {/each}
  </ol>
</figure>
