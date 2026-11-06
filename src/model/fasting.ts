import type { DateKey, Fast } from './types.ts';
import { dateKeyAt, hoursBetween } from './dates.ts';

const HOUR_MS = 3_600_000;

export function fastHours(fast: Fast, now: Date): number {
  return hoursBetween(fast.start, fast.end ?? now);
}

/** Local day of each instant start + goalHours + 24k that falls at or before the end (or now). */
export function fastCreditDays(fast: Fast, goalHours: number, now: Date): DateKey[] {
  const startMs = new Date(fast.start).getTime();
  const limit = fast.end === null ? now.getTime() : new Date(fast.end).getTime();
  const days: DateKey[] = [];
  for (let k = 0; ; k++) {
    const t = startMs + (goalHours + 24 * k) * HOUR_MS;
    if (t > limit) break;
    days.push(dateKeyAt(new Date(t).toISOString()));
  }
  return days;
}

export function fastHoursOn(fasts: Fast[], date: DateKey, goalHours: number, now: Date): number | null {
  let credited: number | null = null;
  let missed: number | null = null;
  for (const fast of fasts) {
    const hours = fastHours(fast, now);
    if (fastCreditDays(fast, goalHours, now).includes(date)) {
      if (credited === null || hours > credited) credited = hours;
    } else if (fast.end !== null && dateKeyAt(fast.end) === date) {
      if (missed === null || hours > missed) missed = hours;
    }
  }
  return credited ?? missed;
}

export function validateFast(start: string, end: string | null, now: Date): string | null {
  const startMs = new Date(start).getTime();
  if (end !== null && new Date(end).getTime() <= startMs) return 'End must be after start';
  if (startMs > now.getTime()) return "Start can't be in the future";
  return null;
}
