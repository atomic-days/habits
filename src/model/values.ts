import type { AppData, DateKey, Habit } from './types.ts';
import { fastCreditDays, fastHoursOn } from './fasting.ts';

export function dayValue(h: Habit, date: DateKey, d: AppData, now: Date): number | null {
  const done = h.done;
  if (done.type === 'check') {
    return d.logs.some((l) => l.habit === h.id && l.date === date) ? 1 : 0;
  }
  if (done.type === 'timer') {
    return fastHoursOn(d.fasts, date, done.goalHours, now);
  }
  if (done.source === 'manual') {
    const entry = d.logs.find((l) => l.habit === h.id && l.date === date);
    return entry ? entry.value : null;
  }
  const day = d.health[date];
  if (!day) return null;
  switch (done.healthType) {
    case 'steps': return day.steps ?? null;
    case 'exercise': return day.exerciseMinutes ?? null;
    case 'water': return day.waterLiters ?? null;
    case 'mindful': return day.mindfulMinutes ?? null;
    case 'sleep': return day.sleepMinutes === undefined ? null : day.sleepMinutes / 60;
    case 'workouts': {
      if (!day.workouts) return null;
      const hits = day.workouts.filter((w) => w.type === done.workoutType && w.distanceKm >= done.minDistanceKm);
      if (done.measure === 'count') return hits.length;
      if (done.measure === 'distance') return hits.reduce((s, w) => s + w.distanceKm, 0);
      return hits.reduce((s, w) => s + w.durationMin, 0);
    }
  }
}

export function isMet(h: Habit, date: DateKey, d: AppData, now: Date): boolean {
  const done = h.done;
  if (done.type === 'timer') {
    return d.fasts.some((f) => fastCreditDays(f, done.goalHours, now).includes(date));
  }
  const value = dayValue(h, date, d, now);
  if (value === null) return false;
  return done.type === 'check' ? value >= 1 : value >= done.goal;
}

export function completions(h: Habit, date: DateKey, d: AppData, now: Date): number {
  const done = h.done;
  if (done.type === 'number' && done.source === 'health' && done.healthType === 'workouts' && done.measure === 'count') {
    const value = dayValue(h, date, d, now);
    return value === null ? 0 : Math.floor(value / done.goal);
  }
  return isMet(h, date, d, now) ? 1 : 0;
}
