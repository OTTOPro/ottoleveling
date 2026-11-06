import type { ScheduledEvent } from './state';

// ---------- Recurrence math (UTC) ----------

function nextDailyAt(hourUtc: number, fromMs: number, minuteUtc: number = 0): Date {
  const d = new Date(fromMs);
  d.setUTCHours(hourUtc, minuteUtc, 0, 0);
  if (d.getTime() <= fromMs) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

function nextWeekdayAt(dayOfWeek: number, hourUtc: number, fromMs: number): Date {
  // dayOfWeek: 0=Sun, 1=Mon, ..., 6=Sat
  const d = new Date(fromMs);
  d.setUTCMinutes(0, 0, 0);
  const currentDay = d.getUTCDay();
  let daysAhead = (dayOfWeek - currentDay + 7) % 7;
  if (daysAhead === 0 && d.getUTCHours() >= hourUtc) daysAhead = 7;
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(hourUtc);
  return d;
}

function nextMonthEndAt(hourUtc: number, fromMs: number): Date {
  const d = new Date(fromMs);
  // Last day of current month = day 0 of next month
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  d.setUTCHours(hourUtc, 0, 0, 0);
  if (d.getTime() <= fromMs) {
    d.setUTCMonth(d.getUTCMonth() + 2, 0);
    d.setUTCHours(hourUtc, 0, 0, 0);
  }
  return d;
}

function nextYearEndAt(hourUtc: number, fromMs: number): Date {
  const d = new Date(fromMs);
  d.setUTCFullYear(d.getUTCFullYear(), 11, 31); // Dec 31
  d.setUTCHours(hourUtc, 0, 0, 0);
  if (d.getTime() <= fromMs) {
    d.setUTCFullYear(d.getUTCFullYear() + 1, 11, 31);
    d.setUTCHours(hourUtc, 0, 0, 0);
  }
  return d;
}

// ---------- Event ID generation ----------

let eventIdCounter = 0;
function nextEventId(): string {
  return `evt_${Date.now()}_${++eventIdCounter}`;
}

// ---------- Seed + reschedule ----------

/**
 * Alarm seed.
 *
 * daily_cycle_spawn (06:00 UTC) starts the DailyCycleWorkflow, which owns
 * daily generation and the data-source syncs. The weekly/monthly/yearly bilan
 * and template_progression_check alarms still run on the DO.
 */
export function seedInitialEvents(now: Date = new Date()): ScheduledEvent[] {
  const fromMs = now.getTime();
  return [
    // Starts the daily-cycle workflow (generation + syncs + day close).
    {
      id: nextEventId(),
      type: 'daily_cycle_spawn',
      scheduledFor: nextDailyAt(6, fromMs).toISOString(),
    },
    // Bilan triggers + template progression remain on DO until migrated to workflow
    {
      id: nextEventId(),
      type: 'weekly_bilan',
      scheduledFor: nextWeekdayAt(0, 20, fromMs).toISOString(),
    }, // Sun 20:00
    {
      id: nextEventId(),
      type: 'template_progression_check',
      scheduledFor: nextWeekdayAt(0, 19, fromMs).toISOString(),
    }, // Sun 19:00
    {
      id: nextEventId(),
      type: 'monthly_bilan',
      scheduledFor: nextMonthEndAt(20, fromMs).toISOString(),
    },
    {
      id: nextEventId(),
      type: 'yearly_bilan',
      scheduledFor: nextYearEndAt(20, fromMs).toISOString(),
    },
  ];
}

/**
 * Given a list of scheduledEvents, return the one with the earliest scheduledFor.
 * Returns null if the list is empty.
 */
export function nextDueEvent(events: ScheduledEvent[]): ScheduledEvent | null {
  if (events.length === 0) return null;
  const sorted = [...events].sort(
    (a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime(),
  );
  return sorted[0] ?? null;
}

/**
 * Tell the DO's storage to fire `alarm()` when the next event is due.
 * If no events queued, clear any pending alarm.
 */
export async function scheduleNextAlarm(
  events: ScheduledEvent[],
  storage: DurableObjectStorage,
): Promise<void> {
  const next = nextDueEvent(events);
  if (next) {
    await storage.setAlarm(new Date(next.scheduledFor));
  } else {
    await storage.deleteAlarm();
  }
}

/**
 * After firing, compute the NEXT occurrence of a recurring event.
 * Same recurrence rules as seedInitialEvents.
 */
export function rescheduleEvent(
  event: ScheduledEvent,
  fromMs: number = Date.now(),
): ScheduledEvent {
  let next: Date;
  switch (event.type) {
    case 'daily_cycle_spawn':
      next = nextDailyAt(6, fromMs);
      break;
    // Legacy alarms - kept in switch for backward-compat with persisted DO state.
    // The alarm handler migrates them to daily_cycle_spawn on first fire.
    case 'daily_generation':
      next = nextDailyAt(6, fromMs);
      break;
    case 'weekly_bilan':
      next = nextWeekdayAt(0, 20, fromMs);
      break;
    case 'template_progression_check':
      next = nextWeekdayAt(0, 19, fromMs);
      break;
    case 'monthly_bilan':
      next = nextMonthEndAt(20, fromMs);
      break;
    case 'yearly_bilan':
      next = nextYearEndAt(20, fromMs);
      break;
    case 'google_health_sync':
      next = nextDailyAt(5, fromMs, 30);
      break;
    case 'spotify_sync':
      next = nextDailyAt(5, fromMs, 31);
      break;
  }
  return { ...event, id: nextEventId(), scheduledFor: next.toISOString() };
}
