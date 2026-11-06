<!--
  SystemNotice.svelte - dark glass toast for quest completion.

  Fires from /today after questsState.complete(). Auto-clears at 3200ms.
  Always dark (rgba 36,37,44 bg) regardless of page theme - intentional
  contrast moment. Respects motionPreferences.reduced.

  Props:
  - notice: { pillar, title, reward, stats } | null - renders nothing when null
  - onClose: () => void - called at 3200ms OR when caller clears notice
-->
<script lang="ts">
  import { Check } from '@lucide/svelte';
  import { motionPreferences } from '$lib/state/motion-preferences.svelte';
  import type { PillarId } from '$lib/constants/pillars';

  export interface NoticeData {
    pillar: PillarId;
    title: string;
    reward: number;
    stats?: string;
  }

  interface Props {
    notice: NoticeData | null;
    onClose?: () => void;
  }

  let { notice }: Props = $props();

  const reduced = $derived(motionPreferences.reduced);
</script>

{#if notice}
  <div class="notice" class:notice--reduced={reduced} aria-live="assertive" aria-atomic="true">
    <!-- Left: pillar color chip with check icon -->
    <div class="notice__chip" style="background: var(--color-pillar-{notice.pillar});">
      <Check size={16} strokeWidth={2.5} color="#fff" aria-hidden="true" />
    </div>

    <!-- Middle: meta + title -->
    <div class="notice__content">
      <span class="notice__meta">[ {notice.pillar.toUpperCase()} - QUEST COMPLETE ]</span>
      <span class="notice__title">{notice.title}</span>
    </div>

    <!-- Right: XP reward + optional stats -->
    <div class="notice__reward">
      <span class="notice__xp">+{notice.reward}</span>
      {#if notice.stats}
        <span class="notice__stats" style="color: var(--color-pillar-{notice.pillar});"
          >{notice.stats}</span
        >
      {/if}
    </div>
  </div>
{/if}

<style>
  .notice {
    position: absolute;
    top: 64px;
    left: 18px;
    right: 18px;
    z-index: 70;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 15px;
    background: rgba(36, 37, 44, 0.96);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-radius: 14px;
    box-shadow: 0 8px 28px rgba(36, 37, 44, 0.4);
    animation: noticeIn 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
    pointer-events: none;
  }

  .notice--reduced {
    animation: none;
  }

  @keyframes noticeIn {
    from {
      transform: translateY(-14px) scale(0.96);
      opacity: 0;
    }
    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }

  .notice__chip {
    width: 34px;
    height: 34px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .notice__content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .notice__meta {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.55);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .notice__title {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 600;
    font-size: 13px;
    line-height: 1.2;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .notice__reward {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
  }

  .notice__xp {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 15px;
    font-weight: 700;
    color: #fff;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .notice__stats {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 10px;
    font-weight: 500;
    white-space: nowrap;
  }
</style>
