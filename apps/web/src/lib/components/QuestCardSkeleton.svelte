<!--
  QuestCardSkeleton.svelte - Placeholder quest card rendered while the
  async generation consumer is processing (generation_status === 'pending').

  Keeps the page from looking empty during the async generation window.
  Mirrors the outer structure of QuestCard: pillar strip + title area +
  reward chip + action circle. Gray strips with Tailwind animate-pulse
  simulate content loading without showing stale or empty state.
  aria-busy="true" signals the loading state to assistive technology.
-->
<div
  class="border border-[color:var(--color-border)] rounded p-3 flex items-start gap-3 opacity-60"
  aria-busy="true"
  aria-label="Quest loading"
>
  <!-- Pillar color strip placeholder -->
  <div class="w-1 self-stretch rounded-full bg-gray-300 animate-pulse shrink-0"></div>

  <!-- Content area -->
  <div class="flex-1 min-w-0 space-y-2">
    <!-- Title placeholder -->
    <div class="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
    <!-- Description placeholder -->
    <div class="h-3 bg-gray-200 rounded animate-pulse w-1/2"></div>
    <!-- Reward chip placeholder -->
    <div class="h-5 bg-gray-200 rounded animate-pulse w-16 mt-1"></div>
  </div>

  <!-- Action circle placeholder -->
  <div
    class="w-8 h-8 rounded-full border-2 border-gray-200 bg-gray-100 animate-pulse shrink-0 mt-1"
  ></div>
</div>
