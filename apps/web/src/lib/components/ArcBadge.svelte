<script lang="ts">
  import type { Arc } from '$lib/api/types';

  interface Props {
    arc: Arc;
    arcStep: number;
  }
  let { arc, arcStep }: Props = $props();
</script>

<p
  class="system-tag text-[10px] tracking-[0.18em]"
  style={`color: var(--color-pillar-${arc.pillar_id});`}
>
  [ ARC · {arc.title} · day {arcStep}/{arc.total_steps} ]
</p>
