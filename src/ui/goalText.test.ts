import { test, expect } from 'vitest';
import { goalText } from './goalText.ts';
import { habit } from '../model/fixtures.ts';
import type { Done, Schedule } from '../model/types.ts';

const F = '2026-01-01';
const check: Done = { type: 'check' };
const g = (done: Done, s: Schedule) => goalText(habit({ id: 'x', done, schedules: [s] }));

test('goalText', () => {
  expect(g(check, { from: F, type: 'weekdays', days: ['fri'] })).toBe('Every Friday');
  expect(g(check, { from: F, type: 'weekdays', days: ['sun', 'wed'] })).toBe('Wednesdays and Sundays');
  expect(g(check, { from: F, type: 'weekdays', days: ['mon', 'wed', 'fri'] })).toBe('Mondays, Wednesdays and Fridays');
  expect(g({ type: 'number', goal: 10000, unit: 'steps', source: 'health', healthType: 'steps' }, { from: F, type: 'daily' }))
    .toBe('Goal 10,000 steps');
  expect(g({ type: 'number', goal: 7, unit: 'hours', source: 'health', healthType: 'sleep' }, { from: F, type: 'daily' }))
    .toBe('Goal 7 hours');
  expect(g({ type: 'number', goal: 1, unit: 'runs', source: 'health', healthType: 'workouts', workoutType: 'running', measure: 'count', minDistanceKm: 1 },
    { from: F, type: 'per_week', count: 2 })).toBe('Goal 2 a week');
  expect(g(check, { from: F, type: 'every_n_days', n: 14 })).toBe('Every 14 days');
  expect(g(check, { from: F, type: 'per_month', count: 1 })).toBe('1 a month');
  expect(g({ type: 'timer', goalHours: 16 }, { from: F, type: 'daily' })).toBe('Goal 16h');
  expect(g(check, { from: F, type: 'daily' })).toBe('Every day');
});

test('goalText uses the latest schedule', () => {
  const h = habit({ id: 'x', done: check, schedules: [
    { from: F, type: 'daily' }, { from: '2026-06-01', type: 'weekdays', days: ['fri'] }] });
  expect(goalText(h)).toBe('Every Friday');
});
