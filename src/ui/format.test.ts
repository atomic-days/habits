import { test, expect } from 'vitest';
import { longDate, shortDay, timeOfDay, number, weekdayName } from './format.ts';

test('longDate', () => expect(longDate('2026-11-06')).toBe('Friday, Nov 6'));
test('shortDay', () => expect(shortDay('2026-11-04')).toBe('Wed Nov 4'));
test('weekdayName', () => expect(weekdayName('2026-11-08')).toBe('Sunday'));
test('timeOfDay', () => {
  expect(timeOfDay('2026-11-06T11:40:00-05:00')).toBe('11:40 AM');
  expect(timeOfDay('2026-11-06T21:05:00-05:00')).toBe('9:05 PM');
});
test('number', () => {
  expect(number(8412)).toBe('8,412');
  expect(number(1588)).toBe('1,588');
  expect(number(7.25)).toBe('7.3');
});
