import { test, expect } from 'vitest';
import {
  toDateKey, dateKeyAt, addDays, dayOfWeek, weekdayOf, weekStart, monthKey, daysBetween, hoursBetween,
} from './dates.ts';

test('toDateKey uses local time', () => {
  expect(toDateKey(new Date(2026, 10, 6, 23, 59))).toBe('2026-11-06');
});
test('dateKeyAt converts an instant to the local day', () => {
  expect(dateKeyAt('2026-11-07T03:30:00Z')).toBe('2026-11-06');
});
test('addDays crosses months and DST changes', () => {
  expect(addDays('2026-10-31', 2)).toBe('2026-11-02');
  expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  expect(addDays('2027-03-14', 1)).toBe('2027-03-15');
  expect(addDays('2026-11-02', -3)).toBe('2026-10-30');
});
test('weekday helpers start on Monday', () => {
  expect(dayOfWeek('2026-11-06')).toBe(4);
  expect(weekdayOf('2026-11-08')).toBe('sun');
  expect(weekStart('2026-11-08')).toBe('2026-11-02');
  expect(weekStart('2026-11-02')).toBe('2026-11-02');
});
test('monthKey and daysBetween', () => {
  expect(monthKey('2026-11-06')).toBe('2026-11');
  expect(daysBetween('2026-11-01', '2026-11-08')).toBe(7);
  expect(daysBetween('2026-11-08', '2026-11-01')).toBe(-7);
});
test('hoursBetween spans the fall-back change', () => {
  expect(hoursBetween('2026-10-31T20:00:00-04:00', '2026-11-01T12:00:00-05:00')).toBe(17);
  expect(hoursBetween('2026-11-06T10:00:00-05:00', new Date('2026-11-06T11:30:00-05:00'))).toBe(1.5);
});
