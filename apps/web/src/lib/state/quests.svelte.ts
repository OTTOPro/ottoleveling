import {
  createManualQuest,
  completeQuest,
  failQuest,
  skipQuest,
  getToday,
  regenerateDaily,
} from '$lib/api/client';
import type {
  Quest,
  CreateManualQuestInput,
  Completion,
  GenerationBatchResponse,
  GenerationStatus,
} from '$lib/api/types';

class QuestsState {
  quests = $state<Quest[]>([]);
  completions = $state<Map<number, Completion>>(new Map());
  loading = $state(false);
  error = $state<string | null>(null);
  lastReasoning = $state<string | null>(null);
  // Async generation status from KV flag.
  generationStatus = $state<GenerationStatus>('idle');

  // Quests added in-session are kept locally; loadToday() hydrates from GET /api/quests/today.

  async create(input: CreateManualQuestInput): Promise<Quest | null> {
    this.error = null;
    try {
      const q = await createManualQuest(input);
      this.quests = [...this.quests, q];
      return q;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return null;
    }
  }

  async complete(id: number): Promise<void> {
    this.error = null;
    try {
      const c = await completeQuest(id);
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local copy for an immutable update; reactivity comes from reassigning this.completions
      const next = new Map(this.completions);
      next.set(id, c);
      this.completions = next;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.error = msg;
      // 409 = already completed on server. Sync from server to fix the UI.
      if (msg.includes('409')) {
        await this.loadToday();
      }
    }
  }

  async fail(id: number): Promise<void> {
    this.error = null;
    try {
      const c = await failQuest(id);
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local copy for an immutable update; reactivity comes from reassigning this.completions
      const next = new Map(this.completions);
      next.set(id, c);
      this.completions = next;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.error = msg;
      if (msg.includes('409')) {
        await this.loadToday();
      }
    }
  }

  async skip(id: number): Promise<void> {
    this.error = null;
    try {
      const c = await skipQuest(id);
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local copy for an immutable update; reactivity comes from reassigning this.completions
      const next = new Map(this.completions);
      next.set(id, c);
      this.completions = next;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.error = msg;
      if (msg.includes('409')) {
        await this.loadToday();
      }
    }
  }

  async loadToday(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const data = await getToday();
      // Merge: keep locally-added quests (those not in the API result),
      // prepend API quests so server-side ordering wins for shared ids.
      const apiIds = new Set(data.quests.map((q) => q.id));
      const localOnly = this.quests.filter((q) => !apiIds.has(q.id));
      this.quests = [...data.quests, ...localOnly];
      this.lastReasoning = data.reasoning;
      // Propagate generation status for skeleton rendering.
      this.generationStatus = data.generation_status ?? 'idle';

      // Hydrate completions map from server. Preserve in-session completions
      // that may not be on the server yet (race) by merging server → local.
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local copy for an immutable update; reactivity comes from reassigning this.completions
      const nextCompletions = new Map(this.completions);
      for (const c of data.completions) {
        nextCompletions.set(c.quest_id, c);
      }
      this.completions = nextCompletions;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  async forceRegenerate(): Promise<GenerationBatchResponse | null> {
    this.error = null;
    try {
      const result = await regenerateDaily();
      // Clear stale quests immediately so the Today page shows the loading
      // skeleton instead of the old quest list while loadToday fetches.
      // This also avoids the KV propagation-lag window where loadToday
      // could return the pre-regen cache (KV propagation can lag 5-15s).
      this.quests = [];
      this.completions = new Map();
      this.lastReasoning = null;
      // Reload today after regenerating so quests + reasoning refresh.
      await this.loadToday();
      return result;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return null;
    }
  }
}

export const questsState = new QuestsState();
