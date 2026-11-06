import { test, expect } from 'vitest';
import { gridWeeks, cellStyle, PALETTES } from './grid.ts';
import { emptyData, habit } from './fixtures.ts';
import { addDays } from './dates.ts';
import type { Cell } from './grid.ts';
import type { AppData, Habit } from './types.ts';

const now = new Date('2026-11-06T11:52:00-05:00');
const today = '2026-11-06'; // Friday
const steps = habit({ id: 'steps', done: { type: 'number', goal: 10000, unit: 'steps', source: 'health', healthType: 'steps' } });
const laundry = habit({ id: 'laundry', done: { type: 'check' }, schedules: [{ from: '2026-01-01', type: 'weekdays', days: ['fri'] }] });
const runs = habit({ id: 'runs', done: { type: 'number', goal: 2, unit: 'runs', source: 'health', healthType: 'workouts', workoutType: 'running', measure: 'count', minDistanceKm: 1 },
  schedules: [{ from: '2026-01-01', type: 'per_week', count: 2 }] });
const fast = habit({ id: 'fast', done: { type: 'timer', goalHours: 16 } });
const run = (km: number) => ({ type: 'running', start: '', end: '', distanceKm: km, durationMin: 30, avgHeartRate: null });

function cellOf(h: Habit, d: AppData, date: string): Cell {
  const weeks = gridWeeks(h, d, today, now, 12);
  const cell = weeks.flat().find((c) => c.date === date);
  if (!cell) throw new Error('no cell ' + date);
  return cell;
}
function checks(h: Habit, dates: string[]): AppData {
  const d = emptyData();
  for (const date of dates) d.logs.push({ habit: h.id, date, value: 1, at: `${date}T08:00:00-05:00` });
  return d;
}

test('grid shape', () => {
  const w = gridWeeks(steps, emptyData(), today, now, 12);
  expect(w).toHaveLength(12);
  for (const week of w) expect(week).toHaveLength(7);
  expect(w[11][0].date).toBe('2026-11-02');
  expect(w[11][4].date).toBe(today);
  expect(w[11][5].state).toBe('future');
  expect(w[0][0].date).toBe(addDays('2026-11-02', -77));
});

test('number levels', () => {
  const d = emptyData();
  d.health['2026-11-06'] = { steps: 8412 };
  d.health['2026-11-05'] = { steps: 2000 };
  d.health['2026-11-04'] = { steps: 10200 };
  d.health['2026-11-03'] = { steps: 5000 };
  d.health['2026-11-02'] = { steps: 0 };
  expect(cellOf(steps, d, '2026-11-06')).toMatchObject({ state: 'level', level: 3 });
  expect(cellOf(steps, d, '2026-11-05')).toMatchObject({ state: 'level', level: 1 });
  expect(cellOf(steps, d, '2026-11-04')).toMatchObject({ state: 'level', level: 4 });
  expect(cellOf(steps, d, '2026-11-03')).toMatchObject({ state: 'level', level: 2 });
  expect(cellOf(steps, d, '2026-11-02').state).toBe('empty');
  expect(cellOf(steps, d, '2026-11-01').state).toBe('empty');
});

test('laundry done Friday is level 4', () => {
  expect(cellOf(laundry, checks(laundry, ['2026-10-30']), '2026-10-30')).toMatchObject({ state: 'level', level: 4 });
});

test('laundry missed Friday', () => {
  expect(cellOf(laundry, emptyData(), '2026-10-30').state).toBe('missed');
});

test('laundry today undone is duePending', () => {
  expect(cellOf(laundry, emptyData(), today).state).toBe('duePending');
});

test('laundry Wednesday is notDue', () => {
  expect(cellOf(laundry, emptyData(), '2026-11-04').state).toBe('notDue');
});

test('laundry done one day late shows as done', () => {
  const d = checks(laundry, ['2026-10-31']);
  expect(cellOf(laundry, d, '2026-10-30')).toMatchObject({ state: 'level', level: 4 });
  expect(cellOf(laundry, d, '2026-10-31').state).toBe('notDue');
});

test('every_n_days check: done is 4, passed due date is missed', () => {
  const h = habit({ id: 'sheets', done: { type: 'check' }, schedules: [{ from: '2026-01-01', type: 'every_n_days', n: 14 }] });
  const d = checks(h, ['2026-10-01', '2026-10-12']);
  expect(cellOf(h, d, '2026-10-12')).toMatchObject({ state: 'level', level: 4 });
  expect(cellOf(h, d, '2026-10-26').state).toBe('missed');
  expect(cellOf(h, d, '2026-10-20').state).toBe('empty');
});

test('daily check: done is 4, else empty', () => {
  const h = habit({ id: 'c', done: { type: 'check' } });
  expect(cellOf(h, checks(h, ['2026-11-01']), '2026-11-01')).toMatchObject({ state: 'level', level: 4 });
  expect(cellOf(h, emptyData(), '2026-11-01').state).toBe('empty');
});

test('runs shade by that day\'s distance', () => {
  const d = emptyData();
  d.health['2026-11-04'] = { workouts: [run(5.2)] };
  d.health['2026-11-03'] = { workouts: [run(8.4)] };
  d.health['2026-11-02'] = { workouts: [run(2)] };
  d.health['2026-11-01'] = { workouts: [run(3), run(2)] };
  expect(cellOf(runs, d, '2026-11-04')).toMatchObject({ state: 'level', level: 2 });
  expect(cellOf(runs, d, '2026-11-03')).toMatchObject({ state: 'level', level: 4 });
  expect(cellOf(runs, d, '2026-11-02')).toMatchObject({ state: 'level', level: 1 });
  expect(cellOf(runs, d, '2026-11-01')).toMatchObject({ state: 'level', level: 2 });
  expect(cellOf(runs, d, '2026-10-31').state).toBe('empty');
});

test('fasting levels', () => {
  const d = emptyData();
  d.fasts.push({ id: 'a', start: '2026-11-03T15:00:00-05:00', end: '2026-11-04T09:45:00-05:00' }); // 18.75h
  d.fasts.push({ id: 'b', start: '2026-11-04T18:00:00-05:00', end: '2026-11-05T09:00:00-05:00' }); // 15h
  expect(cellOf(fast, d, '2026-11-04')).toMatchObject({ state: 'level', level: 4 });
  expect(cellOf(fast, d, '2026-11-05')).toMatchObject({ state: 'level', level: 2 });
  expect(cellOf(fast, d, '2026-11-02').state).toBe('empty');
});

test('cellStyle', () => {
  expect(cellStyle({ date: '', state: 'missed', level: 0 }, 'blue'))
    .toEqual({ background: 'transparent', boxShadow: 'inset 0 0 0 1.5px #e0653a' });
  expect(cellStyle({ date: '', state: 'duePending', level: 0 }, 'blue'))
    .toEqual({ background: 'transparent', boxShadow: 'inset 0 0 0 1.5px #8a929c' });
  expect(cellStyle({ date: '', state: 'notDue', level: 0 }, 'blue').background).toBe('var(--cell-off)');
  expect(cellStyle({ date: '', state: 'empty', level: 0 }, 'blue').background).toBe('var(--cell-empty)');
  expect(cellStyle({ date: '', state: 'future', level: 0 }, 'blue').background).toBe('transparent');
  expect(cellStyle({ date: '', state: 'level', level: 4 }, 'cyan').background).toBe('#3fd0e3');
  expect(cellStyle({ date: '', state: 'level', level: 1 }, 'green').background).toBe(PALETTES.green[0]);
});
