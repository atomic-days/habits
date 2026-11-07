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

  test('reads sleep stages given as HealthKit numbers: 0 in bed, 2 awake, 1, 3, 4 and 5 asleep', () => {
    const r = parse(
      'sleep|2026-11-05T22:00:00-05:00|2026-11-06T06:00:00-05:00|0|',
      'sleep|2026-11-05T23:00:00-05:00|2026-11-06T00:00:00-05:00|1|',
      'sleep|2026-11-06T00:00:00-05:00|2026-11-06T00:10:00-05:00|2|',
      'sleep|2026-11-06T00:10:00-05:00|2026-11-06T01:10:00-05:00|3|',
      'sleep|2026-11-06T01:10:00-05:00|2026-11-06T02:10:00-05:00|4|',
      'sleep|2026-11-06T02:10:00-05:00|2026-11-06T03:10:00-05:00|5|',
      'sleep|2026-11-06T03:10:00-05:00|2026-11-06T04:10:00-05:00|6|',
    );
    expect(r.days['2026-11-06'].sleepMinutes).toBe(240);
    expect(r.skipped).toBe(1);
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

const clock = (day: string, hhmmss: string) => `2026-11-${day}T${hhmmss}-05:00`;
/** A runspeed line. Times are written as "DD HH:MM:SS". */
const speed = (from: string, to: string, value: number | string, unit = 'm/s') => {
  const t = (x: string) => clock(x.slice(0, 2), x.slice(3));
  return `runspeed|${t(from)}|${t(to)}|${value}|${unit}`;
};
const RUNS = 'runs|checked';
const runsOn = (r: ReturnType<typeof parse>, date: string) => r.days[date].workouts;

describe('runs from running speed', () => {
  test('converts m/s, km/hr and mi/hr, with spelling variants, to m/s', () => {
    const cases: [string, number][] = [
      ['m/s', 1], ['m/sec', 1], ['meters/second', 1], ['metres/second', 1], ['m/s', 1],
      ['km/hr', 1 / 3.6], ['km/h', 1 / 3.6], ['kph', 1 / 3.6], ['kilometers/hour', 1 / 3.6],
      ['mi/hr', 0.44704], ['mi/h', 0.44704], ['mph', 0.44704], ['miles/hour', 0.44704],
    ];
    for (const [unit, perUnit] of cases) {
      // Ten minutes at 10 of the unit.
      const r = parse(RUNS, speed('05 18:00:00', '05 18:10:00', 10, unit));
      expect(r.skipped).toBe(0);
      expect(runsOn(r, '2026-11-05')![0].distanceKm, unit).toBeCloseTo((10 * perUnit * 600) / 1000, 2);
    }
  });

  test('an unknown unit or a negative speed is a skipped line', () => {
    const r = parse(RUNS,
      speed('05 18:00:00', '05 18:10:00', 3, 'furlongs/fortnight'), speed('05 18:00:00', '05 18:10:00', -1));
    expect(r.skipped).toBe(2);
    expect(runsOn(r, '2026-11-05')).toEqual([]);
  });

  test('turns contiguous interval samples into one run: summed distance, first start to last end', () => {
    const r = parse(RUNS, speed('05 18:00:00', '05 18:05:00', 3), speed('05 18:05:00', '05 18:10:00', 4));
    expect(runsOn(r, '2026-11-05')).toEqual([{
      type: 'running', start: clock('05', '18:00:00'), end: clock('05', '18:10:00'),
      distanceKm: 2.1, durationMin: 10, avgHeartRate: null,
    }]);
  });

  test('splits at a 12-minute gap but not at a 9-minute one', () => {
    const split = parse(RUNS, speed('05 07:00:00', '05 07:10:00', 3), speed('05 07:22:00', '05 07:32:00', 3));
    expect(runsOn(split, '2026-11-05')).toHaveLength(2);
    const joined = parse(RUNS, speed('05 07:00:00', '05 07:10:00', 3), speed('05 07:19:00', '05 07:29:00', 3));
    const one = runsOn(joined, '2026-11-05')!;
    expect(one).toHaveLength(1);
    // The 9 minute gap counts toward duration but adds no distance.
    expect(one[0].durationMin).toBe(29);
    expect(one[0].distanceKm).toBe(3.6);
  });

  test('sorts samples by start before grouping', () => {
    const r = parse(RUNS, speed('05 18:05:00', '05 18:10:00', 4), speed('05 18:00:00', '05 18:05:00', 3));
    expect(runsOn(r, '2026-11-05')).toHaveLength(1);
    expect(runsOn(r, '2026-11-05')![0].start).toBe(clock('05', '18:00:00'));
  });

  test('an instantaneous sample covers the time to the next sample', () => {
    // One sample every 10 s at 3 m/s from 0:00 to 6:00. The last has no successor and adds nothing.
    const t = (x: number) => `18:${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
    const lines: string[] = [];
    for (let s = 0; s <= 360; s += 10) lines.push(speed(`05 ${t(s)}`, `05 ${t(s)}`, 3));
    const run = runsOn(parse(RUNS, ...lines), '2026-11-05')!;
    expect(run).toHaveLength(1);
    expect(run[0].durationMin).toBe(6);
    expect(run[0].distanceKm).toBe(1.08);
  });

  test('an instantaneous sample covers at most 60 seconds', () => {
    // 6 m/s at 0:00, 2:00 and 7:00. The first two cover 60 s each, the last covers nothing.
    const r = parse(RUNS,
      speed('05 18:00:00', '05 18:00:00', 6), speed('05 18:02:00', '05 18:02:00', 6), speed('05 18:07:00', '05 18:07:00', 6));
    const run = runsOn(r, '2026-11-05')!;
    expect(run[0].distanceKm).toBe(0.72);
    expect(run[0].durationMin).toBe(7);
  });

  test('drops sessions under 5 minutes or under 0.5 km and keeps the exact boundary', () => {
    const r = parse(RUNS,
      speed('03 18:00:00', '03 18:04:59', 5), // fast enough, 4:59 long
      speed('04 18:00:00', '04 18:10:00', 0.8), // 10 min, 0.48 km
      speed('05 18:00:00', '05 18:05:00', 5 / 3)); // 5 min, 0.5 km
    expect(runsOn(r, '2026-11-03')).toEqual([]);
    expect(runsOn(r, '2026-11-04')).toEqual([]);
    expect(runsOn(r, '2026-11-05')).toHaveLength(1);
    expect(runsOn(r, '2026-11-05')![0].distanceKm).toBe(0.5);
  });

  test('a run that crosses midnight lands on the date it started', () => {
    const r = parse(RUNS, speed('04 23:50:00', '04 23:59:59', 3), speed('05 00:00:00', '05 00:20:00', 3));
    expect(runsOn(r, '2026-11-04')).toHaveLength(1);
    expect(runsOn(r, '2026-11-04')![0].end).toBe(clock('05', '00:20:00'));
    expect(runsOn(r, '2026-11-05')).toEqual([]);
  });

  test('runs|checked with no runs clears every date in the window', () => {
    const r = parse(RUNS);
    expect(Object.keys(r.days)).toHaveLength(4);
    for (const day of Object.values(r.days)) expect(day.workouts).toEqual([]);
  });

  test('runs|checked puts the derived runs on their dates and empty lists elsewhere', () => {
    const r = parse(RUNS, speed('05 18:00:00', '05 18:10:00', 3));
    expect(runsOn(r, '2026-11-05')).toHaveLength(1);
    expect(runsOn(r, '2026-11-06')).toEqual([]);
  });

  test('without runs|checked the workouts field is left out, so stored workouts stay', () => {
    const r = parse(speed('05 18:00:00', '05 18:10:00', 3));
    for (const day of Object.values(r.days)) expect(day).not.toHaveProperty('workouts');
    const run = { type: 'running', start: 'a', end: 'b', distanceKm: 5, durationMin: 30, avgHeartRate: null };
    const kept = keepStoredWorkouts({ '2026-11': { '2026-11-05': { workouts: [run] } } }, r.days);
    expect(kept['2026-11-05'].workouts).toEqual([run]);
  });

  test('a run outside the window is ignored', () => {
    const r = parse(RUNS, speed('01 18:00:00', '01 18:10:00', 3));
    for (const day of Object.values(r.days)) expect(day.workouts).toEqual([]);
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
