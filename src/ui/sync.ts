import { addDays, dateKeyAt, toDateKey } from '../model/dates.ts';
import { shortDay, timeOfDay } from './format.ts';

export const STARTED_KEY = 'habits.syncStartedAt';
export const SHAS_KEY = 'habits.healthShas';

export function syncUrl(days = 7): string {
  return 'shortcuts://run-shortcut?name=Habits%20sync&input=text&text=' + days;
}

export function syncedLabel(iso: string | null, now: Date): string {
  if (iso === null) return 'Never synced';
  const day = dateKeyAt(iso);
  const today = toDateKey(now);
  const time = timeOfDay(iso);
  if (day === today) return `Synced ${time}`;
  if (day === addDays(today, -1)) return `Synced yesterday ${time}`;
  return `Synced ${shortDay(day)} ${time}`;
}
