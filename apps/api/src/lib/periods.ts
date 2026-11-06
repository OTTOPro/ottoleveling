export interface Period {
  start: string; // YYYY-MM-DD UTC
  end: string; // YYYY-MM-DD UTC (inclusive)
  days: number;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.round(ms / 86_400_000) + 1; // inclusive on both ends
}

/**
 * Returns the most recent COMPLETED Mon→Sun week ending on or before the
 * trigger. If trigger is itself a Sunday >= 00:00 UTC, the period ends on
 * that Sunday.
 */
export function weeklyPeriodFor(triggerDate: Date): Period {
  // Day of week with Mon=0, Sun=6.
  const t = new Date(triggerDate);
  const dayMondayZero = (t.getUTCDay() + 6) % 7; // Sun(0)→6, Mon(1)→0, ..., Sat(6)→5

  // End = the Sunday that ends the most-recently-completed week.
  // If today is Sunday, today IS the end. Otherwise, end = previous Sunday.
  const end = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  if (dayMondayZero !== 6) {
    // Roll back to previous Sunday.
    end.setUTCDate(end.getUTCDate() - (dayMondayZero + 1));
  }

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6); // Monday

  return { start: isoDate(start), end: isoDate(end), days: 7 };
}

/**
 * Returns the most recent COMPLETED calendar month. If trigger is the last
 * day of a month, returns that month. Otherwise returns the previous month.
 */
export function monthlyPeriodFor(triggerDate: Date): Period {
  const t = new Date(triggerDate);
  // Last day of trigger's month.
  const lastOfTriggerMonth = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0));
  const triggerDay = t.getUTCDate();

  let endDate: Date;
  if (triggerDay === lastOfTriggerMonth.getUTCDate()) {
    // Trigger is the last day → use this month.
    endDate = lastOfTriggerMonth;
  } else {
    // Use previous month.
    endDate = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0));
  }
  const startDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));

  return {
    start: isoDate(startDate),
    end: isoDate(endDate),
    days: daysBetween(startDate, endDate),
  };
}

/**
 * Returns the most recent COMPLETED calendar year. If trigger is Dec 31, that
 * year. Otherwise the previous year.
 */
export function yearlyPeriodFor(triggerDate: Date): Period {
  const t = new Date(triggerDate);
  const isDec31 = t.getUTCMonth() === 11 && t.getUTCDate() === 31;
  const year = isDec31 ? t.getUTCFullYear() : t.getUTCFullYear() - 1;
  const startDate = new Date(Date.UTC(year, 0, 1));
  const endDate = new Date(Date.UTC(year, 11, 31));
  return {
    start: isoDate(startDate),
    end: isoDate(endDate),
    days: daysBetween(startDate, endDate),
  };
}
