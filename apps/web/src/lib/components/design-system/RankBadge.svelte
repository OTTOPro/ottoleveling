<!--
  RankBadge.svelte - Rank letter (E/D/C/B/A/S) in a purple gradient square.
  Cinzel font for ceremony weight.

  Usage:
    <RankBadge rank="S" size={38} />
-->
<script lang="ts">
  type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';

  interface Props {
    rank: Rank;
    size?: number;
  }

  let { rank, size = 38 }: Props = $props();
</script>

<div
  class="rank-badge"
  style="
    width: {size}px;
    height: {size}px;
  "
  aria-label="Rank {rank}"
>
  {rank}
</div>

<style>
  .rank-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(145deg, #6e45e8, #5f33e1);
    border-radius: 11px;
    box-shadow:
      0 0 0 1px rgba(95, 51, 225, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.2),
      0 2px 10px rgba(95, 51, 225, 0.4);
    color: #ffffff;
    font-family: 'Cinzel', 'Fraunces', 'Iowan Old Style', serif;
    font-weight: 700;
    font-size: 18px;
    line-height: 1;
    user-select: none;
    flex-shrink: 0;
  }
</style>
