<!--
  Toggle.svelte - iOS-style pill toggle.

  Usage:
    <Toggle on={enabled} onclick={() => (enabled = !enabled)} />
    <Toggle on={active} onclick={handleToggle} disabled={saving} />
-->
<script lang="ts">
  interface Props {
    on: boolean;
    onclick: () => void;
    disabled?: boolean;
  }

  let { on, onclick, disabled = false }: Props = $props();
</script>

<button
  type="button"
  class="toggle"
  class:toggle--on={on}
  class:toggle--disabled={disabled}
  {disabled}
  {onclick}
  role="switch"
  aria-checked={on}
  aria-label="Toggle"
>
  <span class="toggle-thumb"></span>
</button>

<style>
  .toggle {
    position: relative;
    width: 46px;
    height: 28px;
    border-radius: 999px;
    background-color: #d8d8de;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: background-color 0.25s cubic-bezier(0.22, 1, 0.36, 1);
    flex-shrink: 0;
  }

  .toggle--on {
    background-color: #5f33e1;
  }

  .toggle--disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .toggle-thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background-color: #ffffff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
    transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
    pointer-events: none;
  }

  .toggle--on .toggle-thumb {
    transform: translateX(18px);
  }
</style>
