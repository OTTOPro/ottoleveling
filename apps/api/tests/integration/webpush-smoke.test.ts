import { describe, it, expect } from 'vitest';

describe('@jsr/negrel__webpush - smoke', () => {
  it('module loads without runtime errors in the Workers test pool', async () => {
    const mod = await import('@jsr/negrel__webpush');
    expect(mod).toBeDefined();
    // Sanity: at least one of these named exports should exist. Adapt to
    // match the actual exports you found in Step 3.
    const hasUsableExport =
      typeof (mod as Record<string, unknown>).ApplicationServer !== 'undefined' ||
      typeof (mod as Record<string, unknown>).Subscriber !== 'undefined' ||
      typeof (mod as Record<string, unknown>).sendNotification !== 'undefined' ||
      typeof (mod as Record<string, unknown>).default !== 'undefined';
    expect(hasUsableExport).toBe(true);
  });
});
