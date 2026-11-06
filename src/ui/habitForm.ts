import type { ColorName, DateKey, Done, Habit, HealthType, Schedule } from '../model/types.ts';
import { scheduleOn } from '../model/schedule.ts';

type Body<S> = S extends Schedule ? Omit<S, 'from'> : never;
export type ScheduleBody = Body<Schedule>;

export interface FormState { name: string; color: ColorName; schedule: ScheduleBody; done: Done }

const UNITS: Record<HealthType, string> = {
  steps: 'steps', sleep: 'hours', workouts: 'runs', exercise: 'minutes', water: 'liters', mindful: 'minutes',
};
const GOALS: Record<HealthType, number> = { steps: 10000, sleep: 7, workouts: 1, exercise: 30, water: 2, mindful: 10 };

/** The Done value for picking a Health type. Workouts gets its own defaults. */
export function healthDone(healthType: HealthType, prev: Done): Done {
  if (healthType === 'workouts') {
    return {
      type: 'number', goal: 1, unit: 'runs', source: 'health', healthType,
      workoutType: 'running', measure: 'count', minDistanceKm: 1,
    };
  }
  const keep = prev.type === 'number' && prev.source === 'health' && prev.healthType === healthType;
  return keep ? prev : { type: 'number', goal: GOALS[healthType], unit: UNITS[healthType], source: 'health', healthType };
}

function strip(s: Schedule): ScheduleBody {
  const { from: _from, ...rest } = s;
  return rest as ScheduleBody;
}

function sameBody(a: ScheduleBody, b: ScheduleBody): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.join() !== kb.join()) return false;
  return ka.every((k) => JSON.stringify((a as Record<string, unknown>)[k]) === JSON.stringify((b as Record<string, unknown>)[k]));
}

function currentSchedule(h: Habit, today: DateKey): Schedule | null {
  return scheduleOn(h, today) ?? h.schedules.reduce<Schedule | null>((a, s) => (a === null || s.from < a.from ? s : a), null);
}

export function formFromHabit(h: Habit, today: DateKey): FormState {
  const s = currentSchedule(h, today);
  return { name: h.name, color: h.color, schedule: s ? strip(s) : { type: 'daily' }, done: h.done };
}

export function validateForm(f: FormState): string | null {
  if (f.name.trim() === '') return 'Give it a name';
  if (f.schedule.type === 'weekdays' && f.schedule.days.length === 0) return 'Pick at least one day';
  return null;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'habit';
}

export function buildHabit(f: FormState, existing: Habit | undefined, all: Habit[], today: DateKey): Habit {
  const name = f.name.trim();
  if (!existing) {
    const base = slug(name);
    let id = base;
    for (let n = 2; all.some((h) => h.id === id); n++) id = `${base}-${n}`;
    return {
      id, name, color: f.color, archived: false, created: today, done: f.done,
      schedules: [{ ...f.schedule, from: today } as Schedule],
    };
  }
  const cur = currentSchedule(existing, today);
  const changed = cur === null || !sameBody(strip(cur), f.schedule);
  const schedules = changed
    ? [...existing.schedules.filter((s) => s.from !== today), { ...f.schedule, from: today } as Schedule]
    : existing.schedules;
  return { ...existing, name, color: f.color, done: f.done, schedules };
}
