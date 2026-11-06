import { getRecentCheckins, createCheckin } from '$lib/api/client';
import type { Checkin, CreateCheckinInput } from '$lib/api/types';

class CheckinsState {
  recent = $state<Checkin[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);

  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      this.recent = await getRecentCheckins();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  async create(input: CreateCheckinInput): Promise<Checkin | null> {
    this.error = null;
    try {
      const c = await createCheckin(input);
      // Replace if same date already in list.
      const filtered = this.recent.filter((x) => x.date !== c.date);
      this.recent = [c, ...filtered];
      return c;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return null;
    }
  }
}

export const checkinsState = new CheckinsState();
