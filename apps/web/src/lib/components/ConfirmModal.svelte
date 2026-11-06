<script lang="ts">
  import { onMount } from 'svelte';

  type Variant = 'default' | 'danger';

  interface Props {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: Variant;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    open,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'default',
    onConfirm,
    onCancel,
  }: Props = $props();

  const accentVar = $derived(variant === 'danger' ? '--color-failure' : '--color-system');

  // Close on Escape key.
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) onCancel();
  }

  onMount(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

{#if open}
  <!-- Backdrop. Click to cancel. Centered on ALL viewports.
       Backdrop is lighter for HYBRIDE light theme (rgba vs black/60). -->
  <div class="modal-backdrop" onclick={onCancel} role="presentation">
    <!-- Panel. Click stays inside (event.stopPropagation). -->
    <div
      class="modal-panel"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      tabindex="-1"
    >
      <header class="modal-header">
        <span class="system-tag text-xs" style="color: var({accentVar});">
          {title}
        </span>
        <span class="modal-divider"></span>
      </header>

      <div class="modal-body">
        <p id="confirm-modal-title" class="modal-message">
          {message}
        </p>
      </div>

      <!-- Borderless footer - buttons spaced by gap -->
      <footer class="modal-footer">
        <button type="button" onclick={onCancel} class="modal-cancel">
          {cancelLabel}
        </button>
        <button
          type="button"
          onclick={onConfirm}
          class="modal-confirm"
          style="border-color: var({accentVar}); color: var({accentVar});"
        >
          {confirmLabel}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(20, 18, 30, 0.45);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }

  .modal-panel {
    position: relative;
    width: 100%;
    max-width: 420px;
    max-height: calc(100vh - 3rem);
    overflow-y: auto;
    background: var(--color-bg);
    border: 1px solid var(--color-border-subtle);
    border-radius: 16px;
    box-shadow: 0 24px 48px rgba(36, 37, 44, 0.15);
  }

  .modal-header {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 18px 20px 0;
  }

  .modal-divider {
    flex: 1;
    height: 1px;
    background: var(--color-border-subtle);
  }

  .modal-body {
    padding: 14px 20px 18px;
  }

  .modal-message {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 14px;
    font-weight: 400;
    line-height: 1.55;
    color: var(--color-text-secondary);
    white-space: pre-line;
  }

  /* Borderless footer - no top border, gap between buttons */
  .modal-footer {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 20px 18px;
  }

  .modal-cancel {
    flex: 1;
    padding: 10px 0;
    background: none;
    border: none;
    cursor: pointer;
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-text-secondary);
    transition: color 0.15s;
  }

  /* Desktop hover only - touch devices ignore :hover */
  @media (hover: hover) {
    .modal-cancel:hover {
      color: var(--color-text-primary);
    }
  }

  .modal-confirm {
    flex: 1;
    padding: 10px 0;
    background: transparent;
    border: 1px solid;
    border-radius: 10px;
    cursor: pointer;
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    transition:
      background-color 0.15s,
      color 0.15s;
  }

  /* Desktop hover only - fills with accent bg, white text */
  @media (hover: hover) {
    .modal-confirm:hover {
      background: currentColor;
      color: #fff;
    }
  }
</style>
