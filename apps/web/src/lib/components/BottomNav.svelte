<script lang="ts">
  import { page } from '$app/state';
  import { Home, ClipboardList, Cpu, Target, BarChart3 } from '@lucide/svelte';
  import type { Component } from 'svelte';
  import { motionPreferences } from '$lib/state/motion-preferences.svelte';

  interface NavItem {
    href: string;
    label: string;
    icon: Component;
  }

  // Order: Today / Templates / System (MIDDLE) / Objectives / Stats
  const items: NavItem[] = [
    { href: '/', label: 'Today', icon: Home },
    { href: '/templates', label: 'Templates', icon: ClipboardList },
    { href: '/system', label: 'System', icon: Cpu },
    { href: '/objectives', label: 'Objectives', icon: Target },
    { href: '/stats', label: 'Stats', icon: BarChart3 },
  ];

  function isActive(href: string): boolean {
    if (href === '/') return page.url.pathname === '/';
    return page.url.pathname.startsWith(href);
  }

  // 200ms color transition, zero when user prefers reduced motion.
  const transitionDuration = $derived(motionPreferences.reduced ? 0 : 200);
</script>

<!--
  BottomNav - HYBRIDE design.
  Background: gradient from bg-color (62%) to transparent - soft fade, no hard border.
  Active state: primary purple --color-system, icon strokeWidth 2.4.
  Inactive: --color-text-muted, icon strokeWidth 2.
  No hairline indicator above (color-only active state per design bundle).
-->
<nav
  style="
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 50;
    padding-bottom: 22px;
    padding-top: 8px;
    background: linear-gradient(to top, var(--color-bg) 62%, transparent);
  "
  aria-label="Main navigation"
>
  <ul
    style="
      display: flex;
      max-width: 420px;
      margin: 0 auto;
      padding: 0 4px;
      list-style: none;
    "
  >
    {#each items as item (item.href)}
      {@const active = isActive(item.href)}
      <li style="flex: 1;">
        <a
          href={item.href}
          aria-current={active ? 'page' : undefined}
          style="
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            text-decoration: none;
            color: {active ? 'var(--color-system)' : 'var(--color-text-muted)'};
            transition: color {transitionDuration}ms ease;
          "
        >
          <item.icon size={23} strokeWidth={active ? 2.4 : 2} />
          <span
            style="
              font-family: var(--font-body, Inter, sans-serif);
              font-size: 10px;
              font-weight: {active ? 600 : 500};
              letter-spacing: 0.2em;
              text-transform: uppercase;
            ">{item.label}</span
          >
        </a>
      </li>
    {/each}
  </ul>
</nav>
