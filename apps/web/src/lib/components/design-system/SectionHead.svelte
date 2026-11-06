<!--
  SectionHead.svelte - Uppercase section heading with optional right-side action slot.

  Usage:
    <SectionHead label="STREAKS" />
    <SectionHead label="QUESTS">
      {#snippet action()}
        <button>+ Add</button>
      {/snippet}
    </SectionHead>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    action?: Snippet;
  }

  let { label, action }: Props = $props();
</script>

<div class="section-head">
  <span class="section-head__label">{label}</span>
  {#if action}
    <div class="section-head__action">
      {@render action()}
    </div>
  {/if}
</div>

<style>
  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .section-head__label {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.6em;
    text-transform: uppercase;
    color: var(--color-text-secondary);
    line-height: 1;
  }

  .section-head__action {
    display: flex;
    align-items: center;
  }
</style>
