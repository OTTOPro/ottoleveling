<script lang="ts">
  interface Props {
    pillar_id: 'body' | 'mind' | 'finance' | 'projects';
  }
  const { pillar_id }: Props = $props();
</script>

<span
  class="inline-block px-2 py-0.5 text-[9px] tracking-[0.2em] uppercase border"
  style="color: var(--color-pillar-{pillar_id}); border-color: var(--color-pillar-{pillar_id});"
>
  [ AUTO ]
</span>
