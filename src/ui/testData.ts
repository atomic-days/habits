// Test helpers only. Production code must not import this file.
import type { AppData, Habit } from '../model/types.ts';
import { emptyData } from '../model/fixtures.ts';

const FROM = '2026-01-01';

function seed(h: Omit<Habit, 'archived' | 'created'>): Habit {
  return { archived: false, created: FROM, ...h };
}

/** The six seed habits from the data repo template. */
export function seedHabits(): Habit[] {
  return [
    seed({ id: 'steps', name: 'Steps', color: 'cyan', schedules: [{ from: FROM, type: 'daily' }],
      done: { type: 'number', goal: 10000, unit: 'steps', source: 'health', healthType: 'steps' } }),
    seed({ id: 'sleep', name: 'Sleep', color: 'violet', schedules: [{ from: FROM, type: 'daily' }],
      done: { type: 'number', goal: 7, unit: 'hours', source: 'health', healthType: 'sleep' } }),
    seed({ id: 'fasting', name: 'Fasting', color: 'amber', schedules: [{ from: FROM, type: 'daily' }],
      done: { type: 'timer', goalHours: 16 } }),
    seed({ id: 'runs', name: 'Runs', color: 'pink', schedules: [{ from: FROM, type: 'per_week', count: 2 }],
      done: { type: 'number', goal: 1, unit: 'runs', source: 'health', healthType: 'workouts',
        workoutType: 'running', measure: 'count', minDistanceKm: 1 } }),
    seed({ id: 'laundry', name: 'Laundry', color: 'blue', schedules: [{ from: FROM, type: 'weekdays', days: ['fri'] }],
      done: { type: 'check' } }),
    seed({ id: 'cleaning', name: 'Cleaning', color: 'blue', schedules: [{ from: FROM, type: 'weekdays', days: ['wed', 'sun'] }],
      done: { type: 'check' } }),
  ];
}

/** Friday 2026-11-06 at 11:52 New York time. */
export const SEED_NOW = new Date('2026-11-06T11:52:00-05:00');

/** Steps met 11-03 to 11-05, 8,412 synced at 11:40 today, one run on Tue 11-03. */
export function seedData(): AppData {
  return {
    ...emptyData(),
    habits: seedHabits(),
    health: {
      '2026-11-03': {
        steps: 10500,
        workouts: [{ type: 'running', start: '2026-11-03T07:00:00-05:00', end: '2026-11-03T07:30:00-05:00',
          distanceKm: 5, durationMin: 30, avgHeartRate: null }],
        syncedAt: '2026-11-03T21:00:00-05:00',
      },
      '2026-11-04': { steps: 10200, syncedAt: '2026-11-04T21:00:00-05:00' },
      '2026-11-05': { steps: 11000, syncedAt: '2026-11-05T21:00:00-05:00' },
      '2026-11-06': { steps: 8412, syncedAt: '2026-11-06T11:40:00-05:00' },
    },
    healthSyncedAt: '2026-11-06T11:40:00-05:00',
  };
}
