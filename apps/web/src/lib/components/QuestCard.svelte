<!--
  QuestCard.svelte - HYBRIDE quest row for the Today screen.
  PillarBadge + tags + title + reward chips + complete circle button.
  Done quests get opacity 0.55 + strikethrough.

  Fail/Skip live in a 3-dot kebab menu.

  Toast confirmation is emitted inline via transient $state (simpler than
  wiring through the page-level SystemNotice surface - scope kept tight).
  onFail/onSkip optional callbacks are provided for callers that want to
  route success messages to a page-level toast instead.
-->
<script lang="ts">
  import { Check, MoreVertical, X, SkipForward } from '@lucide/svelte';
  import PillarBadge from '$lib/components/design-system/PillarBadge.svelte';
  import PillarTag from '$lib/components/design-system/PillarTag.svelte';
  import Reward from '$lib/components/design-system/Reward.svelte';
  import AutoCompleteBadge from '$lib/components/AutoCompleteBadge.svelte';
  import ArcBadge from '$lib/components/ArcBadge.svelte';
  import ConfirmModal from '$lib/components/ConfirmModal.svelte';
  import { arcsState } from '$lib/state/arcs.svelte';
  import { templatesState } from '$lib/state/templates.svelte';
  import { questsState } from '$lib/state/quests.svelte';
  import { QUEST_FAIL_COPY, QUEST_SKIP_COPY, QUEST_MENU_LABELS } from '$lib/copy/quest-actions';
  import type { Quest, Completion } from '$lib/api/types';

  interface Props {
    quest: Quest;
    completion?: Completion | undefined;
    onComplete: (id: number) => void;
    onFail?: (id: number, successMessage: string) => void;
    onSkip?: (id: number, successMessage: string) => void;
  }

  let { quest, completion, onComplete, onFail, onSkip }: Props = $props();

  const done = $derived(!!completion);

  const tmpl = $derived(
    quest.template_id != null
      ? (templatesState.templates.find((t) => t.id === quest.template_id) ?? null)
      : null,
  );
  const hasAutoRule = $derived(!!tmpl?.auto_complete_rule);

  // ─── Kebab menu + modal state ────────────────────────────────────────────────
  let menuOpen = $state(false);
  let failModalOpen = $state(false);
  let skipModalOpen = $state(false);
  let toastMessage = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  // Outside-click + Escape close
  let menuRef = $state<HTMLDivElement | null>(null);

  $effect(() => {
    if (!menuOpen) return;

    function handleClick(e: MouseEvent) {
      if (menuRef && !menuRef.contains(e.target as Node)) {
        menuOpen = false;
      }
    }

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') menuOpen = false;
    }

    window.addEventListener('click', handleClick, { capture: true });
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', handleClick, { capture: true });
      window.removeEventListener('keydown', handleKey);
    };
  });

  function showToast(msg: string) {
    toastMessage = msg;
    if (toastTimer != null) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastMessage = null;
      toastTimer = null;
    }, 3000);
  }

  // ─── Handlers ───────────────────────────────────────────────────────────────
  async function handleFail() {
    failModalOpen = false;
    try {
      await questsState.fail(quest.id);
      onFail?.(quest.id, QUEST_FAIL_COPY.toastSuccess);
      showToast(QUEST_FAIL_COPY.toastSuccess);
    } catch (e) {
      console.error('[QuestCard] fail failed', e);
    }
  }

  async function handleSkip() {
    skipModalOpen = false;
    try {
      await questsState.skip(quest.id);
      onSkip?.(quest.id, QUEST_SKIP_COPY.toastSuccess);
      showToast(QUEST_SKIP_COPY.toastSuccess);
    } catch (e) {
      console.error('[QuestCard] skip failed', e);
    }
  }

  function sign(n: number): string {
    return n >= 0 ? `+${n}` : `${n}`;
  }

  function outcomeLabel(status: string): string {
    if (status === 'completed') return 'Cleared';
    if (status === 'failed') return 'Failed';
    return 'Skipped';
  }

  function handle() {
    if (done) return;
    onComplete(quest.id);
  }
</script>

<div class="quest-card" style="opacity: {done ? 0.55 : 1}; position: relative;">
  <PillarBadge pillar={quest.pillar_id} size={40} />

  <div class="quest-card__body">
    <!-- Tags row -->
    <div class="quest-card__tags">
      <PillarTag pillar={quest.pillar_id} />
      {#if hasAutoRule}
        <AutoCompleteBadge pillar_id={quest.pillar_id} />
      {/if}
      {#if quest.arc_id != null && arcsState.byId(quest.arc_id) != null && quest.arc_step != null}
        {@const _arc = arcsState.byId(quest.arc_id!)}
        {#if _arc}
          <ArcBadge arc={_arc} arcStep={quest.arc_step!} />
        {/if}
      {/if}
    </div>

    <!-- Title -->
    <div class="quest-card__title" style="text-decoration: {done ? 'line-through' : 'none'};">
      {quest.title}
    </div>

    <!-- Reward + chips -->
    <div class="quest-card__rewards">
      <Reward color="var(--color-pillar-{quest.pillar_id})">{quest.xp_value} xp</Reward>
      {#if completion}
        <Reward
          color={completion.status === 'completed'
            ? 'var(--color-success)'
            : completion.status === 'failed'
              ? 'var(--color-failure)'
              : 'var(--color-skip)'}
        >
          {outcomeLabel(completion.status)} · {sign(completion.xp_awarded)} xp
        </Reward>
      {:else}
        <Reward>· {quest.difficulty}</Reward>
      {/if}
    </div>

    <!-- Inline toast (below rewards, auto-clears at 3000ms) -->
    {#if toastMessage}
      <div class="quest-card__toast">{toastMessage}</div>
    {/if}
  </div>

  <!-- Kebab menu (only when not done) -->
  {#if !done}
    <div class="quest-card__menu-wrap" bind:this={menuRef}>
      <button
        type="button"
        class="quest-card__kebab"
        onclick={(e) => {
          e.stopPropagation();
          menuOpen = !menuOpen;
        }}
        aria-label={QUEST_MENU_LABELS.ariaOpenMenu}
        aria-expanded={menuOpen}
        aria-haspopup="true"
      >
        <MoreVertical size={16} strokeWidth={2} />
      </button>

      {#if menuOpen}
        <div class="quest-card__dropdown" role="menu">
          <button
            type="button"
            class="quest-card__dropdown-item quest-card__dropdown-item--fail"
            role="menuitem"
            onclick={() => {
              menuOpen = false;
              failModalOpen = true;
            }}
          >
            <X size={13} strokeWidth={2.5} />
            {QUEST_MENU_LABELS.fail}
          </button>
          <button
            type="button"
            class="quest-card__dropdown-item quest-card__dropdown-item--skip"
            role="menuitem"
            onclick={() => {
              menuOpen = false;
              skipModalOpen = true;
            }}
          >
            <SkipForward size={13} strokeWidth={2} />
            {QUEST_MENU_LABELS.skip}
          </button>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Complete button -->
  <button
    type="button"
    class="quest-card__btn"
    onclick={handle}
    disabled={done}
    aria-label="Complete quest"
    style="
      border: {done ? 'none' : '2px solid var(--color-border-subtle)'};
      background: {done ? 'var(--color-pillar-' + quest.pillar_id + ')' : 'transparent'};
    "
  >
    {#if done}
      <Check size={16} strokeWidth={3} color="#fff" />
    {/if}
  </button>
</div>

<!-- Fail ConfirmModal -->
<ConfirmModal
  open={failModalOpen}
  title={QUEST_FAIL_COPY.modalTitle}
  message={QUEST_FAIL_COPY.modalBody}
  confirmLabel={QUEST_FAIL_COPY.confirmLabel}
  cancelLabel={QUEST_FAIL_COPY.cancelLabel}
  variant="danger"
  onConfirm={handleFail}
  onCancel={() => (failModalOpen = false)}
/>

<!-- Skip ConfirmModal -->
<ConfirmModal
  open={skipModalOpen}
  title={QUEST_SKIP_COPY.modalTitle}
  message={QUEST_SKIP_COPY.modalBody}
  confirmLabel={QUEST_SKIP_COPY.confirmLabel}
  cancelLabel={QUEST_SKIP_COPY.cancelLabel}
  variant="default"
  onConfirm={handleSkip}
  onCancel={() => (skipModalOpen = false)}
/>

<style>
  .quest-card {
    display: flex;
    align-items: center;
    gap: 13px;
    background: var(--color-bg);
    border: 1px solid var(--color-border-subtle);
    border-radius: 16px;
    padding: 13px 14px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    transition: opacity 0.4s ease;
  }

  .quest-card__body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .quest-card__tags {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
  }

  .quest-card__title {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 600;
    font-size: 15px;
    line-height: 1.25;
    color: var(--color-text-primary);
  }

  .quest-card__rewards {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  /* Inline toast - small transient feedback below rewards */
  .quest-card__toast {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.08em;
    color: var(--color-text-muted);
    padding-top: 2px;
  }

  /* Kebab menu wrapper - relative anchor for the dropdown */
  .quest-card__menu-wrap {
    position: relative;
    flex-shrink: 0;
  }

  /* 3-dot icon button - 32×32 tap target (Apple HIG ≥ 32px) */
  .quest-card__kebab {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    border-radius: 8px;
    color: var(--color-text-muted);
    padding: 0;
    transition:
      background 0.15s,
      color 0.15s;
  }

  @media (hover: hover) {
    .quest-card__kebab:hover {
      background: var(--color-bg-elevated);
      color: var(--color-text-secondary);
    }
  }

  /* Dropdown panel */
  .quest-card__dropdown {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 20;
    min-width: 160px;
    background: var(--color-bg);
    border: 1px solid var(--color-border-subtle);
    border-radius: 12px;
    box-shadow: 0 12px 24px rgba(36, 37, 44, 0.12);
    overflow: hidden;
  }

  /* Dropdown items */
  .quest-card__dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 14px;
    background: none;
    border: none;
    cursor: pointer;
    font-family:
      'Inter',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 500;
    font-size: 13px;
    text-align: left;
    transition: background 0.12s;
  }

  @media (hover: hover) {
    .quest-card__dropdown-item:hover {
      background: var(--color-bg-elevated);
    }
  }

  .quest-card__dropdown-item--fail {
    color: var(--color-failure);
  }

  .quest-card__dropdown-item--skip {
    color: var(--color-text-muted);
  }

  .quest-card__btn {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    flex-shrink: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.25s ease;
    padding: 0;
  }

  .quest-card__btn:disabled {
    cursor: default;
  }
</style>
