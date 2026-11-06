import { describe, it, expect, vi } from 'vitest';
import { emit } from '../../src/lib/analytics';
import type { AnalyticsEngineDataset } from '@cloudflare/workers-types';

function makeAnalytics() {
  return {
    writeDataPoint: vi.fn(),
  } as unknown as AnalyticsEngineDataset;
}

describe('analytics.emit', () => {
  it('is a no-op when analytics binding is undefined', () => {
    // Should not throw
    expect(() =>
      emit(undefined, { kind: 'queue_produce', queue_name: 'test', message_type: 'llm_job' }),
    ).not.toThrow();
  });

  it('queue_produce emits correct shape', () => {
    const analytics = makeAnalytics();
    emit(analytics, {
      kind: 'queue_produce',
      queue_name: 'ottoleveling-llm-jobs',
      message_type: 'daily_generation',
    });
    expect(analytics.writeDataPoint).toHaveBeenCalledOnce();
    const call = (analytics.writeDataPoint as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.blobs).toEqual(['ottoleveling-llm-jobs', 'daily_generation', 'produce']);
    expect(call.indexes).toEqual(['ottoleveling-llm-jobs']);
  });

  it('queue_consume emits correct shape with outcome variants', () => {
    const analytics = makeAnalytics();

    emit(analytics, {
      kind: 'queue_consume',
      queue_name: 'ottoleveling-events',
      message_type: 'auto_complete',
      outcome: 'success',
      duration_ms: 123,
      attempt: 1,
    });

    emit(analytics, {
      kind: 'queue_consume',
      queue_name: 'ottoleveling-llm-jobs',
      message_type: 'daily_generation',
      outcome: 'retry',
      duration_ms: 456,
      attempt: 2,
    });

    emit(analytics, {
      kind: 'queue_consume',
      queue_name: 'ottoleveling-llm-jobs',
      message_type: 'daily_generation',
      outcome: 'dlq',
      duration_ms: 789,
      attempt: 5,
    });

    expect(analytics.writeDataPoint).toHaveBeenCalledTimes(3);

    const calls = (analytics.writeDataPoint as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]![0].blobs).toEqual(['ottoleveling-events', 'auto_complete', 'success']);
    expect(calls[0]![0].doubles).toEqual([123, 1]);
    expect(calls[1]![0].blobs).toEqual(['ottoleveling-llm-jobs', 'daily_generation', 'retry']);
    expect(calls[2]![0].blobs).toEqual(['ottoleveling-llm-jobs', 'daily_generation', 'dlq']);
    expect(calls[2]![0].doubles).toEqual([789, 5]);
  });

  it('workflow_step emits correct shape', () => {
    const analytics = makeAnalytics();

    emit(analytics, {
      kind: 'workflow_step',
      workflow_name: 'daily-cycle',
      step_name: 'generate-quests',
      status: 'success',
      duration_ms: 8500,
    });

    emit(analytics, {
      kind: 'workflow_step',
      workflow_name: 'objective-milestone',
      step_name: 'check-phase-transition',
      status: 'failed',
      duration_ms: 100,
    });

    expect(analytics.writeDataPoint).toHaveBeenCalledTimes(2);

    const calls = (analytics.writeDataPoint as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]![0].blobs).toEqual(['daily-cycle', 'generate-quests', 'success']);
    expect(calls[0]![0].doubles).toEqual([8500]);
    expect(calls[0]![0].indexes).toEqual(['daily-cycle']);
    expect(calls[1]![0].blobs).toEqual(['objective-milestone', 'check-phase-transition', 'failed']);
    expect(calls[1]![0].indexes).toEqual(['objective-milestone']);
  });
});
