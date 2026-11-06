import type { Habit, Weekday } from '../model/types.ts';
import { number } from './format.ts';

const NAMES: Record<Weekday, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};
const ORDER: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function list(items: string[]): string {
  return items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** One line under a streak card, such as 'Every Friday' or 'Goal 10,000 steps'. */
export function goalText(h: Habit): string {
  const s = h.schedules.reduce((a, b) => (b.from >= a.from ? b : a), h.schedules[0]);
  const done = h.done;
  if (done.type === 'timer') return `Goal ${done.goalHours}h`;
  switch (s?.type) {
    case 'weekdays': {
      const days = ORDER.filter((d) => s.days.includes(d));
      if (days.length === 7) return 'Every day';
      return days.length === 1 ? `Every ${NAMES[days[0]]}` : list(days.map((d) => `${NAMES[d]}s`));
    }
    case 'per_week': return `Goal ${s.count} a week`;
    case 'per_month': return `${s.count} a month`;
    case 'every_n_days': return s.n === 1 ? 'Every day' : `Every ${s.n} days`;
    default:
      return done.type === 'number' ? `Goal ${number(done.goal)} ${done.unit}` : 'Every day';
  }
}
