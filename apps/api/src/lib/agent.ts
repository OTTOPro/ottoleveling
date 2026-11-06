import type { Bindings, SystemAgent } from '../index';

/**
 * Returns the typed stub for the single SystemAgent instance.
 * OttoLeveling is single-user, so there's exactly one DO addressed by 'main'.
 * The stub supports RPC: `await getAgent(env).setFocus(...)`, etc.
 */
export function getAgent(env: Bindings): DurableObjectStub<SystemAgent> {
  return env.SYSTEM_AGENT.get(env.SYSTEM_AGENT.idFromName('main'));
}
