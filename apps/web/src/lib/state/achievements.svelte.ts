import { getAchievements } from '$lib/api/client';
import type { Achievement } from '$lib/api/types';

/**
 * Singleton state store for the /system [ TROPHIES · N ] section + the
 * Today AchievementUnlockBanner. load() fetches the full list (locked +
 * unlocked) so the UI can show both states.
 */
class AchievementsState {
  achievements = $state<Achievement[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);

  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      this.achievements = await getAchievements();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  /**
   * Derived helper - unlocked rows sorted by unlocked_at DESC (most recent first).
   */
  get unlocked(): Achievement[] {
    return this.achievements
      .filter((a) => a.unlocked_at != null)
      .sort((a, b) => (b.unlocked_at ?? '').localeCompare(a.unlocked_at ?? ''));
  }

  /**
   * Derived helper - locked rows in stable id order.
   */
  get locked(): Achievement[] {
    return this.achievements
      .filter((a) => a.unlocked_at == null)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Count of unlocked achievements - used in the `[ TROPHIES · N ]` header.
   */
  get unlockedCount(): number {
    return this.achievements.filter((a) => a.unlocked_at != null).length;
  }
}

export const achievementsState = new AchievementsState();
