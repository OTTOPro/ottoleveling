import type { LLMProvider } from './types';
import { GroqProvider } from './groq';
import { MockProvider } from './mock';
import { DevSampleProvider } from './dev-sample';
import type { Bindings } from '../../index';

export type { LLMProvider, ChatMessage, CompletionOptions } from './types';
export { GroqProvider, MockProvider, DevSampleProvider };

export function getLLMProvider(env: Bindings): LLMProvider {
  switch (env.LLM_PROVIDER) {
    case 'groq':
      return new GroqProvider(env.GROQ_API_KEY);
    case 'mock':
      // Local development gets readable sample quests; tests drive MockProvider fixtures.
      return env.ENV === 'development' ? new DevSampleProvider() : new MockProvider();
    default:
      throw new Error(`Unknown LLM provider: ${env.LLM_PROVIDER}`);
  }
}
