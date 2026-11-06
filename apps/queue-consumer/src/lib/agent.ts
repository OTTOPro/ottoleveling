/**
 * Helper to get the SystemAgent DO stub from consumer Env.
 *
 * Cross-worker RPC: the consumer Worker binds to the SystemAgent class in
 * ottoleveling-api via `script_name = "ottoleveling-api"` in wrangler.toml.
 * The singleton is always keyed on "main" (single-user app).
 */
import type { Env } from '../index';

export function getAgentStub(env: Env): DurableObjectStub {
  const id = env.SYSTEM_AGENT.idFromName('main');
  return env.SYSTEM_AGENT.get(id);
}
