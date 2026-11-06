import { test, expect } from 'vitest';
import { buildHabit, formFromHabit, validateForm, healthDone, type FormState } from './habitForm.ts';
import { seedHabits } from './testData.ts';

const today = '2026-11-06';
const laundry = seedHabits().find((h) => h.id === 'laundry')!;
const blank: FormState = { name: 'Water plants', color: 'green', schedule: { type: 'daily' }, done: { type: 'check' } };

test('new habit id is the slugged name, with a suffix when taken', () => {
  const taken = [{ ...laundry, id: 'water-plants' }, { ...laundry, id: 'water-plants-2' }];
  expect(buildHabit(blank, undefined, [], today).id).toBe('water-plants');
  expect(buildHabit(blank, undefined, taken.slice(0, 1), today).id).toBe('water-plants-2');
  expect(buildHabit(blank, undefined, taken, today).id).toBe('water-plants-3');
});

test('new habit starts today with its schedule', () => {
  const h = buildHabit({ ...blank, name: '  Water plants ' }, undefined, [], today);
  expect(h).toMatchObject({ name: 'Water plants', created: today, archived: false, schedules: [{ from: today, type: 'daily' }] });
});

test('a changed schedule appends a version starting today', () => {
  const f = { ...formFromHabit(laundry, today), schedule: { type: 'per_week' as const, count: 1 } };
  expect(buildHabit(f, laundry, [laundry], today).schedules).toEqual([
    { from: '2026-01-01', type: 'weekdays', days: ['fri'] },
    { from: today, type: 'per_week', count: 1 },
  ]);
});

test('editing twice on the same day keeps one version for today', () => {
  const f1 = { ...formFromHabit(laundry, today), schedule: { type: 'per_week' as const, count: 1 } };
  const once = buildHabit(f1, laundry, [laundry], today);
  const f2 = { ...formFromHabit(once, today), schedule: { type: 'per_week' as const, count: 3 } };
  const twice = buildHabit(f2, once, [once], today);
  expect(twice.schedules).toEqual([
    { from: '2026-01-01', type: 'weekdays', days: ['fri'] },
    { from: today, type: 'per_week', count: 3 },
  ]);
});

test('an unchanged schedule leaves schedules alone', () => {
  const f = { ...formFromHabit(laundry, today), name: 'Laundry day' };
  const h = buildHabit(f, laundry, [laundry], today);
  expect(h.schedules).toEqual(laundry.schedules);
  expect(h.name).toBe('Laundry day');
  expect(h.id).toBe('laundry');
});

test('validateForm', () => {
  expect(validateForm({ ...blank, name: '  ' })).toBe('Give it a name');
  expect(validateForm({ ...blank, schedule: { type: 'weekdays', days: [] } })).toBe('Pick at least one day');
  expect(validateForm(blank)).toBeNull();
});

test('the Workouts Health type defaults', () => {
  expect(healthDone('workouts', { type: 'check' })).toEqual({
    type: 'number', goal: 1, unit: 'runs', source: 'health', healthType: 'workouts',
    workoutType: 'running', measure: 'count', minDistanceKm: 1,
  });
});
