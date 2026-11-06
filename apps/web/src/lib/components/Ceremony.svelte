<!--
  Ceremony.svelte - fullscreen rank-up overlay.

  Triggered from /today when all daily quests are cleared (700ms delay).
  Tap anywhere to dismiss. Sits at layout level so it overlays BottomNav.
  Renders nothing when data == null.
-->
<script lang="ts">
  import { Crown } from '@lucide/svelte';
  import { motionPreferences } from '$lib/state/motion-preferences.svelte';

  interface CeremonyData {
    kicker: string;
    title: string;
    body: string;
  }

  interface Props {
    data: CeremonyData | null;
    onClose: () => void;
  }

  let { data, onClose }: Props = $props();

  const reduced = $derived(motionPreferences.reduced);

  const rings = [220, 190, 160, 130, 100];
</script>

{#if data}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="ceremony"
    class:ceremony--reduced={reduced}
    onclick={onClose}
    aria-label="Tap to continue"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <!-- Concentric rings -->
    {#each rings as size, i (size)}
      <div
        class="ring"
        class:ring--reduced={reduced}
        style="
          width: {size}px;
          height: {size}px;
          animation-delay: {i * 0.18}s;
        "
      ></div>
    {/each}

    <!-- Center content -->
    <div class="ceremony__content" class:ceremony__content--reduced={reduced}>
      <Crown size={56} strokeWidth={1.6} color="#F7D774" aria-hidden="true" />

      <span class="ceremony__kicker">{data.kicker}</span>
      <h2 class="ceremony__title">{data.title}</h2>
      <p class="ceremony__body">{data.body}</p>

      <span class="ceremony__hint">TAP TO CONTINUE</span>
    </div>
  </div>
{/if}

<style>
  .ceremony {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(circle at 50% 38%, #4e27c4 0%, #2a1b4d 55%, #15102b 100%);
    animation: ceremonyFadeIn 0.4s ease both;
    cursor: pointer;
    overflow: hidden;
  }

  .ceremony--reduced {
    animation: none;
  }

  @keyframes ceremonyFadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* Concentric rings - centered via transform */
  .ring {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    border: 1px solid rgba(247, 215, 116, 0.18);
    animation: ringPulse 2.4s ease-out infinite;
    pointer-events: none;
  }

  .ring--reduced {
    animation: none;
  }

  @keyframes ringPulse {
    0% {
      opacity: 0.18;
      transform: translate(-50%, -50%) scale(1);
    }
    50% {
      opacity: 0.08;
      transform: translate(-50%, -50%) scale(1.06);
    }
    100% {
      opacity: 0.18;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  .ceremony__content {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    text-align: center;
    padding: 0 32px;
    animation: ceremonyRiseIn 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both;
    pointer-events: none;
  }

  .ceremony__content--reduced {
    animation: none;
  }

  @keyframes ceremonyRiseIn {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .ceremony__kicker {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.6);
    margin-top: 8px;
  }

  .ceremony__title {
    font-family: 'Cinzel', Georgia, serif;
    font-weight: 700;
    font-size: 34px;
    line-height: 1.1;
    letter-spacing: 0.5px;
    color: #fff;
    margin: 0;
  }

  .ceremony__body {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 14px;
    font-weight: 400;
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.75);
    max-width: 260px;
    margin: 0;
  }

  .ceremony__hint {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 11px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.45);
    margin-top: 16px;
  }
</style>
