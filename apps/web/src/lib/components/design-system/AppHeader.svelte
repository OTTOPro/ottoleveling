<!--
  AppHeader.svelte - Page-top header with optional back button, title/sub, and right slot.

  Usage:
    <AppHeader title="TODAY" sub="Monday, June 1" />
    <AppHeader title="STATS" onBack={() => goto('/system')}>
      {#snippet right()}
        <RankBadge rank="C" />
      {/snippet}
    </AppHeader>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ChevronLeft } from '@lucide/svelte';

  interface Props {
    title: string;
    sub?: string;
    onBack?: (() => void) | null;
    right?: Snippet;
  }

  let { title, sub = '', onBack = null, right }: Props = $props();
</script>

<header class="app-header">
  <div class="app-header__left">
    {#if onBack}
      <button type="button" class="app-header__back" onclick={onBack} aria-label="Go back">
        <ChevronLeft size={20} strokeWidth={2} />
      </button>
    {/if}
  </div>

  <div class="app-header__center">
    <span class="app-header__title">{title}</span>
    {#if sub}
      <span class="app-header__sub">{sub}</span>
    {/if}
  </div>

  <div class="app-header__right">
    {#if right}
      {@render right()}
    {/if}
  </div>
</header>

<style>
  .app-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 0 18px;
  }

  .app-header__left {
    width: 40px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .app-header__back {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 12px;
    border: 1px solid var(--color-border-subtle);
    background: transparent;
    cursor: pointer;
    color: var(--color-text-secondary);
    transition:
      border-color 0.15s,
      color 0.15s;
    padding: 0;
  }

  .app-header__back:hover {
    border-color: var(--color-border-emphasis);
    color: var(--color-text-primary);
  }

  .app-header__center {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .app-header__title {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 700;
    font-size: 26px;
    line-height: 1.1;
    color: var(--color-text-primary);
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .app-header__sub {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 500;
    font-size: 13px;
    color: var(--color-text-secondary);
    line-height: 1.2;
  }

  .app-header__right {
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }
</style>
