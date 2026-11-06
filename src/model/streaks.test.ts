import { test, expect } from 'vitest';
import { streak } from './streaks.ts';
import { emptyData, habit } from './fixtures.ts';
import { addDays } from './dates.ts';
import type { AppData, Habit, Schedule } from './types.ts';

const now = new Date('2026-11-06T11:52:00-05:00');
const today = '2026-11-06'; // Friday

function checks(h: Habit, dates: string[]): AppData {
  const d = emptyData();
  for (const date of dates) d.logs.push({ habit: h.id, date, value: 1, at: `${date}T08:00:00-05:00` });
  return d;
}
const check = (id: string, schedules: Schedule[]) => habit({ id, done: { type: 'check' }, schedules, created: '2026-01-01' });
const fridays = [{ from: '2026-01-01', type: 'weekdays' as const, days: ['fri' as const] }];

const steps = habit({ id: 'steps', done: { type: 'number', goal: 10000, unit: 'steps', source: 'health', healthType: 'steps' } });
function stepsData(todaySteps: number): AppData {
  const d = emptyData();
  d.health['2026-11-03'] = { steps: 11000 };
  d.health['2026-11-04'] = { steps: 12000 };
  d.health['2026-11-05'] = { steps: 10200 };
  d.health['2026-11-02'] = { steps: 4000 };
  d.health[today] = { steps: todaySteps };
  return d;
}

test('daily steps, today still in progress', () => {
  expect(streak(steps, stepsData(8412), today, now)).toMatchObject({ current: 3, unit: 'day' });
});

test('daily steps, today reached the goal', () => {
  expect(streak(steps, stepsData(10200), today, now).current).toBe(4);
});

test('Friday laundry: 6 Fridays done, 7th missed, today not done', () => {
  const h = check('laundry', fridays);
  const dates = [1, 2, 3, 4, 5, 6].map((i) => addDays(today, -7 * i));
  const s = streak(h, checks(h, dates), today, now);
  expect(s.current).toBe(6);
  expect(s.unit).toBe('time');
});

test('due Friday done Saturday still counts and the streak continues', () => {
  const h = check('laundry', fridays);
  const s = streak(h, checks(h, ['2026-10-23', '2026-10-31', '2026-11-06']), today, now);
  expect(s.current).toBe(3);
});

test('Saturday missed, Sunday done restarts the streak at Sunday', () => {
  const h = check('weekend', [{ from: '2026-01-01', type: 'weekdays', days: ['sat', 'sun'] }]);
  const s = streak(h, checks(h, ['2026-10-25', '2026-11-01']), today, now);
  expect(s.current).toBe(1);
  expect(s.best).toBe(1);
});

test('due Thursday not done, today Friday: Thursday is pending', () => {
  const h = check('thu', [{ from: '2026-01-01', type: 'weekdays', days: ['thu'] }]);
  const s = streak(h, checks(h, ['2026-10-22', '2026-10-29']), today, now);
  expect(s.current).toBe(2);
});

test('per_week 2: week before the four has only 1', () => {
  const h = check('runs', [{ from: '2026-01-01', type: 'per_week', count: 2 }]);
  const d = checks(h, ['2026-09-30',
    '2026-10-06', '2026-10-07', '2026-10-13', '2026-10-14', '2026-10-20', '2026-10-21', '2026-10-27', '2026-10-28', '2026-11-03']);
  // 09-28 week: 1 (unmet); 10-05, 10-12, 10-19, 10-26 weeks: 2 each; this week: 1.
  expect(streak(h, d, today, now)).toMatchObject({ current: 4, unit: 'week' });
});

const sheets = check('sheets', [{ from: '2026-01-01', type: 'every_n_days', n: 14 }]);
const sheetsDone = ['2026-09-01', '2026-09-14', '2026-10-01', '2026-10-12'];

test('every_n_days 14, late completion breaks, today 2026-10-20', () => {
  expect(streak(sheets, checks(sheets, sheetsDone), '2026-10-20', now)).toMatchObject({ current: 1, best: 2 });
});

test('every_n_days 14, due date passed with no completion', () => {
  expect(streak(sheets, checks(sheets, sheetsDone), today, now).current).toBe(0);
});

test('per_month 1 done in Sep and Oct, not yet in Nov', () => {
  const h = check('fridge', [{ from: '2026-01-01', type: 'per_month', count: 1 }]);
  const s = streak(h, checks(h, ['2026-09-10', '2026-10-15']), today, now);
  expect(s).toMatchObject({ current: 2, unit: 'month' });
});

test('Wednesdays all done: current equals the number of Wednesdays', () => {
  const h = habit({ id: 'wed', done: { type: 'check' }, created: '2026-09-02', schedules: [{ from: '2026-09-02', type: 'weekdays', days: ['wed'] }] });
  const wed = ['2026-09-02', '2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30', '2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28', '2026-11-04'];
  expect(streak(h, checks(h, wed), today, now)).toMatchObject({ current: 10, best: 10 });
});

test('schedule change: days before it judged daily, after it Fridays only', () => {
  const h = habit({ id: 'x', done: { type: 'check' }, created: '2026-10-20', schedules: [
    { from: '2026-10-20', type: 'daily' }, { from: '2026-11-01', type: 'weekdays', days: ['fri'] }] });
  const dates: string[] = [];
  for (let k = '2026-10-20'; k <= '2026-10-31'; k = addDays(k, 1)) dates.push(k);
  const s = streak(h, checks(h, dates), today, now);
  expect(s.current).toBe(12);
  expect(s.unit).toBe('time');
});

test('schedule change: a missed daily day before the change still breaks', () => {
  const h = habit({ id: 'x', done: { type: 'check' }, created: '2026-10-20', schedules: [
    { from: '2026-10-20', type: 'daily' }, { from: '2026-11-01', type: 'weekdays', days: ['fri'] }] });
  const s = streak(h, checks(h, ['2026-10-20', '2026-10-22', '2026-10-31']), today, now);
  expect(s.current).toBe(1);
});

test('sleep habit counts nights', () => {
  const h = habit({ id: 'sleep', done: { type: 'number', goal: 7, unit: 'h', source: 'health', healthType: 'sleep' } });
  expect(streak(h, emptyData(), today, now).unit).toBe('night');
});

test('weekly and monthly units', () => {
  expect(streak(check('a', [{ from: '2026-01-01', type: 'per_week', count: 1 }]), emptyData(), today, now).unit).toBe('week');
  expect(streak(check('b', [{ from: '2026-01-01', type: 'daily' }]), emptyData(), today, now).unit).toBe('day');
});

test('a day that is not due never breaks the streak', () => {
  const h = check('laundry', fridays);
  const d = checks(h, ['2026-10-23', '2026-10-30', '2026-11-06']);
  expect(streak(h, d, today, now)).toMatchObject({ current: 3 });
  expect(streak(h, d, '2026-11-08', now).current).toBe(3);
});
