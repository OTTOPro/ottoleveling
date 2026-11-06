<!--
  BracketTitle.svelte - Small bracket prefix + title + sub text.
  Used for section titles in /system hub and sub-pages.

  Usage:
    <BracketTitle bracket="SYSTEM" title="Agent Configuration" sub="LLM + generation" />
    <BracketTitle title="Daily Quests" />
-->
<script lang="ts">
  interface Props {
    bracket?: string;
    title: string;
    sub?: string;
  }

  let { bracket = '', title, sub = '' }: Props = $props();
</script>

<div class="bracket-title">
  {#if bracket}
    <span class="bracket-title__bracket">[ {bracket} ]</span>
  {/if}
  <span class="bracket-title__title">{title}</span>
  {#if sub}
    <span class="bracket-title__sub">{sub}</span>
  {/if}
</div>

<style>
  .bracket-title {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 14px;
  }

  .bracket-title__bracket {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 500;
    font-size: 10px;
    letter-spacing: 1.2em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    line-height: 1;
  }

  .bracket-title__title {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 600;
    font-size: 18px;
    color: var(--color-text-primary);
    line-height: 1.2;
    letter-spacing: -0.01em;
  }

  .bracket-title__sub {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 400;
    font-size: 12px;
    color: var(--color-text-secondary);
    line-height: 1.3;
  }
</style>
