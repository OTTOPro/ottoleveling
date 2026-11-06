import { describe, it, expect, vi, beforeEach } from 'vitest';
import { instrumentD1, flushInstrumentation } from '../../src/lib/d1-instrument';

describe('instrumentD1', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('counts .prepare() calls', () => {
    const stubDb = {
      prepare: vi.fn(() => ({ bind: vi.fn(), run: vi.fn(), first: vi.fn(), all: vi.fn() })),
      batch: vi.fn(),
    };
    const wrapped = instrumentD1(stubDb as unknown as D1Database, 'test-label');
    wrapped.prepare('SELECT 1');
    wrapped.prepare('SELECT 2');
    wrapped.prepare('SELECT 3');
    flushInstrumentation('test-label');
    const calls = (logSpy.mock.calls as unknown[][]).map((c) => c[0] as string);
    expect(calls.some((m) => m.includes('test-label'))).toBe(true);
    expect(calls.some((m) => m.includes('3 prepare'))).toBe(true);
  });

  it('counts .batch() as a single round-trip (D1 batches are 1 RTT)', () => {
    const stubDb = {
      prepare: vi.fn(() => ({ bind: vi.fn() })),
      batch: vi.fn((stmts: unknown[]) => stmts.map(() => ({}))),
    };
    const wrapped = instrumentD1(stubDb as unknown as D1Database, 'batch-label');
    wrapped.batch([{} as never, {} as never, {} as never]);
    flushInstrumentation('batch-label');
    const calls = (logSpy.mock.calls as unknown[][]).map((c) => c[0] as string);
    expect(calls.some((m) => m.includes('batch-label'))).toBe(true);
    expect(calls.some((m) => m.includes('1 batch'))).toBe(true);
  });

  it('flush() resets the counter', () => {
    const stubDb = {
      prepare: vi.fn(() => ({ bind: vi.fn() })),
      batch: vi.fn(),
    };
    const wrapped = instrumentD1(stubDb as unknown as D1Database, 'reset-label');
    wrapped.prepare('SELECT 1');
    flushInstrumentation('reset-label');
    wrapped.prepare('SELECT 2');
    flushInstrumentation('reset-label');
    const calls = (logSpy.mock.calls as unknown[][]).map((c) => c[0] as string);
    const labelLogs = calls.filter((m) => m.includes('reset-label'));
    expect(labelLogs).toHaveLength(2);
    // Both flushes should show count=1 (not 1 and 2)
    expect(labelLogs.every((m) => m.includes('1 prepare'))).toBe(true);
  });
});
