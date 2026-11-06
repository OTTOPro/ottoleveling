/**
 * ceremony.svelte.ts - singleton state for the Ceremony fullscreen overlay.
 *
 * The Ceremony fires from /today when all daily quests are cleared
 * (700ms delay after the final quest completion). Mounted at (app)/+layout.svelte
 * so it overlays the BottomNav.
 */

class CeremonyState {
  data = $state<{ kicker: string; title: string; body: string } | null>(null);

  show(data: { kicker: string; title: string; body: string }) {
    this.data = data;
  }

  dismiss() {
    this.data = null;
  }
}

export const ceremonyState = new CeremonyState();
