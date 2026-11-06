<!--
  SectionCard.svelte - /system hub row card.
  Full-width anchor with pastel pillar icon + title/sub + badge + chevron.

  Usage:
    <SectionCard
      pillar="body"
      icon="Shield"
      title="STATUS"
      sub="Level · Rank · Streaks"
      badge="L8"
      href="/system/status"
    />
-->
<script lang="ts">
  import {
    ChevronRight,
    Shield,
    Lightbulb,
    Wallet,
    Folder,
    Activity,
    BarChart2,
    Settings,
    Zap,
    BookOpen,
    Trophy,
    GitBranch,
    Database,
    Music,
    Link,
    Terminal,
  } from '@lucide/svelte';
  import type { Component } from 'svelte';
  import type { PillarId } from '$lib/constants/pillars';

  // Map string icon names to Lucide components
  const ICON_MAP: Record<string, Component> = {
    Shield,
    Lightbulb,
    Wallet,
    Folder,
    Activity,
    BarChart2,
    Settings,
    Zap,
    BookOpen,
    Trophy,
    GitBranch,
    Database,
    Music,
    Link,
    Terminal,
    activity: Activity,
    trophy: Trophy,
    link: Link,
    terminal: Terminal,
  };

  interface Props {
    pillar: PillarId;
    icon: string;
    title: string;
    sub: string;
    badge: string;
    href: string;
  }

  let { pillar, icon, title, sub, badge, href }: Props = $props();

  const IconComponent = $derived(ICON_MAP[icon] ?? Shield);
</script>

<a class="section-card" {href}>
  <!-- Left: pillar icon chip -->
  <div
    class="section-card__icon"
    style="
      background-color: var(--color-pillar-{pillar}-bg);
      color: var(--color-pillar-{pillar});
    "
  >
    <IconComponent size={22} strokeWidth={1.8} aria-hidden="true" />
  </div>

  <!-- Middle: title + sub -->
  <div class="section-card__body">
    <span class="section-card__title">{title}</span>
    <span class="section-card__sub">{sub}</span>
  </div>

  <!-- Right: badge + chevron -->
  <div class="section-card__right">
    <span
      class="section-card__badge"
      style="
        color: var(--color-pillar-{pillar});
        background-color: var(--color-pillar-{pillar}-bg);
      "
    >
      {badge}
    </span>
    <ChevronRight size={16} strokeWidth={2} color="var(--color-text-muted)" aria-hidden="true" />
  </div>
</a>

<style>
  .section-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 15px 14px;
    border: 1px solid var(--color-border-subtle);
    border-radius: 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    text-decoration: none;
    color: inherit;
    background: var(--color-bg);
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }

  .section-card:hover {
    border-color: var(--color-border-emphasis);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.07);
  }

  .section-card__icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .section-card__body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .section-card__title {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 700;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.5em;
    color: var(--color-text-primary);
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .section-card__sub {
    font-family:
      'Lexend Deca',
      system-ui,
      -apple-system,
      sans-serif;
    font-weight: 500;
    font-size: 13px;
    color: var(--color-text-secondary);
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .section-card__right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .section-card__badge {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
    font-weight: 600;
    font-size: 10px;
    padding: 4px 7px;
    border-radius: 6px;
    line-height: 1;
    white-space: nowrap;
  }
</style>
