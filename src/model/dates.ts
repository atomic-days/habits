import type { DateKey, Weekday } from './types.ts';

const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_MS = 86_400_000;

const pad = (n: number): string => String(n).padStart(2, '0');

function utcMs(key: DateKey): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): DateKey {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function toDateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dateKeyAt(iso: string): DateKey {
  return toDateKey(new Date(iso));
}

export function addDays(key: DateKey, n: number): DateKey {
  return fromUtcMs(utcMs(key) + n * DAY_MS);
}

/** Monday is 0, Sunday is 6. */
export function dayOfWeek(key: DateKey): number {
  return (new Date(utcMs(key)).getUTCDay() + 6) % 7;
}

export function weekdayOf(key: DateKey): Weekday {
  return WEEKDAYS[dayOfWeek(key)];
}

export function weekStart(key: DateKey): DateKey {
  return addDays(key, -dayOfWeek(key));
}

export function monthKey(key: DateKey): string {
  return key.slice(0, 7);
}

export function daysBetween(a: DateKey, b: DateKey): number {
  return Math.round((utcMs(b) - utcMs(a)) / DAY_MS);
}

export function hoursBetween(startIso: string, endIso: string | Date): number {
  const end = typeof endIso === 'string' ? new Date(endIso) : endIso;
  return (end.getTime() - new Date(startIso).getTime()) / 3_600_000;
}

/** ISO timestamp in the device's local zone, e.g. 2026-11-06T11:52:00-05:00. */
export function localIso(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off < 0 ? '-' : '+';
  const abs = Math.abs(off);
  return `${toDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
