/**
 * PushSender abstraction - mirrors the LLMProvider factory in lib/llm/index.ts.
 *
 * Production uses `RealPushSender` which delegates to `sendWebPush` from
 * lib/webpush.ts. Integration tests use `MockPushSender` (static-state class,
 * pattern stolen from MockProvider) and assert on `recordedCalls`.
 *
 * Wire via `getPushSender(env)` - keyed on env.PUSH_PROVIDER ('real' | 'mock').
 */

import { sendWebPush, type SendPushArgs, type SendPushResult } from './webpush';
import type { Bindings } from '../index';

export interface PushSender {
  send(args: SendPushArgs): Promise<SendPushResult>;
}

export class RealPushSender implements PushSender {
  async send(args: SendPushArgs): Promise<SendPushResult> {
    return sendWebPush(args);
  }
}

/**
 * Test-only sender. Records every call in `recordedCalls`. Default result
 * is { ok: true, status: 201 }. Override per-call via setNextResult(...) for
 * scenarios like 410 Gone or 5xx.
 *
 * Reset between tests via MockPushSender.reset() in tests/setup-d1.ts.
 */
export class MockPushSender implements PushSender {
  static recordedCalls: SendPushArgs[] = [];
  private static nextResults: SendPushResult[] = [];

  static reset(): void {
    MockPushSender.recordedCalls = [];
    MockPushSender.nextResults = [];
  }

  static setNextResult(result: SendPushResult): void {
    MockPushSender.nextResults.push(result);
  }

  async send(args: SendPushArgs): Promise<SendPushResult> {
    MockPushSender.recordedCalls.push(args);
    const next = MockPushSender.nextResults.shift();
    return next ?? { ok: true, status: 201 };
  }
}

export function getPushSender(env: Bindings): PushSender {
  switch (env.PUSH_PROVIDER) {
    case 'real':
      return new RealPushSender();
    case 'mock':
      return new MockPushSender();
    default:
      throw new Error(`Unknown PUSH_PROVIDER: ${env.PUSH_PROVIDER}`);
  }
}
