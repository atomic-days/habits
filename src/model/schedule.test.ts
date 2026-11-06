import { test, expect } from 'vitest';
import { scheduleOn, periodOf, lastDone, dueToday, dueYesterday, nextDue, comingUp } from './schedule.ts';
import { emptyData, habit } from './fixtures.ts';
import type { AppData, Habit } from './types.ts';

const now = new Date('2026-11-06T11:52:00-05:00');
const today = '2026-11-06'; // Friday
const laundry = habit({ id: 'laundry', done: { type: 'check' }, schedules: [{ from: '2026-01-01', type: 'weekdays', days: ['fri'] }] });
const cleaning = habit({ id: 'cleaning', done: { type: 'check' }, schedules: [{ from: '2026-01-01', type: 'weekdays', days: ['wed', 'sun'] }] });
const changed = habit({ id: 'x', done: { type: 'check' }, schedules: [{ from: '2026-10-01', type: 'daily' }, { from: '2026-11-05', type: 'weekdays', days: ['fri'] }] });

function logs(h: Habit, dates: string[]): AppData {
  const d = emptyData();
  for (const date of dates) d.logs.push({ habit: h.id, date, value: 1, at: `${date}T08:00:00-05:00` });
  return d;
}

test('scheduleOn picks the latest version at or before the date', () => {
  expect(scheduleOn(changed, '2026-11-04')?.type).toBe('daily');
  expect(scheduleOn(changed, '2026-11-05')?.type).toBe('weekdays');
  expect(scheduleOn(changed, '2026-09-30')).toBeNull();
});

test('periodOf', () => {
  expect(periodOf({ from: '', type: 'daily' }, today)).toEqual({ kind: 'day', start: today, end: today });
  expect(periodOf({ from: '', type: 'per_week', count: 2 }, today)).toEqual({ kind: 'week', start: '2026-11-02', end: '2026-11-08' });
  expect(periodOf({ from: '', type: 'per_month', count: 1 }, today)).toEqual({ kind: 'month', start: '2026-11-01', end: '2026-11-30' });
  expect(periodOf({ from: '', type: 'per_month', count: 1 }, '2028-02-10').end).toBe('2028-02-29');
});

test('weekdays due only on listed days', () => {
  expect(dueToday(laundry, emptyData(), today, now).due).toBe(true);
  expect(dueToday(laundry, emptyData(), '2026-11-05', now).due).toBe(false);
});

test('daily is always due', () => {
  const h = habit({ id: 'd', done: { type: 'check' } });
  expect(dueToday(h, emptyData(), today, now).due).toBe(true);
});

test('lastDone is strictly before', () => {
  const d = logs(laundry, ['2026-10-30', '2026-11-06']);
  expect(lastDone(laundry, d, '2026-11-06', now)).toBe('2026-10-30');
  expect(lastDone(laundry, d, '2026-10-30', now)).toBeNull();
});

test('per_week with one run is due with progress', () => {
  const h = habit({ id: 'r', done: { type: 'check' }, schedules: [{ from: '2026-01-01', type: 'per_week', count: 2 }] });
  expect(dueToday(h, logs(h, ['2026-11-03']), today, now)).toEqual({ due: true, progress: { done: 1, target: 2 } });
});

test('per_week with two runs is not due', () => {
  const h = habit({ id: 'r', done: { type: 'check' }, schedules: [{ from: '2026-01-01', type: 'per_week', count: 2 }] });
  const r = dueToday(h, logs(h, ['2026-11-03', '2026-11-04']), today, now);
  expect(r.due).toBe(false);
  expect(r.progress).toEqual({ done: 2, target: 2 });
});

test('per_week progress includes today', () => {
  const h = habit({ id: 'r', done: { type: 'check' }, schedules: [{ from: '2026-01-01', type: 'per_week', count: 2 }] });
  expect(dueToday(h, logs(h, ['2026-11-03', today]), today, now).progress).toEqual({ done: 2, target: 2 });
});

test('every_n_days 14 after 2026-10-20', () => {
  const h = habit({ id: 'sheets', done: { type: 'check' }, schedules: [{ from: '2026-01-01', type: 'every_n_days', n: 14 }] });
  const d = logs(h, ['2026-10-20']);
  expect(nextDue(h, d, '2026-10-30', now)).toBe('2026-11-03');
  expect(nextDue(h, d, today, now)).toBe('2026-11-03');
  expect(dueToday(h, d, today, now).due).toBe(true);
  expect(dueToday(h, d, '2026-11-02', now).due).toBe(false);
  expect(dueToday(h, emptyData(), today, now).due).toBe(true);
});

test('per_month done earlier this month is not due', () => {
  const h = habit({ id: 'fridge', done: { type: 'check' }, schedules: [{ from: '2026-01-01', type: 'per_month', count: 1 }] });
  expect(dueToday(h, logs(h, ['2026-11-02']), today, now).due).toBe(false);
  expect(dueToday(h, emptyData(), today, now).due).toBe(true);
});

test('nextDue for weekdays is strictly after today', () => {
  expect(nextDue(laundry, emptyData(), today, now)).toBe('2026-11-13');
  expect(nextDue(cleaning, emptyData(), today, now)).toBe('2026-11-08');
});

test('comingUp lists habits due in the next 3 days', () => {
  expect(comingUp([laundry, cleaning], emptyData(), today, now)).toEqual([{ habit: cleaning, date: '2026-11-08' }]);
});

test('comingUp skips archived habits', () => {
  const gone = { ...cleaning, archived: true };
  expect(comingUp([gone], emptyData(), today, now)).toEqual([]);
});

test('comingUp skips non-check habits and sorts by date', () => {
  const steps = habit({ id: 's', done: { type: 'number', goal: 10, unit: 'x', source: 'manual' } });
  const sat = habit({ id: 'sat', done: { type: 'check' }, schedules: [{ from: '2026-01-01', type: 'weekdays', days: ['sat'] }] });
  const out = comingUp([steps, cleaning, sat], emptyData(), today, now);
  expect(out.map((o) => o.habit.id)).toEqual(['sat', 'cleaning']);
});

test('dueYesterday: a weekdays check habit missed yesterday is on its grace day', () => {
  const sat = new Date('2026-11-07T09:00:00-05:00');
  expect(dueYesterday(laundry, emptyData(), '2026-11-07', sat)).toBe(true);
  const done: AppData = { ...emptyData(), logs: [{ habit: 'laundry', date: '2026-11-06', value: 1, at: '2026-11-06T20:00:00-05:00' }] };
  expect(dueYesterday(laundry, done, '2026-11-07', sat)).toBe(false);
});

test('dueYesterday: not when today is itself due, before created, or for other types', () => {
  const sat = new Date('2026-11-07T09:00:00-05:00');
  const frisat = habit({ id: 'x', done: { type: 'check' }, schedules: [{ from: '2026-01-01', type: 'weekdays', days: ['fri', 'sat'] }] });
  expect(dueYesterday(frisat, emptyData(), '2026-11-07', sat)).toBe(false);
  const fresh = { ...laundry, created: '2026-11-07' };
  expect(dueYesterday(fresh, emptyData(), '2026-11-07', sat)).toBe(false);
  const daily = habit({ id: 'd', done: { type: 'check' }, schedules: [{ from: '2026-01-01', type: 'daily' }] });
  expect(dueYesterday(daily, emptyData(), '2026-11-07', sat)).toBe(false);
});
