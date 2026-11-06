import type { AppData, DateKey, Habit, Schedule } from './types.ts';
import { addDays, daysBetween, weekStart, weekdayOf } from './dates.ts';
import { completions } from './values.ts';
import { completionsBetween, periodOf, scheduleOn } from './schedule.ts';

export interface Streak { current: number; best: number; unit: 'day' | 'night' | 'week' | 'month' | 'time' }

type Status = 'met' | 'unmet' | 'pending';
interface Occurrence { key: DateKey; status: Status }

const minKey = (a: DateKey, b: DateKey): DateKey => (a < b ? a : b);

function isDueDay(h: Habit, date: DateKey): boolean {
  const s = scheduleOn(h, date);
  if (s === null) return false;
  if (s.type === 'daily') return true;
  if (s.type === 'weekdays') return s.days.includes(weekdayOf(date));
  return false;
}

/** True when the week or month holding `date` is judged as a per_week or per_month period. */
function judgedByPeriod(h: Habit, date: DateKey, today: DateKey): boolean {
  const week = scheduleOn(h, minKey(periodOf({ from: '', type: 'per_week', count: 0 }, date).end, today));
  if (week?.type === 'per_week') return true;
  const month = scheduleOn(h, minKey(periodOf({ from: '', type: 'per_month', count: 0 }, date).end, today));
  return month?.type === 'per_month';
}

function dayOccurrences(h: Habit, d: AppData, today: DateKey, now: Date): Occurrence[] {
  const out: Occurrence[] = [];
  for (let k = h.created; k <= today; k = addDays(k, 1)) {
    const s = scheduleOn(h, k);
    if (s === null || (s.type !== 'daily' && s.type !== 'weekdays')) continue;
    if (!isDueDay(h, k) || judgedByPeriod(h, k, today)) continue;
    if (completions(h, k, d, now) > 0) {
      out.push({ key: k, status: 'met' });
    } else if (k === today) {
      out.push({ key: k, status: 'pending' });
    } else if (s.type === 'weekdays' && !isDueDay(h, addDays(k, 1))) {
      // Grace: done the next day, and that day isn't itself a due day.
      const next = addDays(k, 1);
      if (completions(h, next, d, now) > 0) out.push({ key: k, status: 'met' });
      else out.push({ key: k, status: next === today ? 'pending' : 'unmet' });
    } else {
      out.push({ key: k, status: 'unmet' });
    }
  }
  return out;
}

function periodOccurrences(
  h: Habit, d: AppData, today: DateKey, now: Date, type: 'per_week' | 'per_month',
): Occurrence[] {
  const probe: Schedule = { from: '', type, count: 0 };
  const out: Occurrence[] = [];
  let start = periodOf(probe, h.created).start;
  while (start <= today) {
    const { end } = periodOf(probe, start);
    const last = minKey(end, today);
    const s = scheduleOn(h, last);
    if (s !== null && s.type === type) {
      const met = completionsBetween(h, d, start, last, now) >= s.count;
      out.push({ key: last, status: met ? 'met' : end >= today ? 'pending' : 'unmet' });
    }
    start = addDays(end, 1);
  }
  return out;
}

function everyNOccurrences(h: Habit, d: AppData, today: DateKey, now: Date): Occurrence[] {
  const out: Occurrence[] = [];
  let prev: DateKey | null = null;
  for (let k = h.created; k <= today; k = addDays(k, 1)) {
    const s = scheduleOn(h, k);
    if (s === null || s.type !== 'every_n_days') continue;
    if (completions(h, k, d, now) === 0) continue;
    out.push({ key: k, status: prev === null || daysBetween(prev, k) <= s.n ? 'met' : 'unmet' });
    prev = k;
  }
  const sToday = scheduleOn(h, today);
  if (prev !== null && sToday?.type === 'every_n_days' && today > addDays(prev, sToday.n)) {
    out.push({ key: today, status: 'unmet' });
  }
  return out;
}

function unitOf(h: Habit, today: DateKey): Streak['unit'] {
  if (h.done.type === 'number' && h.done.source === 'health' && h.done.healthType === 'sleep') return 'night';
  const s = scheduleOn(h, today) ?? h.schedules[h.schedules.length - 1];
  switch (s?.type) {
    case 'per_week': return 'week';
    case 'per_month': return 'month';
    case 'weekdays':
    case 'every_n_days': return 'time';
    default: return 'day';
  }
}

export function streak(h: Habit, d: AppData, today: DateKey, now: Date): Streak {
  const occ = [
    ...dayOccurrences(h, d, today, now),
    ...periodOccurrences(h, d, today, now, 'per_week'),
    ...periodOccurrences(h, d, today, now, 'per_month'),
    ...everyNOccurrences(h, d, today, now),
  ].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  let current = 0;
  for (let i = occ.length - 1; i >= 0; i--) {
    if (occ[i].status === 'pending') continue;
    if (occ[i].status === 'unmet') break;
    current++;
  }
  let best = 0;
  let run = 0;
  for (const o of occ) {
    if (o.status === 'pending') continue;
    run = o.status === 'met' ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { current, best, unit: unitOf(h, today) };
}
