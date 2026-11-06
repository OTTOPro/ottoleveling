<!--
  Avatar.svelte - Monogram in a purple gradient circle.
  Cinzel font for the letter (ceremony: identity display).

  Usage:
    <Avatar letter="O" size={44} />
-->
<script lang="ts">
  interface Props {
    letter?: string;
    size?: number;
  }

  let { letter = 'O', size = 44 }: Props = $props();

  const letterSize = $derived(Math.round(size * 0.42));
</script>

<div
  class="avatar"
  style="
    width: {size}px;
    height: {size}px;
    border-radius: {size}px;
    font-size: {letterSize}px;
  "
  aria-label="Avatar {letter}"
>
  {letter.charAt(0).toUpperCase()}
</div>

<style>
  .avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(145deg, #7c54f0, #5f33e1);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.25),
      0 2px 8px rgba(95, 51, 225, 0.35);
    color: #ffffff;
    font-family: 'Cinzel', 'Fraunces', 'Iowan Old Style', serif;
    font-weight: 700;
    line-height: 1;
    user-select: none;
    flex-shrink: 0;
  }
</style>
