import { addDays } from '../src/model/dates.ts';
import type { DateKey, HealthDay, Workout } from '../src/model/types.ts';
import type { HealthPayload } from './merge.ts';

/**
 * Parses one inbox file written by the Habits sync shortcut.
 *
 *   window|<start ISO>|<end ISO>|<now ISO>
 *   steps|<start>|<end>|<value>|<unit>       also exercise, water, mindful, sleep
 *   workout|<start>|<end>|<type>|<minutes>|<distance>|<distance unit>[|<avg heart rate>]
 *
 * Every date is local time with its offset, so the first 10 characters are the local date.
 */
export interface ParsedInbox extends HealthPayload {
  /** Lines that did not parse. Blank lines and samples outside the window don't count. */
  skipped: number;
}

type Months = Record<string, Record<DateKey, HealthDay>>;

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const SUM_FIELDS = { steps: 'steps', exercise: 'exerciseMinutes', water: 'waterLiters', mindful: 'mindfulMinutes', sleep: 'sleepMinutes' } as const;

const LITERS_PER: Record<string, number> = {
  ml: 0.001, milliliter: 0.001, milliliters: 0.001, millilitre: 0.001, millilitres: 0.001,
  l: 1, liter: 1, liters: 1, litre: 1, litres: 1,
  floz: 0.0295735295625, flozus: 0.0295735295625, oz: 0.0295735295625, fluidounce: 0.0295735295625, fluidounces: 0.0295735295625,
  flozimp: 0.0284130625,
  cup: 0.2365882365, cupus: 0.2365882365, cups: 0.2365882365, cupimp: 0.284130625,
};
const MINUTES_PER: Record<string, number> = {
  min: 1, mins: 1, minute: 1, minutes: 1, hr: 60, h: 60, hour: 60, hours: 60, s: 1 / 60, sec: 1 / 60, seconds: 1 / 60,
};
const KM_PER: Record<string, number> = {
  km: 1, kilometer: 1, kilometers: 1, kilometre: 1, kilometres: 1,
  m: 0.001, meter: 0.001, meters: 0.001, metre: 0.001, metres: 0.001,
  mi: 1.609344, mile: 1.609344, miles: 1.609344,
  yd: 0.0009144, yard: 0.0009144, yards: 0.0009144, ft: 0.0003048, feet: 0.0003048,
};

class BadLine extends Error {}

const unitKey = (u: string) => u.toLowerCase().replace(/[\s._()]/g, '');
const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

function isoTime(s: string): number {
  if (!ISO_RE.test(s)) throw new BadLine(`bad date ${s}`);
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) throw new BadLine(`bad date ${s}`);
  return ms;
}

/** A number as the phone wrote it into text, maybe with grouping commas or spaces (8,412 or 1 200). */
function amount(s: string): number {
  const n = Number(s.replace(/[,\s  ]/g, ''));
  if (s.trim() === '' || !Number.isFinite(n)) throw new BadLine(`not a number: ${s}`);
  if (n < 0) throw new BadLine(`negative: ${s}`);
  return n;
}

function factor(table: Record<string, number>, unit: string): number {
  const f = table[unitKey(unit)];
  if (f === undefined) throw new BadLine(`unknown unit ${unit}`);
  return f;
}

function minutesBetween(start: string, end: string): number {
  const ms = isoTime(end) - isoTime(start);
  if (ms < 0) throw new BadLine('ends before it starts');
  return ms / 60_000;
}

/**
 * Asleep stages count. In Bed and Awake are known but don't. Anything else is a bad line.
 * A bare number is HKCategoryValueSleepAnalysis: 0 in bed, 1 unspecified, 2 awake, 3 core, 4 deep, 5 REM.
 */
function asleep(stage: string): boolean {
  if (/^\d$/.test(stage)) {
    if (Number(stage) > 5) throw new BadLine(`unknown sleep stage ${stage}`);
    return stage !== '0' && stage !== '2';
  }
  if (/\b(in ?bed|awake)\b/i.test(stage)) return false;
  if (/\b(asleep|core|deep|rem|unspecified)\b/i.test(stage)) return true;
  throw new BadLine(`unknown sleep stage ${stage}`);
}

/** The date whose 18:00-to-18:00 window holds this instant, read from the local time written in the string. */
function nightOf(endIso: string): DateKey {
  const date = endIso.slice(0, 10);
  return Number(endIso.slice(11, 13)) >= 18 ? addDays(date, 1) : date;
}

function parseHeader(line: string | undefined) {
  const f = (line ?? '').split('|');
  if (f.length < 4 || f[0] !== 'window') throw new Error('inbox file must start with window|<start>|<end>|<now>');
  const [, start, end, now] = f.map((x) => x.trim());
  for (const s of [start, end, now]) {
    if (!ISO_RE.test(s) || Number.isNaN(Date.parse(s))) throw new Error(`bad date in header: ${s}`);
  }
  return { first: start.slice(0, 10), last: end.slice(0, 10), sentAt: now };
}

export function parseInbox(text: string): ParsedInbox {
  const lines = text.split(/\r?\n/);
  const { first, last, sentAt } = parseHeader(lines[0]);

  const days: Record<DateKey, HealthDay> = {};
  for (let d = first; d <= last; d = addDays(d, 1)) {
    days[d] = { steps: 0, sleepMinutes: 0, exerciseMinutes: 0, waterLiters: 0, mindfulMinutes: 0 };
  }
  const workouts: Record<DateKey, Workout[]> = {};
  let sawWorkout = false;
  let skipped = 0;

  for (const raw of lines.slice(1)) {
    const line = raw.trim();
    if (line === '') continue;
    try {
      const f = line.split('|').map((x) => x.trim());
      const [kind, start, end] = f;

      if (kind === 'workout') {
        if (f.length < 7) throw new BadLine('too few fields');
        const [, , , type, duration, distance, distanceUnit, hr] = f;
        if (type === '') throw new BadLine('no workout type');
        const fromTimes = minutesBetween(start, end);
        const w: Workout = {
          type: type.toLowerCase(),
          start,
          end,
          distanceKm: distance === '' ? 0 : round(amount(distance) * factor(KM_PER, distanceUnit), 3),
          durationMin: round(duration === '' ? fromTimes : amount(duration), 1),
          avgHeartRate: hr === undefined || hr === '' ? null : amount(hr),
        };
        sawWorkout = true;
        const date = start.slice(0, 10);
        if (days[date]) (workouts[date] ??= []).push(w);
        continue;
      }

      if (!(kind in SUM_FIELDS)) throw new BadLine(`unknown kind ${kind}`);
      if (f.length < 5) throw new BadLine('too few fields');
      const [, , , value, unit] = f;
      let date = start.slice(0, 10);
      let add: number;
      if (kind === 'mindful') {
        add = minutesBetween(start, end);
      } else if (kind === 'sleep') {
        const minutes = minutesBetween(start, end);
        if (!asleep(value)) continue;
        add = minutes;
        date = nightOf(end);
      } else {
        isoTime(start);
        isoTime(end);
        const n = amount(value);
        add = kind === 'water' ? n * factor(LITERS_PER, unit)
          : kind === 'exercise' ? n * factor(MINUTES_PER, unit)
          : n;
      }
      const day = days[date];
      if (!day) continue; // outside the window, so not ours to replace
      const field = SUM_FIELDS[kind as keyof typeof SUM_FIELDS];
      day[field] = (day[field] ?? 0) + add;
    } catch (e) {
      if (!(e instanceof BadLine)) throw e;
      skipped++;
    }
  }

  for (const [date, day] of Object.entries(days)) {
    day.steps = Math.round(day.steps ?? 0);
    day.waterLiters = round(day.waterLiters ?? 0, 3);
    for (const f of ['sleepMinutes', 'exerciseMinutes', 'mindfulMinutes'] as const) day[f] = round(day[f] ?? 0, 1);
    // Only a file that reports workouts can say a day had none.
    if (sawWorkout) day.workouts = workouts[date] ?? [];
  }
  return { sentAt, days, skipped };
}

/**
 * The shortcut can't read workouts, so its days carry no workouts field. mergeHealth replaces whole
 * days, so copy any stored workouts into those days rather than wipe them.
 */
export function keepStoredWorkouts(files: Months, days: Record<DateKey, HealthDay>): Record<DateKey, HealthDay> {
  const out: Record<DateKey, HealthDay> = {};
  for (const [date, day] of Object.entries(days)) {
    const stored = files[date.slice(0, 7)]?.[date]?.workouts;
    out[date] = day.workouts === undefined && stored !== undefined ? { ...day, workouts: stored } : day;
  }
  return out;
}
