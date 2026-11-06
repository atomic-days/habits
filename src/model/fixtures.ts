// Test helpers only. Production code must not import this file.
import type { AppData, Habit } from './types.ts';

export function emptyData(): AppData {
  return { habits: [], logs: [], fasts: [], health: {}, healthSyncedAt: null };
}

export function habit(overrides: Partial<Habit> & Pick<Habit, 'id' | 'done'>): Habit {
  return {
    name: overrides.id,
    color: 'blue',
    archived: false,
    created: '2026-01-01',
    schedules: [{ from: '2026-01-01', type: 'daily' }],
    ...overrides,
  };
}
