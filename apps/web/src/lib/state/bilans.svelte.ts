import { getBilan, getBilans, generateBilan } from '$lib/api/client';
import type { Bilan, BilanListItem, PeriodType } from '$lib/api/types';

class BilansState {
  bilans = $state<BilanListItem[]>([]);
  current = $state<Bilan | null>(null);
  loading = $state(false);
  error = $state<string | null>(null);

  async load(periodType?: PeriodType): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      this.bilans = await getBilans(periodType);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  async loadOne(id: number): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      this.current = await getBilan(id);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  async generate(periodType: PeriodType): Promise<Bilan | null> {
    this.loading = true;
    this.error = null;
    try {
      const b = await generateBilan(periodType);
      // Prepend to the list (most recent first).
      this.bilans = [
        {
          id: b.id,
          period_type: b.period_type,
          period_start: b.period_start,
          period_end: b.period_end,
          generated_at: b.generated_at,
        },
        ...this.bilans.filter((x) => x.id !== b.id),
      ];
      this.current = b;
      return b;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return null;
    } finally {
      this.loading = false;
    }
  }
}

export const bilansState = new BilansState();
