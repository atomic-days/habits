import type { AppData, DateKey, Habit } from './types.ts';
import { addDays, dateKeyAt, hoursBetween, weekStart } from './dates.ts';
import { dayValue, isMet } from './values.ts';
import { gridWeeks } from './grid.ts';
import { number, shortDay, timeOfDay, weekdayName } from '../ui/format.ts';

export type HistoryRange = '30d' | '12w' | '1y';

export interface HistoryPoint { date: DateKey; value: number | null; met: boolean }
export interface HistorySeries {
  points: HistoryPoint[];
  goal: number | null;
  unit: string;
  kind: 'bar' | 'line';
  yMax: number;
}
export interface RecentEntry { key: string; date: DateKey; text: string }

const DAYS: Record<HistoryRange, number> = { '30d': 30, '12w': 84, '1y': 364 };
const WEEKS: Record<HistoryRange, number> = { '30d': 0, '12w': 12, '1y': 52 };
const NICE = [1, 2, 2.5, 5];

/** Smallest round maximum that fits `raw` in at most four equal steps. */
function niceMax(raw: number): number {
  if (!(raw > 0)) return 1;
  for (let k = -3; k < 12; k++) {
    for (const m of NICE) {
      const step = m * 10 ** k;
      const n = Math.ceil(raw / step - 1e-9);
      if (n <= 4) return Number((step * n).toPrecision(12));
    }
  }
  return raw;
}

/** Axis values from 0 to yMax, so 3 or 4 gridlines above the baseline. */
export function yTicks(yMax: number): number[] {
  for (const n of [4, 3]) {
    const s = yMax / n;
    const m = Number((s / 10 ** Math.floor(Math.log10(s))).toPrecision(6));
    if (NICE.includes(m)) return Array.from({ length: n + 1 }, (_, i) => Number((s * i).toPrecision(12)));
  }
  return Array.from({ length: 5 }, (_, i) => (yMax / 4) * i);
}

function isRuns(h: Habit): boolean {
  return h.done.type === 'number' && h.done.source === 'health' && h.done.healthType === 'workouts';
}

/** What a day holds in the habit's chart unit. Runs are the km of qualifying runs, not the count. */
function dailyValue(h: Habit, date: DateKey, d: AppData, now: Date): number | null {
  const done = h.done;
  if (done.type === 'number' && done.source === 'health' && done.healthType === 'workouts') {
    const workouts = d.health[date]?.workouts;
    if (!workouts) return null;
    return workouts
      .filter((w) => w.type === done.workoutType && w.distanceKm >= done.minDistanceKm)
      .reduce((sum, w) => sum + w.distanceKm, 0);
  }
  return dayValue(h, date, d, now);
}

function goalOf(h: Habit): number | null {
  if (h.done.type === 'timer') return h.done.goalHours;
  if (h.done.type === 'number' && !isRuns(h)) return h.done.goal;
  return null;
}

function unitOf(h: Habit): string {
  if (h.done.type === 'check') return '%';
  if (h.done.type === 'timer') return 'hours';
  return isRuns(h) ? 'km' : h.done.unit;
}

function daysIn(range: HistoryRange, today: DateKey): DateKey[] {
  if (range === '1y') {
    const first = addDays(weekStart(today), -7 * 51);
    const out: DateKey[] = [];
    for (let k = first; k <= today; k = addDays(k, 1)) out.push(k);
    return out;
  }
  return Array.from({ length: DAYS[range] }, (_, i) => addDays(today, i + 1 - DAYS[range]));
}

/** Mondays of the weeks a range shows, oldest first. A 30 day range shows every week it touches. */
function weeksIn(range: HistoryRange, today: DateKey): DateKey[] {
  const last = weekStart(today);
  const first = range === '30d' ? weekStart(addDays(today, -29)) : addDays(last, -7 * (WEEKS[range] - 1));
  const out: DateKey[] = [];
  for (let k = first; k <= last; k = addDays(k, 7)) out.push(k);
  return out;
}

function checkSeries(h: Habit, d: AppData, today: DateKey, now: Date, range: HistoryRange): HistoryPoint[] {
  const byDate = new Map<DateKey, string>();
  for (const week of gridWeeks(h, d, today, now, 53)) for (const c of week) byDate.set(c.date, c.state);
  return weeksIn(range, today).map((monday) => {
    let due = 0;
    let done = 0;
    for (let i = 0; i < 7; i++) {
      const state = byDate.get(addDays(monday, i));
      if (state === 'level') { due++; done++; } else if (state === 'missed') due++;
    }
    if (due === 0) return { date: monday, value: null, met: false };
    const pct = (done / due) * 100;
    return { date: monday, value: pct, met: done === due };
  });
}

function dailySeries(h: Habit, d: AppData, today: DateKey, now: Date, range: HistoryRange): HistoryPoint[] {
  return daysIn(range, today).map((date) => {
    const value = dailyValue(h, date, d, now);
    return { date, value, met: isMet(h, date, d, now) };
  });
}

function weeklySeries(h: Habit, d: AppData, today: DateKey, now: Date): HistoryPoint[] {
  const goal = goalOf(h);
  const total = isRuns(h);
  return weeksIn('1y', today).map((monday) => {
    const values: number[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i);
      if (date > today) break;
      const v = dailyValue(h, date, d, now);
      if (v !== null) values.push(v);
    }
    if (values.length === 0) return { date: monday, value: null, met: false };
    const sum = values.reduce((a, b) => a + b, 0);
    const value = total ? sum : sum / values.length;
    return { date: monday, value, met: goal === null ? value > 0 : value >= goal };
  });
}

export function historySeries(h: Habit, d: AppData, today: DateKey, now: Date, range: HistoryRange): HistorySeries {
  const check = h.done.type === 'check';
  const points = check ? checkSeries(h, d, today, now, range)
    : range === '1y' ? weeklySeries(h, d, today, now)
    : dailySeries(h, d, today, now, range);
  const goal = goalOf(h);
  const sleep = h.done.type === 'number' && h.done.source === 'health' && h.done.healthType === 'sleep';
  const top = Math.max(0, goal ?? 0, ...points.map((p) => p.value ?? 0));
  return {
    points,
    goal,
    unit: unitOf(h),
    kind: check || sleep ? 'line' : 'bar',
    yMax: check ? 100 : niceMax(top),
  };
}

/** The average over a range: the mean of the days that have data, or of the weekly percentages for chores. */
export function rangeAverage(h: Habit, d: AppData, today: DateKey, now: Date, range: HistoryRange): number | null {
  const values = h.done.type === 'check'
    ? checkSeries(h, d, today, now, range).map((p) => p.value)
    : daysIn(range, today).map((date) => dailyValue(h, date, d, now));
  const real = values.filter((v): v is number => v !== null);
  return real.length === 0 ? null : real.reduce((a, b) => a + b, 0) / real.length;
}

const day3 = (iso: string): string => weekdayName(dateKeyAt(iso)).slice(0, 3);

function duration(startIso: string, end: string | Date): string {
  const minutes = Math.round(hoursBetween(startIso, end) * 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** The latest entries of a habit, newest first, each worded for its type. */
export function recentEntries(h: Habit, d: AppData, today: DateKey, now: Date, limit: number): RecentEntry[] {
  if (h.done.type === 'timer') {
    return d.fasts
      .filter((f) => Number.isFinite(new Date(f.start).getTime()))
      .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
      .slice(0, limit)
      .map((f) => ({
        key: f.id,
        date: dateKeyAt(f.start),
        text: `${day3(f.start)} ${timeOfDay(f.start)} → ${f.end ? `${day3(f.end)} ${timeOfDay(f.end)}` : 'now'} · ${duration(f.start, f.end ?? now)}`,
      }));
  }
  const out: RecentEntry[] = [];
  for (let date = today; date >= h.created && out.length < limit; date = addDays(date, -1)) {
    const text = entryText(h, d, date, now);
    if (text !== null) out.push({ key: date, date, text: `${shortDay(date)} · ${text}` });
  }
  return out;
}

function entryText(h: Habit, d: AppData, date: DateKey, now: Date): string | null {
  const done = h.done;
  if (done.type === 'check') return isMet(h, date, d, now) ? 'done' : null;
  if (done.type === 'timer') return null;
  const value = dailyValue(h, date, d, now);
  if (value === null) return null;
  if (isRuns(h)) return value > 0 ? `${number(value)} km` : null;
  return `${number(value)} ${done.unit}`;
}
