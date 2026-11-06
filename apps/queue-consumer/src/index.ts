/**
 * Queue Consumer Worker
 *
 * Subscribes to 2 Cloudflare Queues:
 * - ottoleveling-llm-jobs: Groq LLM generation tasks
 * - ottoleveling-events:   Auto-complete checks + sync triggers
 *
 * Each queue has its own handler module. Cross-worker RPC to SystemAgent
 * Durable Object (in ottoleveling-api) via the SYSTEM_AGENT binding.
 */
import type { MessageBatch } from '@cloudflare/workers-types';
import type { LlmJobMessage, EventMessage } from './handlers/types';
import { handleLlmJobsBatch } from './handlers/llm-jobs';
import { handleEventsBatch } from './handlers/events';

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  ANALYTICS: AnalyticsEngineDataset;
  SYSTEM_AGENT: DurableObjectNamespace;
  GROQ_API_KEY: string;
  LLM_PROVIDER: string;
  ENV: string;
}

export default {
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    if (batch.queue === 'ottoleveling-llm-jobs') {
      await handleLlmJobsBatch(batch as MessageBatch<LlmJobMessage>, env);
    } else if (batch.queue === 'ottoleveling-events') {
      await handleEventsBatch(batch as MessageBatch<EventMessage>, env);
    } else {
      console.error(`[queue-consumer] unknown queue: ${batch.queue}`);
      for (const msg of batch.messages) msg.retry();
    }
  },
};
