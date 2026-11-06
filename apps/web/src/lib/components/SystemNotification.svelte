<!--
  The signature Solo-Leveling-style panel. Used for agent reasoning text
  and system statements displayed on the Today page.

  White bordered card for HYBRIDE light theme.
  Keeps the same prop signature so call sites don't change.
-->
<script lang="ts">
  type Variant = 'default' | 'quest' | 'penalty' | 'success';

  interface Props {
    tag?: string;
    variant?: Variant;
    pulsing?: boolean;
    children?: import('svelte').Snippet;
    actions?: import('svelte').Snippet;
  }

  let {
    tag = '[ SYSTEM ]',
    variant = 'default',
    pulsing = false,
    children,
    actions,
  }: Props = $props();

  const accentVar: Record<Variant, string> = {
    default: '--color-system',
    quest: '--color-system',
    penalty: '--color-failure',
    success: '--color-success',
  };

  const accent = $derived(`var(${accentVar[variant]})`);
</script>

<section class="sn-panel" style="--panel-accent: {accent};">
  <header class="sn-header">
    <span
      class="system-tag text-xs"
      class:system-tag--pulsing={pulsing}
      style="color: var(--panel-accent);">{tag}</span
    >
    <span class="sn-divider"></span>
  </header>

  <div class="sn-body">
    {@render children?.()}
  </div>

  {#if actions}
    <footer class="sn-footer">
      {@render actions()}
    </footer>
  {/if}
</section>

<style>
  .sn-panel {
    position: relative;
    background: var(--color-bg);
    border: 1px solid var(--color-border-subtle);
    border-radius: 14px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  .sn-header {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 14px 18px 0;
  }

  .sn-divider {
    flex: 1;
    height: 1px;
    background: var(--color-border-subtle);
  }

  .sn-body {
    padding: 10px 18px 16px;
  }

  .sn-footer {
    border-top: 1px solid var(--color-border-subtle);
    padding: 10px 18px;
  }
</style>
