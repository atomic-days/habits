import type { DateKey } from '../model/types.ts';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(key: DateKey) {
  const [y, m, d] = key.split('-').map(Number);
  return { weekday: DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()], month: MONTHS[m - 1], day: d };
}

export function weekdayName(key: DateKey): string {
  return parts(key).weekday;
}

/** 'Friday, Nov 6' */
export function longDate(key: DateKey): string {
  const p = parts(key);
  return `${p.weekday}, ${p.month} ${p.day}`;
}

/** 'Wed Nov 4' */
export function shortDay(key: DateKey): string {
  const p = parts(key);
  return `${p.weekday.slice(0, 3)} ${p.month} ${p.day}`;
}

/** '11:40 AM' in the phone's time zone. */
export function timeOfDay(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

/** '8,412', with at most one decimal. */
export function number(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
}
