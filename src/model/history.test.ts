import { describe, test, expect } from 'vitest';
import { historySeries, recentEntries, rangeAverage, yTicks, type HistoryRange } from './history.ts';
import { seedData, seedHabits, SEED_NOW } from '../ui/testData.ts';
import type { AppData, Habit } from './types.ts';

const TODAY = '2026-11-06';
const NOW = SEED_NOW;
const get = (id: string): Habit => seedHabits().find((h) => h.id === id)!;
const series = (id: string, data: AppData, range: HistoryRange) => historySeries(get(id), data, TODAY, NOW, range);

describe('range shape', () => {
  const kinds = ['steps', 'sleep', 'fasting', 'runs', 'laundry'];
  test.each(kinds)('%s: 30 days is 30 daily points ending today, 12 weeks is 84', (id) => {
    if (id === 'laundry') return; // chores are weekly in every range, see below
    const d = seedData();
    const s30 = series(id, d, '30d');
    expect(s30.points).toHaveLength(30);
    expect(s30.points[0].date).toBe('2026-10-08');
    expect(s30.points[29].date).toBe(TODAY);
    expect(series(id, d, '12w').points).toHaveLength(84);
  });

  test.each(['steps', 'sleep', 'fasting', 'runs', 'laundry'])('%s: 1 year is 52 weekly points starting on Mondays', (id) => {
    const s = series(id, seedData(), '1y');
    expect(s.points).toHaveLength(52);
    expect(s.points[51].date).toBe('2026-11-02');
    expect(s.points[0].date).toBe('2025-11-10');
  });

  test('the form of each kind', () => {
    const d = seedData();
    expect(series('steps', d, '30d').kind).toBe('bar');
    expect(series('sleep', d, '30d').kind).toBe('line');
    expect(series('fasting', d, '30d').kind).toBe('bar');
    expect(series('runs', d, '30d').kind).toBe('bar');
    expect(series('laundry', d, '30d').kind).toBe('line');
  });
});

describe('number habits', () => {
  test('steps: gaps for missing days, met flags, goal and unit', () => {
    const s = series('steps', seedData(), '30d');
    const by = Object.fromEntries(s.points.map((p) => [p.date, p]));
    expect(by['2026-11-02']).toEqual({ date: '2026-11-02', value: null, met: false });
    expect(by['2026-11-03']).toEqual({ date: '2026-11-03', value: 10500, met: true });
    expect(by['2026-11-06']).toEqual({ date: '2026-11-06', value: 8412, met: false });
    expect(s.goal).toBe(10000);
    expect(s.unit).toBe('steps');
  });

  test('yMax covers the data and the goal, and ticks are round', () => {
    const s = series('steps', seedData(), '30d');
    expect(s.yMax).toBe(15000);
    expect(yTicks(s.yMax)).toEqual([0, 5000, 10000, 15000]);
    const d = seedData();
    d.health['2026-11-01'] = { steps: 30 };
    expect(series('steps', { ...d, health: { '2026-11-01': { steps: 30 } } }, '30d').yMax).toBe(10000);
    expect(yTicks(10000)).toEqual([0, 2500, 5000, 7500, 10000]);
  });

  test('steps 1 year: weekly average of the days that have data', () => {
    const s = series('steps', seedData(), '1y');
    const last = s.points[51];
    expect(last.date).toBe('2026-11-02');
    expect(last.value).toBeCloseTo((10500 + 10200 + 11000 + 8412) / 4, 5);
    expect(last.met).toBe(true);
    expect(s.points[50]).toEqual({ date: '2026-10-26', value: null, met: false });
    expect(s.goal).toBe(10000);
  });

  test('a weekly average below the goal is not met', () => {
    const d = seedData();
    d.health = { '2026-11-02': { steps: 4000 }, '2026-11-04': { steps: 6000 } };
    const p = series('steps', d, '1y').points[51];
    expect(p.value).toBe(5000);
    expect(p.met).toBe(false);
  });

  test('a manual number habit reads its logs', () => {
    const h: Habit = { id: 'pages', name: 'Pages', color: 'green', archived: false, created: '2026-01-01',
      schedules: [{ from: '2026-01-01', type: 'daily' }],
      done: { type: 'number', goal: 20, unit: 'pages', source: 'manual' } };
    const d = seedData();
    d.logs.push({ habit: 'pages', date: '2026-11-05', value: 25, at: '2026-11-05T20:00:00-05:00' });
    d.logs.push({ habit: 'pages', date: '2026-11-04', value: 5, at: '2026-11-04T20:00:00-05:00' });
    const s = historySeries(h, d, TODAY, NOW, '30d');
    expect(s.kind).toBe('bar');
    expect(s.points.find((p) => p.date === '2026-11-05')).toMatchObject({ value: 25, met: true });
    expect(s.points.find((p) => p.date === '2026-11-04')).toMatchObject({ value: 5, met: false });
    expect(s.points.find((p) => p.date === '2026-11-03')!.value).toBeNull();
    expect(s.unit).toBe('pages');
  });
});

describe('sleep', () => {
  test('a line of hours with the goal at 7', () => {
    const d = seedData();
    d.health['2026-11-04'] = { sleepMinutes: 450 };
    d.health['2026-11-05'] = { sleepMinutes: 360 };
    const s = series('sleep', d, '30d');
    expect(s.kind).toBe('line');
    expect(s.goal).toBe(7);
    expect(s.unit).toBe('hours');
    expect(s.points.find((p) => p.date === '2026-11-04')).toMatchObject({ value: 7.5, met: true });
    expect(s.points.find((p) => p.date === '2026-11-05')).toMatchObject({ value: 6, met: false });
    expect(s.points.find((p) => p.date === '2026-11-03')!.value).toBeNull();
  });

  test('1 year averages the nights of the week', () => {
    const d = seedData();
    d.health['2026-11-03'] = { sleepMinutes: 420 };
    d.health['2026-11-04'] = { sleepMinutes: 480 };
    const p = series('sleep', d, '1y').points[51];
    expect(p.value).toBe(7.5);
    expect(p.met).toBe(true);
  });
});

describe('fasting', () => {
  function fasted(): AppData {
    const d = seedData();
    d.fasts.push({ id: 'a', start: '2026-11-04T20:00:00-05:00', end: '2026-11-05T14:15:00-05:00' }); // 18.25h, credited 11-05
    d.fasts.push({ id: 'b', start: '2026-11-02T20:00:00-05:00', end: '2026-11-03T08:00:00-05:00' }); // 12h, missed
    return d;
  }

  test('a bar per day from fastHoursOn with the goal in hours', () => {
    const s = series('fasting', fasted(), '30d');
    expect(s.goal).toBe(16);
    expect(s.kind).toBe('bar');
    expect(s.points.find((p) => p.date === '2026-11-05')).toEqual({ date: '2026-11-05', value: 18.25, met: true });
    expect(s.points.find((p) => p.date === '2026-11-03')).toEqual({ date: '2026-11-03', value: 12, met: false });
    expect(s.points.find((p) => p.date === '2026-11-04')!.value).toBeNull();
  });

  test('1 year averages the fast days of the week', () => {
    const p = series('fasting', fasted(), '1y').points[51];
    expect(p.value).toBeCloseTo((18.25 + 12) / 2, 5);
    expect(p.met).toBe(false);
  });
});

describe('runs', () => {
  function ran(): AppData {
    const d = seedData();
    d.health['2026-11-03'] = { workouts: [
      { type: 'running', start: '2026-11-03T07:00:00-05:00', end: '2026-11-03T07:30:00-05:00', distanceKm: 5.2, durationMin: 30, avgHeartRate: null },
      { type: 'running', start: '2026-11-03T18:00:00-05:00', end: '2026-11-03T18:05:00-05:00', distanceKm: 0.4, durationMin: 5, avgHeartRate: null },
      { type: 'cycling', start: '2026-11-03T19:00:00-05:00', end: '2026-11-03T19:30:00-05:00', distanceKm: 9, durationMin: 30, avgHeartRate: null },
    ] };
    d.health['2026-11-05'] = { workouts: [
      { type: 'running', start: '2026-11-05T07:00:00-05:00', end: '2026-11-05T07:30:00-05:00', distanceKm: 3, durationMin: 20, avgHeartRate: null },
    ] };
    return d;
  }

  test('a bar of qualifying km per day, and no goal line', () => {
    const s = series('runs', ran(), '30d');
    expect(s.unit).toBe('km');
    expect(s.goal).toBeNull();
    expect(s.points.find((p) => p.date === '2026-11-03')).toEqual({ date: '2026-11-03', value: 5.2, met: true });
    expect(s.points.find((p) => p.date === '2026-11-05')).toMatchObject({ value: 3, met: true });
    expect(s.points.find((p) => p.date === '2026-11-02')!.value).toBeNull();
  });

  test('1 year is the weekly total in km', () => {
    const p = series('runs', ran(), '1y').points[51];
    expect(p.value).toBeCloseTo(8.2, 5);
    expect(p.met).toBe(true);
  });

  test('a week without any health data is a gap, not zero', () => {
    expect(series('runs', ran(), '1y').points[50].value).toBeNull();
  });
});

describe('chores', () => {
  function chores(): AppData {
    const d = seedData();
    const log = (habit: string, date: string) => d.logs.push({ habit, date, value: 1, at: `${date}T20:00:00-04:00` });
    log('laundry', '2026-10-09');
    log('laundry', '2026-10-16');
    log('cleaning', '2026-11-04');
    return d;
  }

  test('30 days is a weekly completion percentage, done due days over due days', () => {
    const s = series('laundry', chores(), '30d');
    expect(s.kind).toBe('line');
    expect(s.unit).toBe('%');
    expect(s.goal).toBeNull();
    expect(s.yMax).toBe(100);
    expect(s.points.map((p) => p.date)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02']);
    expect(s.points.map((p) => p.value)).toEqual([100, 100, 0, 0, null]);
    expect(s.points.map((p) => p.met)).toEqual([true, true, false, false, false]);
  });

  test('a week with two due days can land on 50 percent, and Sunday is not yet due', () => {
    const d = chores();
    d.logs.push({ habit: 'cleaning', date: '2026-10-28', value: 1, at: '2026-10-28T20:00:00-04:00' });
    const s = series('cleaning', d, '30d');
    const by = Object.fromEntries(s.points.map((p) => [p.date, p.value]));
    expect(by['2026-10-26']).toBe(50); // Wed done, Sun 11-01 missed
    expect(by['2026-11-02']).toBe(100); // Wed done; Sun 11-08 is in the future
  });

  test('12 weeks and 1 year stay weekly percentages', () => {
    expect(series('laundry', chores(), '12w').points).toHaveLength(12);
    expect(series('laundry', chores(), '12w').points[11].date).toBe('2026-11-02');
    const y = series('laundry', chores(), '1y');
    expect(y.points).toHaveLength(52);
    expect(y.yMax).toBe(100);
    expect(y.points[0].value).toBeNull(); // before the habit existed
    expect(y.points[45].value).toBe(0);
  });

  test('weeks before the habit existed are gaps', () => {
    const d = chores();
    const h = { ...get('laundry'), created: '2026-10-12', schedules: [{ from: '2026-10-12', type: 'daily' as const }] };
    const s = historySeries(h, d, TODAY, NOW, '30d');
    expect(s.points[0].value).toBeNull();
  });
});

describe('rangeAverage', () => {
  test('steps over 30 days is the mean of days with data', () => {
    expect(rangeAverage(get('steps'), seedData(), TODAY, NOW, '30d')).toBeCloseTo((10500 + 10200 + 11000 + 8412) / 4, 5);
  });
  test('nothing logged is null', () => {
    expect(rangeAverage(get('sleep'), seedData(), TODAY, NOW, '30d')).toBeNull();
  });
  test('chores average the weekly percentages', () => {
    const d = seedData();
    d.logs.push({ habit: 'laundry', date: '2026-10-09', value: 1, at: '2026-10-09T20:00:00-04:00' });
    expect(rangeAverage(get('laundry'), d, TODAY, NOW, '30d')).toBe(25);
  });
});

describe('recentEntries', () => {
  test('fasts read start to end with the duration, newest first', () => {
    const d = seedData();
    d.fasts.push({ id: 'old', start: '2026-11-02T20:00:00-05:00', end: '2026-11-03T12:00:00-05:00' });
    d.fasts.push({ id: 'new', start: '2026-11-05T21:30:00-05:00', end: '2026-11-06T13:45:00-05:00' });
    const e = recentEntries(get('fasting'), d, TODAY, NOW, 14);
    expect(e.map((x) => x.text)).toEqual([
      'Thu 9:30 PM → Fri 1:45 PM · 16h 15m',
      'Mon 8:00 PM → Tue 12:00 PM · 16h 0m',
    ]);
  });

  test('a fast still running says now', () => {
    const d = seedData();
    d.fasts.push({ id: 'cur', start: '2026-11-05T21:30:00-05:00', end: null });
    expect(recentEntries(get('fasting'), d, TODAY, NOW, 14)[0].text).toBe('Thu 9:30 PM → now · 14h 22m');
  });

  test('runs list the km of each day with a qualifying run', () => {
    const d = seedData();
    d.health['2026-11-03'].workouts![0].distanceKm = 5.2;
    d.health['2026-11-05'] = { workouts: [
      { type: 'running', start: '2026-11-05T07:00:00-05:00', end: '2026-11-05T07:20:00-05:00', distanceKm: 3, durationMin: 20, avgHeartRate: null },
    ] };
    expect(recentEntries(get('runs'), d, TODAY, NOW, 14).map((x) => x.text)).toEqual([
      'Thu Nov 5 · 3 km',
      'Tue Nov 3 · 5.2 km',
    ]);
  });

  test('numbers list the value and unit, newest first, skipping gaps', () => {
    const e = recentEntries(get('steps'), seedData(), TODAY, NOW, 14);
    expect(e.map((x) => x.text)).toEqual([
      'Fri Nov 6 · 8,412 steps',
      'Thu Nov 5 · 11,000 steps',
      'Wed Nov 4 · 10,200 steps',
      'Tue Nov 3 · 10,500 steps',
    ]);
  });

  test('an entry for 7,592 steps', () => {
    const d = seedData();
    d.health['2026-11-04'] = { steps: 7592 };
    expect(recentEntries(get('steps'), d, TODAY, NOW, 14).map((x) => x.text)).toContain('Wed Nov 4 · 7,592 steps');
  });

  test('the limit keeps the newest', () => {
    const d = seedData();
    for (let i = 1; i <= 30; i++) d.health[`2026-10-${String(i).padStart(2, '0')}`] = { steps: 1000 + i };
    const e = recentEntries(get('steps'), d, TODAY, NOW, 14);
    expect(e).toHaveLength(14);
    expect(e[0].date).toBe('2026-11-06');
    expect(e[13].date).toBe('2026-10-21');
  });

  test('chores list the days they were done', () => {
    const d = seedData();
    d.logs.push({ habit: 'laundry', date: '2026-10-30', value: 1, at: '2026-10-30T20:00:00-04:00' });
    d.logs.push({ habit: 'laundry', date: '2026-11-06', value: 1, at: '2026-11-06T09:00:00-05:00' });
    expect(recentEntries(get('laundry'), d, TODAY, NOW, 14).map((x) => x.text)).toEqual([
      'Fri Nov 6 · done',
      'Fri Oct 30 · done',
    ]);
  });

  test('nothing recorded is an empty list', () => {
    expect(recentEntries(get('sleep'), seedData(), TODAY, NOW, 14)).toEqual([]);
  });
});


