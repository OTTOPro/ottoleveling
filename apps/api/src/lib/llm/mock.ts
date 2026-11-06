import type { ChatMessage, CompletionOptions, LLMProvider } from './types';

/**
 * Test-only provider. The fixture is held in a module-level static so tests
 * can set it before invoking the DO and assert on `callCount`.
 *
 * Reset between tests via `MockProvider.reset()` in tests/setup-d1.ts.
 *
 * In production, this provider is bundled but only instantiated when
 * `env.LLM_PROVIDER === 'mock'`, which production envs never set.
 */
export class MockProvider implements LLMProvider {
  private static fixture: string | null = null;
  public static callCount = 0;
  public static lastMessages: ChatMessage[] | null = null;
  public static lastOptions: CompletionOptions | null = null;

  static setFixture(jsonOrText: string): void {
    MockProvider.fixture = jsonOrText;
  }

  static reset(): void {
    MockProvider.fixture = null;
    MockProvider.callCount = 0;
    MockProvider.lastMessages = null;
    MockProvider.lastOptions = null;
  }

  async complete(messages: ChatMessage[], options: CompletionOptions = {}): Promise<string> {
    MockProvider.callCount++;
    MockProvider.lastMessages = messages;
    MockProvider.lastOptions = options;
    if (MockProvider.fixture === null) {
      throw new Error(
        'MockProvider has no fixture set; call MockProvider.setFixture(...) before invoking the DO',
      );
    }
    return MockProvider.fixture;
  }
}
