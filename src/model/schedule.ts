import type { AppData, DateKey, Habit, Schedule } from './types.ts';
import { addDays, daysBetween, weekStart, weekdayOf } from './dates.ts';
import { completions } from './values.ts';

export interface Period { kind: 'day' | 'week' | 'month'; start: DateKey; end: DateKey }

/** The version with the latest `from` at or before `date`. */
export function scheduleOn(h: Habit, date: DateKey): Schedule | null {
  let best: Schedule | null = null;
  for (const s of h.schedules) {
    if (s.from <= date && (best === null || s.from >= best.from)) best = s;
  }
  return best;
}

export function periodOf(s: Schedule, date: DateKey): Period {
  if (s.type === 'per_week') {
    const start = weekStart(date);
    return { kind: 'week', start, end: addDays(start, 6) };
  }
  if (s.type === 'per_month') {
    const [y, m] = date.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const ym = date.slice(0, 7);
    return { kind: 'month', start: `${ym}-01`, end: `${ym}-${String(last).padStart(2, '0')}` };
  }
  return { kind: 'day', start: date, end: date };
}

/** Completions in start..end inclusive. */
export function completionsBetween(h: Habit, d: AppData, start: DateKey, end: DateKey, now: Date): number {
  let total = 0;
  for (let k = start; k <= end; k = addDays(k, 1)) total += completions(h, k, d, now);
  return total;
}

/** Most recent day strictly before `before` with a completion, or null. */
export function lastDone(h: Habit, d: AppData, before: DateKey, now: Date): DateKey | null {
  for (let k = addDays(before, -1); k >= h.created; k = addDays(k, -1)) {
    if (completions(h, k, d, now) > 0) return k;
  }
  return null;
}

export function dueToday(h: Habit, d: AppData, today: DateKey, now: Date): { due: boolean; progress?: { done: number; target: number } } {
  const s = scheduleOn(h, today);
  if (s === null) return { due: false };
  switch (s.type) {
    case 'daily': return { due: true };
    case 'weekdays': return { due: s.days.includes(weekdayOf(today)) };
    case 'per_week':
    case 'per_month': {
      const p = periodOf(s, today);
      const before = completionsBetween(h, d, p.start, addDays(today, -1), now);
      const done = before + completions(h, today, d, now);
      return { due: before < s.count, progress: { done, target: s.count } };
    }
    case 'every_n_days': {
      const last = lastDone(h, d, today, now);
      return { due: last === null || daysBetween(last, today) >= s.n };
    }
  }
}

/**
 * A weekdays check habit whose due day was yesterday, isn't done, and has no due day today.
 * The spec counts a set-day habit done one day late, so Today keeps it for one more day.
 */
export function dueYesterday(h: Habit, d: AppData, today: DateKey, now: Date): boolean {
  if (h.done.type !== 'check') return false;
  const y = addDays(today, -1);
  const s = scheduleOn(h, y);
  if (s === null || s.type !== 'weekdays' || !s.days.includes(weekdayOf(y)) || y < h.created) return false;
  return completions(h, y, d, now) === 0 && !dueToday(h, d, today, now).due;
}

const NEXT_DUE_HORIZON = 400;

/**
 * Next due day after today. For every_n_days this is lastDone + n, which is
 * on or before today when the habit is overdue. Null when never done.
 */
export function nextDue(h: Habit, d: AppData, today: DateKey, now: Date): DateKey | null {
  const s = scheduleOn(h, today);
  if (s !== null && s.type === 'every_n_days') {
    const last = lastDone(h, d, addDays(today, 1), now);
    return last === null ? null : addDays(last, s.n);
  }
  for (let i = 1; i <= NEXT_DUE_HORIZON; i++) {
    const k = addDays(today, i);
    if (dueToday(h, d, k, now).due) return k;
  }
  return null;
}

export function comingUp(habits: Habit[], d: AppData, today: DateKey, now: Date, days = 3): { habit: Habit; date: DateKey }[] {
  const end = addDays(today, days);
  const out: { habit: Habit; date: DateKey }[] = [];
  for (const habit of habits) {
    if (habit.archived || habit.done.type !== 'check') continue;
    const date = nextDue(habit, d, today, now);
    if (date !== null && date > today && date <= end) out.push({ habit, date });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
