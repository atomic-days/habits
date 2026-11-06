import { test, expect } from 'vitest';
import { fastHours, fastCreditDays, fastHoursOn, validateFast } from './fasting.ts';

const now = new Date('2026-11-06T11:52:00-05:00');
const f = (start: string, end: string | null) => ({ id: 'x', start, end });

test('a long fast credits each day it passes the goal', () => {
  expect(fastCreditDays(f('2026-11-02T12:00:00-05:00', '2026-11-04T04:00:00-05:00'), 16, now))
    .toEqual(['2026-11-03', '2026-11-04']);
  expect(fastCreditDays(f('2026-11-02T20:00:00-05:00', '2026-11-03T12:00:00-05:00'), 16, now))
    .toEqual(['2026-11-03']);
});
test('a running fast credits only once it reaches the goal', () => {
  expect(fastCreditDays(f('2026-11-05T21:52:00-05:00', null), 16, now)).toEqual([]);
  expect(fastCreditDays(f('2026-11-05T17:07:00-05:00', null), 16, now)).toEqual(['2026-11-06']);
});
test('a fast shorter than the goal credits nothing', () => {
  expect(fastCreditDays(f('2026-11-04T08:00:00-05:00', '2026-11-04T20:00:00-05:00'), 16, now)).toEqual([]);
});
test('fastHours is real elapsed time across fall-back', () => {
  expect(fastHours(f('2026-10-31T20:00:00-04:00', '2026-11-01T12:00:00-05:00'), now)).toBe(17);
  expect(fastHours(f('2026-11-06T01:52:00-05:00', null), now)).toBe(10);
});
test('fastHoursOn falls back to a missed fast that ended that day', () => {
  expect(fastHoursOn([f('2026-11-04T08:00:00-05:00', '2026-11-04T22:00:00-05:00')], '2026-11-04', 16, now)).toBe(14);
  expect(fastHoursOn([], '2026-11-04', 16, now)).toBeNull();
});
test('fastHoursOn prefers the longest credited fast', () => {
  const a = f('2026-11-02T20:00:00-05:00', '2026-11-03T13:00:00-05:00'); // 17h, credits 11-03
  const b = f('2026-11-02T18:00:00-05:00', '2026-11-03T14:00:00-05:00'); // 20h, credits 11-03
  expect(fastHoursOn([a, b], '2026-11-03', 16, now)).toBe(20);
});
test('validateFast', () => {
  expect(validateFast('2026-11-06T10:00:00-05:00', '2026-11-06T09:00:00-05:00', now)).toBe('End must be after start');
  expect(validateFast('2026-11-06T13:00:00-05:00', null, now)).toBe("Start can't be in the future");
  expect(validateFast('2026-11-05T20:00:00-05:00', null, now)).toBeNull();
});

test('validateFast rejects times that do not parse', () => {
  expect(validateFast('nope', null, now)).toBe('Enter a valid date and time');
  expect(validateFast('2026-11-05T20:00:00-05:00', 'nope', now)).toBe('Enter a valid date and time');
});
test('bad times or goals never loop forever', () => {
  expect(fastCreditDays(f('nope', null), 16, now)).toEqual([]);
  expect(fastCreditDays(f('2026-11-05T20:00:00-05:00', 'nope'), 16, now)).toEqual([]);
  expect(fastCreditDays(f('2026-11-05T20:00:00-05:00', null), NaN, now)).toEqual([]);
  expect(fastCreditDays(f('2026-11-05T20:00:00-05:00', null), 0, now)).toEqual([]);
  expect(fastCreditDays(f('2026-11-05T20:00:00-05:00', null), Infinity, now)).toEqual([]);
  expect(fastHours(f('nope', null), now)).toBe(0);
  expect(fastHours(f('2026-11-05T20:00:00-05:00', 'nope'), now)).toBe(0);
});
