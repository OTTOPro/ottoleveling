import { getConfig } from '$lib/api/client';
import type { ConfigResponse } from '$lib/api/types';

class ConfigState {
  version = $state('?');
  llmModel = $state('?');
  loaded = $state(false);

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const cfg: ConfigResponse = await getConfig();
      this.version = cfg.version;
      this.llmModel = cfg.llm_model;
      this.loaded = true;
    } catch (err) {
      console.warn('[configState] load failed', err);
    }
  }
}

export const configState = new ConfigState();
