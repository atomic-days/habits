import { describe, expect, test } from 'vitest';
import { keepStoredWorkouts, parseInbox } from './inbox-parse.ts';

const HEADER = 'window|2026-11-03T00:00:00-05:00|2026-11-06T07:30:00-05:00|2026-11-06T07:30:00-05:00';
const parse = (...lines: string[]) => parseInbox([HEADER, ...lines].join('\n'));
const ZERO = { steps: 0, sleepMinutes: 0, exerciseMinutes: 0, waterLiters: 0, mindfulMinutes: 0 };

describe('parseInbox', () => {
  test('takes sentAt from the header and gives every date in the window zeros', () => {
    const r = parse();
    expect(r.sentAt).toBe('2026-11-06T07:30:00-05:00');
    expect(r.skipped).toBe(0);
    expect(Object.keys(r.days)).toEqual(['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
    expect(r.days['2026-11-04']).toEqual(ZERO);
  });

  test('a window across the end of a month covers both months', () => {
    const r = parseInbox('window|2026-10-30T00:00:00-04:00|2026-11-02T08:00:00-05:00|2026-11-02T08:00:00-05:00');
    expect(Object.keys(r.days)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });

  test('sums steps per date and reads numbers with grouping commas', () => {
    const r = parse(
      'steps|2026-11-05T00:00:00-05:00|2026-11-06T00:00:00-05:00|8,412|count',
      'steps|2026-11-05T12:00:00-05:00|2026-11-05T13:00:00-05:00|100|count',
      'steps|2026-11-06T00:00:00-05:00|2026-11-06T07:30:00-05:00|1 200|count',
    );
    expect(r.days['2026-11-05'].steps).toBe(8512);
    expect(r.days['2026-11-06'].steps).toBe(1200);
    expect(r.days['2026-11-04'].steps).toBe(0);
  });

  test('a sample counts for the date written in its ISO string, whatever the offset', () => {
    // 01:00 in Tokyo on 11-06 is still 11-05 in New York. The phone wrote 11-06, so 11-06 it is.
    const r = parse('steps|2026-11-06T01:00:00+09:00|2026-11-06T02:00:00+09:00|50|count');
    expect(r.days['2026-11-06'].steps).toBe(50);
    expect(r.days['2026-11-05'].steps).toBe(0);
  });

  test('sums exercise minutes per date', () => {
    const r = parse(
      'exercise|2026-11-05T00:00:00-05:00|2026-11-06T00:00:00-05:00|38|min',
      'exercise|2026-11-04T00:00:00-05:00|2026-11-05T00:00:00-05:00|1.5|hr',
    );
    expect(r.days['2026-11-05'].exerciseMinutes).toBe(38);
    expect(r.days['2026-11-04'].exerciseMinutes).toBe(90);
  });

  test('converts water to liters from mL, L and fl oz', () => {
    const r = parse(
      'water|2026-11-03T00:00:00-05:00|2026-11-04T00:00:00-05:00|1,800|mL',
      'water|2026-11-04T00:00:00-05:00|2026-11-05T00:00:00-05:00|2.5|L',
      'water|2026-11-05T00:00:00-05:00|2026-11-06T00:00:00-05:00|64|fl oz',
      'water|2026-11-06T00:00:00-05:00|2026-11-07T00:00:00-05:00|16|fl_oz_us',
    );
    expect(r.days['2026-11-03'].waterLiters).toBe(1.8);
    expect(r.days['2026-11-04'].waterLiters).toBe(2.5);
    expect(r.days['2026-11-05'].waterLiters).toBeCloseTo(1.893, 3);
    expect(r.days['2026-11-06'].waterLiters).toBeCloseTo(0.473, 3);
    expect(r.skipped).toBe(0);
  });

  test('sums mindful minutes per start date from the start and end times', () => {
    const r = parse(
      'mindful|2026-11-05T07:00:00-05:00|2026-11-05T07:10:00-05:00||',
      'mindful|2026-11-05T21:00:00-05:00|2026-11-05T21:05:30-05:00|1|count',
    );
    expect(r.days['2026-11-05'].mindfulMinutes).toBe(15.5);
  });

  test('sums the asleep stages and skips In Bed and Awake', () => {
    const r = parse(
      'sleep|2026-11-05T22:30:00-05:00|2026-11-06T06:30:00-05:00|In Bed|',
      'sleep|2026-11-05T23:00:00-05:00|2026-11-06T01:00:00-05:00|Core|',
      'sleep|2026-11-06T01:00:00-05:00|2026-11-06T02:00:00-05:00|Asleep Deep|',
      'sleep|2026-11-06T02:00:00-05:00|2026-11-06T02:20:00-05:00|Awake|',
      'sleep|2026-11-06T02:20:00-05:00|2026-11-06T03:20:00-05:00|REM|',
      'sleep|2026-11-06T03:20:00-05:00|2026-11-06T04:00:00-05:00|Asleep|',
      'sleep|2026-11-06T04:00:00-05:00|2026-11-06T06:00:00-05:00|Asleep Unspecified|',
    );
    expect(r.days['2026-11-06'].sleepMinutes).toBe(120 + 60 + 60 + 40 + 120);
    expect(r.days['2026-11-05'].sleepMinutes).toBe(0);
    expect(r.skipped).toBe(0);
  });

  test('a night counts for the date whose 18:00-to-18:00 window holds the sample end', () => {
    const r = parse(
      'sleep|2026-11-04T13:00:00-05:00|2026-11-04T14:00:00-05:00|Asleep|', // afternoon nap, 11-04
      'sleep|2026-11-04T17:00:00-05:00|2026-11-04T19:00:00-05:00|Core|', // ends after 18:00, so 11-05
      'sleep|2026-11-04T17:30:00-05:00|2026-11-04T18:00:00-05:00|Core|', // ends at 18:00 exactly, so 11-05
    );
    expect(r.days['2026-11-04'].sleepMinutes).toBe(60);
    expect(r.days['2026-11-05'].sleepMinutes).toBe(150);
  });

  test('a night that starts the evening before the window counts for the first day', () => {
    const r = parse('sleep|2026-11-02T23:00:00-05:00|2026-11-03T06:00:00-05:00|Core|');
    expect(r.days['2026-11-03'].sleepMinutes).toBe(420);
    expect(r.days['2026-11-02']).toBeUndefined();
  });

  test('drops samples whose date falls outside the window without counting them as bad', () => {
    const r = parse(
      'steps|2026-11-02T00:00:00-05:00|2026-11-03T00:00:00-05:00|900|count',
      'sleep|2026-11-06T17:00:00-05:00|2026-11-06T19:00:00-05:00|Core|', // belongs to 11-07
    );
    expect(Object.keys(r.days)).toEqual(['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
    expect(r.days['2026-11-06'].sleepMinutes).toBe(0);
    expect(r.skipped).toBe(0);
  });

  test('makes one Workout per line, with the type in lower case to match habits and the distance in km', () => {
    const r = parse(
      'workout|2026-11-05T18:00:00-05:00|2026-11-05T18:32:00-05:00|Running|32|3.1|mi|151',
      'workout|2026-11-05T07:00:00-05:00|2026-11-05T07:45:00-05:00|Cycling|45|12000|m',
      'workout|2026-11-04T06:00:00-05:00|2026-11-04T06:20:00-05:00|Yoga|||',
    );
    expect(r.days['2026-11-05'].workouts).toEqual([
      { type: 'running', start: '2026-11-05T18:00:00-05:00', end: '2026-11-05T18:32:00-05:00',
        distanceKm: 4.989, durationMin: 32, avgHeartRate: 151 },
      { type: 'cycling', start: '2026-11-05T07:00:00-05:00', end: '2026-11-05T07:45:00-05:00',
        distanceKm: 12, durationMin: 45, avgHeartRate: null },
    ]);
    // No duration given: the start and end times decide it.
    expect(r.days['2026-11-04'].workouts).toEqual([
      { type: 'yoga', start: '2026-11-04T06:00:00-05:00', end: '2026-11-04T06:20:00-05:00',
        distanceKm: 0, durationMin: 20, avgHeartRate: null },
    ]);
    // A file that reports workouts gives every other day an empty list.
    expect(r.days['2026-11-06'].workouts).toEqual([]);
  });

  test('a file with no workout lines says nothing about workouts', () => {
    const r = parse('steps|2026-11-05T00:00:00-05:00|2026-11-06T00:00:00-05:00|10|count');
    for (const day of Object.values(r.days)) expect(day).not.toHaveProperty('workouts');
  });

  test('skips and counts lines that do not parse, and ignores blank ones', () => {
    const r = parse(
      '',
      'pushups|2026-11-05T00:00:00-05:00|2026-11-06T00:00:00-05:00|10|count', // unknown kind
      'steps|2026-11-05T00:00:00-05:00|2026-11-06T00:00:00-05:00|10', // too few fields
      'steps|yesterday|2026-11-06T00:00:00-05:00|10|count', // bad date
      'steps|2026-11-05T00:00:00-05:00|2026-11-06T00:00:00-05:00|lots|count', // not a number
      'steps|2026-11-05T00:00:00-05:00|2026-11-06T00:00:00-05:00|-4|count', // negative
      'water|2026-11-05T00:00:00-05:00|2026-11-06T00:00:00-05:00|2|gallons', // unknown unit
      'sleep|2026-11-05T23:00:00-05:00|2026-11-06T06:00:00-05:00|Im Bett|', // unknown stage
      'sleep|2026-11-06T06:00:00-05:00|2026-11-05T23:00:00-05:00|Core|', // ends before it starts
      'workout|2026-11-05T18:00:00-05:00|2026-11-05T18:32:00-05:00|Running|32|5|furlongs', // unknown unit
      '   ',
      'steps|2026-11-05T00:00:00-05:00|2026-11-06T00:00:00-05:00|10|count',
    );
    expect(r.skipped).toBe(9);
    expect(r.days['2026-11-05'].steps).toBe(10);
    expect(r.days['2026-11-06'].sleepMinutes).toBe(0);
  });

  test('accepts Windows line endings', () => {
    const r = parseInbox(`${HEADER}\r\nsteps|2026-11-05T00:00:00-05:00|2026-11-06T00:00:00-05:00|10|count\r\n`);
    expect(r.days['2026-11-05'].steps).toBe(10);
    expect(r.skipped).toBe(0);
  });

  test('rejects a file without a valid header', () => {
    expect(() => parseInbox('steps|2026-11-05T00:00:00-05:00|2026-11-06T00:00:00-05:00|10|count')).toThrow();
    expect(() => parseInbox('window|yesterday|2026-11-06T07:30:00-05:00|2026-11-06T07:30:00-05:00')).toThrow();
    expect(() => parseInbox('')).toThrow();
  });
});

describe('keepStoredWorkouts', () => {
  const run = { type: 'running', start: '2026-11-05T18:00:00-05:00', end: '2026-11-05T18:30:00-05:00',
    distanceKm: 5, durationMin: 30, avgHeartRate: null };

  test('carries stored workouts into days that say nothing about workouts', () => {
    const files = { '2026-11': { '2026-11-05': { steps: 1, workouts: [run] } } };
    const out = keepStoredWorkouts(files, { '2026-11-05': { steps: 9 }, '2026-11-06': { steps: 2 } });
    expect(out).toEqual({ '2026-11-05': { steps: 9, workouts: [run] }, '2026-11-06': { steps: 2 } });
  });

  test('leaves a day that reports its own workouts alone', () => {
    const files = { '2026-11': { '2026-11-05': { workouts: [run] } } };
    const out = keepStoredWorkouts(files, { '2026-11-05': { steps: 9, workouts: [] } });
    expect(out['2026-11-05'].workouts).toEqual([]);
  });
});
