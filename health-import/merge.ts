import type { DateKey, HealthDay, Workout } from '../src/model/types.ts';

export interface HealthPayload { sentAt: string; days: Record<DateKey, HealthDay> }
type Months = Record<string, Record<DateKey, HealthDay>>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const NUMBER_FIELDS = ['steps', 'sleepMinutes', 'exerciseMinutes', 'waterLiters', 'mindfulMinutes'] as const;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${what} must be a number`);
  if (v < 0) throw new Error(`${what} must not be negative`);
  return v;
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`${what} must be a string`);
  return v;
}

function validateWorkout(raw: unknown, what: string): Workout {
  if (!isObject(raw)) throw new Error(`${what} must be an object`);
  const hr = raw.avgHeartRate;
  return {
    type: str(raw.type, `${what}.type`),
    start: str(raw.start, `${what}.start`),
    end: str(raw.end, `${what}.end`),
    distanceKm: num(raw.distanceKm, `${what}.distanceKm`),
    durationMin: num(raw.durationMin, `${what}.durationMin`),
    avgHeartRate: hr === null || hr === undefined ? null : num(hr, `${what}.avgHeartRate`),
  };
}

function validateDay(raw: unknown, key: string): HealthDay {
  if (!isObject(raw)) throw new Error(`day ${key} must be an object`);
  const day: HealthDay = {};
  for (const f of NUMBER_FIELDS) {
    if (raw[f] !== undefined) day[f] = num(raw[f], `${key}.${f}`);
  }
  if (raw.workouts !== undefined) {
    if (!Array.isArray(raw.workouts)) throw new Error(`${key}.workouts must be an array`);
    day.workouts = raw.workouts.map((w, i) => validateWorkout(w, `${key}.workouts[${i}]`));
  }
  return day;
}

export function validatePayload(raw: unknown): HealthPayload {
  if (!isObject(raw)) throw new Error('payload must be an object');
  const sentAt = raw.sentAt;
  if (typeof sentAt !== 'string' || !ISO_RE.test(sentAt) || Number.isNaN(Date.parse(sentAt))) {
    throw new Error('sentAt must be an ISO timestamp');
  }
  if (!isObject(raw.days)) throw new Error('days must be an object');
  const days: Record<DateKey, HealthDay> = {};
  for (const [key, value] of Object.entries(raw.days)) {
    if (!DATE_RE.test(key)) throw new Error(`bad date key: ${key}`);
    const month = Number(key.slice(5, 7));
    const dom = Number(key.slice(8, 10));
    if (month < 1 || month > 12 || dom < 1 || dom > 31) throw new Error(`bad date key: ${key}`);
    days[key] = validateDay(value, key);
  }
  return { sentAt, days };
}

export function mergeHealth(files: Months, p: HealthPayload): Months {
  const out: Months = {};
  const sentMs = Date.parse(p.sentAt);
  for (const [date, day] of Object.entries(p.days)) {
    const month = date.slice(0, 7);
    // Runs can finish out of order. An older payload must not undo a newer copy of the day.
    const stored = files[month]?.[date]?.syncedAt;
    if (stored !== undefined && Date.parse(stored) > sentMs) continue;
    out[month] ??= { ...(files[month] ?? {}) };
    out[month][date] = { ...day, syncedAt: p.sentAt };
  }
  return out;
}
