import { getFocus, setFocus } from '$lib/api/client';
import type { CurrentFocus, FocusHorizon, PillarId } from '$lib/api/types';

class FocusState {
  current = $state<CurrentFocus | null>(null);
  loading = $state(false);
  error = $state<string | null>(null);

  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      this.current = await getFocus();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  async set(pillar_id: PillarId, horizon: FocusHorizon): Promise<CurrentFocus | null> {
    this.error = null;
    try {
      this.current = await setFocus(pillar_id, horizon);
      return this.current;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return null;
    }
  }
}

export const focusState = new FocusState();
