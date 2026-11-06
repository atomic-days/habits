import { test, expect } from 'vitest';
import { dayValue, isMet, completions } from './values.ts';
import { emptyData, habit } from './fixtures.ts';

const now = new Date('2026-11-06T11:52:00-05:00');
const steps = habit({ id: 'steps', done: { type: 'number', goal: 10000, unit: 'steps', source: 'health', healthType: 'steps' } });
const sleep = habit({ id: 'sleep', done: { type: 'number', goal: 7, unit: 'h', source: 'health', healthType: 'sleep' } });
const runs = habit({ id: 'runs', done: { type: 'number', goal: 1, unit: 'runs', source: 'health', healthType: 'workouts', workoutType: 'running', measure: 'count', minDistanceKm: 1 } });
const km = habit({ id: 'km', done: { type: 'number', goal: 5, unit: 'km', source: 'health', healthType: 'workouts', workoutType: 'running', measure: 'distance', minDistanceKm: 1 } });
const mins = habit({ id: 'mins', done: { type: 'number', goal: 40, unit: 'min', source: 'health', healthType: 'workouts', workoutType: 'running', measure: 'minutes', minDistanceKm: 1 } });
const check = habit({ id: 'read', done: { type: 'check' } });
const pages = habit({ id: 'pages', done: { type: 'number', goal: 20, unit: 'pages', source: 'manual' } });
const fast = habit({ id: 'fast', done: { type: 'timer', goalHours: 16 } });
const run = (km: number, type = 'running') => ({ type, start: '', end: '', distanceKm: km, durationMin: 30, avgHeartRate: null });

const d = emptyData();
d.health['2026-11-06'] = { steps: 8412, sleepMinutes: 432, workouts: [run(5.2), run(0.5), run(3, 'walking')] };
d.health['2026-11-05'] = { steps: 10200, workouts: [run(4), run(6)] };
d.logs.push({ habit: 'read', date: '2026-11-06', value: 1, at: '2026-11-06T08:00:00-05:00' });
d.logs.push({ habit: 'pages', date: '2026-11-06', value: 12, at: '2026-11-06T08:00:00-05:00' });
d.fasts.push({ id: 'f1', start: '2026-11-04T18:00:00-05:00', end: '2026-11-05T12:00:00-05:00' });

test('health steps', () => {
  expect(dayValue(steps, '2026-11-06', d, now)).toBe(8412);
  expect(isMet(steps, '2026-11-06', d, now)).toBe(false);
  expect(isMet(steps, '2026-11-05', d, now)).toBe(true);
  expect(dayValue(steps, '2026-11-04', d, now)).toBeNull();
  expect(isMet(steps, '2026-11-04', d, now)).toBe(false);
});
test('sleep converts minutes to hours', () => {
  expect(dayValue(sleep, '2026-11-06', d, now)).toBeCloseTo(7.2);
  expect(isMet(sleep, '2026-11-06', d, now)).toBe(true);
});
test('workouts filter by type and distance', () => {
  expect(dayValue(runs, '2026-11-06', d, now)).toBe(1);
  expect(dayValue(km, '2026-11-06', d, now)).toBeCloseTo(5.2);
  expect(isMet(km, '2026-11-06', d, now)).toBe(true);
  expect(dayValue(mins, '2026-11-05', d, now)).toBe(60);
  expect(completions(runs, '2026-11-05', d, now)).toBe(2);
  expect(completions(runs, '2026-11-06', d, now)).toBe(1);
  expect(completions(runs, '2026-11-04', d, now)).toBe(0);
});
test('check and manual number', () => {
  expect(dayValue(check, '2026-11-06', d, now)).toBe(1);
  expect(dayValue(check, '2026-11-05', d, now)).toBe(0);
  expect(isMet(check, '2026-11-06', d, now)).toBe(true);
  expect(dayValue(pages, '2026-11-06', d, now)).toBe(12);
  expect(isMet(pages, '2026-11-06', d, now)).toBe(false);
  expect(dayValue(pages, '2026-11-05', d, now)).toBeNull();
});
test('timer is met on a credited day', () => {
  expect(isMet(fast, '2026-11-05', d, now)).toBe(true);
  expect(dayValue(fast, '2026-11-05', d, now)).toBe(18);
  expect(isMet(fast, '2026-11-06', d, now)).toBe(false);
  expect(completions(fast, '2026-11-05', d, now)).toBe(1);
});
