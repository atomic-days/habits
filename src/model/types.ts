export type DateKey = string; // 'YYYY-MM-DD'
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type ColorName = 'cyan' | 'violet' | 'amber' | 'pink' | 'blue' | 'green';
export type Schedule =
  | { from: DateKey; type: 'daily' }
  | { from: DateKey; type: 'weekdays'; days: Weekday[] }
  | { from: DateKey; type: 'per_week'; count: number }
  | { from: DateKey; type: 'every_n_days'; n: number }
  | { from: DateKey; type: 'per_month'; count: number };
export type HealthType = 'steps' | 'sleep' | 'workouts' | 'exercise' | 'water' | 'mindful';
export type Done =
  | { type: 'check' }
  | { type: 'number'; goal: number; unit: string; source: 'manual' }
  | { type: 'number'; goal: number; unit: string; source: 'health'; healthType: Exclude<HealthType, 'workouts'> }
  | { type: 'number'; goal: number; unit: string; source: 'health'; healthType: 'workouts';
      workoutType: string; measure: 'count' | 'distance' | 'minutes'; minDistanceKm: number }
  | { type: 'timer'; goalHours: number };
export interface Habit { id: string; name: string; color: ColorName; archived: boolean; created: DateKey; schedules: Schedule[]; done: Done }
export interface LogEntry { habit: string; date: DateKey; value: number; at: string }
export interface Fast { id: string; start: string; end: string | null }
export interface Workout { type: string; start: string; end: string; distanceKm: number; durationMin: number; avgHeartRate: number | null }
export interface HealthDay { steps?: number; sleepMinutes?: number; workouts?: Workout[]; exerciseMinutes?: number; waterLiters?: number; mindfulMinutes?: number; syncedAt?: string }
export interface AppData { habits: Habit[]; logs: LogEntry[]; fasts: Fast[]; health: Record<DateKey, HealthDay>; healthSyncedAt: string | null }
