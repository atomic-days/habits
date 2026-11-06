import type { AppData, ColorName, DateKey, Habit } from './types.ts';
import { addDays, daysBetween, weekStart, weekdayOf } from './dates.ts';
import { fastHoursOn } from './fasting.ts';
import { completions, dayValue, isMet } from './values.ts';
import { lastDone, scheduleOn } from './schedule.ts';

export type CellState = 'future' | 'notDue' | 'empty' | 'level' | 'missed' | 'duePending';
export interface Cell { date: DateKey; state: CellState; level: 0 | 1 | 2 | 3 | 4 }
type Level = Cell['level'];

export const PALETTES: Record<ColorName, readonly [string, string, string, string]> = {
  cyan: ['#0c383e', '#115c66', '#1a8fa0', '#3fd0e3'],
  violet: ['#2a1f5c', '#43339a', '#6a52d6', '#a58cff'],
  amber: ['#4a2c0a', '#82500f', '#c77a16', '#ffb23f'],
  pink: ['#47173a', '#7e2463', '#c2378f', '#ff73c0'],
  blue: ['#14294d', '#20509a', '#2f6fcc', '#3a86e0'],
  green: ['#0f3a26', '#176b40', '#23a15c', '#4fd88a'],
};

const level = (n: Level): Cell => ({ date: '', state: 'level', level: n });
const plain = (state: Exclude<CellState, 'level'>): Cell => ({ date: '', state, level: 0 });

function isDueWeekday(h: Habit, date: DateKey): boolean {
  const s = scheduleOn(h, date);
  return s?.type === 'weekdays' && s.days.includes(weekdayOf(date));
}

function checkCell(h: Habit, d: AppData, date: DateKey, today: DateKey, now: Date): Cell {
  const s = scheduleOn(h, date);
  const done = completions(h, date, d, now) > 0;
  if (s === null) return done ? level(4) : plain('notDue');
  if (s.type === 'weekdays') {
    if (!isDueWeekday(h, date)) return plain('notDue');
    if (done) return level(4);
    const next = addDays(date, 1);
    if (date < today && !isDueWeekday(h, next) && completions(h, next, d, now) > 0) return level(4);
    if (date === today) return plain('duePending');
    // The grace day is today, so the due day can still be saved.
    if (next === today && !isDueWeekday(h, next)) return plain('duePending');
    return plain('missed');
  }
  if (done) return level(4);
  if (s.type === 'every_n_days') {
    const prev = lastDone(h, d, date, now);
    if (prev !== null && date < today && daysBetween(prev, date) === s.n) return plain('missed');
  }
  return plain('empty');
}

function ratioLevel(value: number, goal: number): Level {
  if (value < goal / 3) return 1;
  if (value < (goal * 2) / 3) return 2;
  return 3;
}

function numberCell(h: Habit, d: AppData, date: DateKey, now: Date): Cell {
  const done = h.done;
  if (done.type !== 'number') return plain('empty');
  const value = dayValue(h, date, d, now);
  if (done.source === 'health' && done.healthType === 'workouts') {
    const hits = (d.health[date]?.workouts ?? []).filter(
      (w) => w.type === done.workoutType && w.distanceKm >= done.minDistanceKm,
    );
    const km = hits.reduce((sum, w) => sum + w.distanceKm, 0);
    if (km > 0) return level(km < 4 ? 1 : km < 6 ? 2 : km < 8 ? 3 : 4);
  }
  if (isMet(h, date, d, now)) return level(4);
  if (value === null || value === 0) return plain('empty');
  return level(ratioLevel(value, done.goal));
}

function timerCell(h: Habit, d: AppData, date: DateKey, now: Date): Cell {
  if (h.done.type !== 'timer') return plain('empty');
  const goal = h.done.goalHours;
  const hours = fastHoursOn(d.fasts, date, goal, now);
  if (hours === null) return plain('empty');
  return level(hours < goal - 2 ? 1 : hours < goal ? 2 : hours < goal + 2 ? 3 : 4);
}

function cellFor(h: Habit, d: AppData, date: DateKey, today: DateKey, now: Date): Cell {
  if (date > today) return { date, state: 'future', level: 0 };
  const base = h.done.type === 'check' ? checkCell(h, d, date, today, now)
    : h.done.type === 'number' ? numberCell(h, d, date, now)
    : timerCell(h, d, date, now);
  return { ...base, date };
}

/** Oldest week first, 7 cells per week starting on Monday. */
export function gridWeeks(h: Habit, d: AppData, today: DateKey, now: Date, weeks: number): Cell[][] {
  const first = addDays(weekStart(today), -7 * (weeks - 1));
  const out: Cell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const row: Cell[] = [];
    for (let i = 0; i < 7; i++) row.push(cellFor(h, d, addDays(first, w * 7 + i), today, now));
    out.push(row);
  }
  return out;
}

export function cellStyle(c: Cell, color: ColorName): { background: string; boxShadow: string } {
  switch (c.state) {
    case 'notDue': return { background: 'var(--cell-off)', boxShadow: 'none' };
    case 'empty': return { background: 'var(--cell-empty)', boxShadow: 'none' };
    case 'missed': return { background: 'transparent', boxShadow: 'inset 0 0 0 1.5px #e0653a' };
    case 'duePending': return { background: 'transparent', boxShadow: 'inset 0 0 0 1.5px #8a929c' };
    case 'future': return { background: 'transparent', boxShadow: 'none' };
    case 'level': return { background: PALETTES[color][Math.max(c.level, 1) - 1], boxShadow: 'none' };
  }
}
