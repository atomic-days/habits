import { useState } from 'preact/hooks';
import type { Habit } from '../model/types.ts';
import { addDays } from '../model/dates.ts';
import { dayValue, isMet } from '../model/values.ts';
import { dueToday, scheduleOn } from '../model/schedule.ts';
import { streak } from '../model/streaks.ts';
import { useApp } from './AppContext.tsx';
import { number, shortDay, timeOfDay } from './format.ts';

const EARLIER_DAYS = 6;

export function TodayRow({ habit }: { habit: Habit }) {
  const { data, now, today, actions } = useApp();
  const [more, setMore] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const done = habit.done;
  const value = dayValue(habit, today, data, now);
  const met = isMet(habit, today, data, now);
  const schedule = scheduleOn(habit, today);
  const progress = dueToday(habit, data, today, now).progress;

  let periodLine: string | null = null;
  if (progress && schedule) {
    periodLine = `${progress.done} of ${progress.target} this ${schedule.type === 'per_month' ? 'month' : 'week'}`;
  }

  let nudge: string | null = null;
  if (done.type === 'number' && !met && schedule?.type === 'daily') {
    const n = streak(habit, data, today, now).current;
    if (n > 0) nudge = `${number(done.goal - (value ?? 0))} to go for a ${n + 1}-day streak`;
  }

  return (
    <li class="row">
      <div class="row-main">
        <h3>{habit.name}</h3>

        {done.type === 'check' && (met ? (
          <div class="row-actions">
            <span class="done">Done</span>
            <button type="button" onClick={() => actions.undoDone(habit.id, today)}>Undo</button>
          </div>
        ) : (
          <div class="row-actions">
            <button type="button" class="primary" onClick={() => actions.markDone(habit.id, today)}>Mark done</button>
            <button type="button" aria-label={`More for ${habit.name}`} aria-expanded={more} onClick={() => setMore(!more)}>⋯</button>
          </div>
        ))}

        {done.type === 'number' && done.source === 'health' && (
          <div class="value">
            {value === null ? <span class="muted">No data yet</span> : (
              <><span class="big">{number(value)}</span> <span class="muted">{done.unit}</span></>
            )}
          </div>
        )}

        {done.type === 'number' && done.source === 'manual' && (
          <form class="row-actions" onSubmit={(e) => {
            e.preventDefault();
            const n = Number(draft ?? value);
            if (draft !== null && draft !== '' && Number.isFinite(n)) void actions.setNumber(habit.id, today, n);
          }}>
            <input type="number" inputMode="decimal" aria-label={habit.name} placeholder={done.unit}
              value={draft ?? (value === null ? '' : String(value))} onInput={(e) => setDraft(e.currentTarget.value)} />
            <button type="submit">Save</button>
          </form>
        )}
      </div>

      {done.type === 'number' && !met && value !== null && (
        <div class="bar" role="progressbar" aria-valuemin={0} aria-valuemax={done.goal} aria-valuenow={value}>
          <div class="bar-fill" style={{ width: `${Math.min(100, (value / done.goal) * 100)}%` }} />
        </div>
      )}
      {nudge && <p class="note">{nudge}</p>}
      {periodLine && <p class="note">{periodLine}</p>}
      {done.type === 'number' && done.source === 'health' && value !== null && data.health[today]?.syncedAt && (
        <p class="note faint">From Apple Health, {timeOfDay(data.health[today]!.syncedAt!)}</p>
      )}

      {more && done.type === 'check' && (
        <div class="earlier">
          {Array.from({ length: EARLIER_DAYS }, (_, i) => addDays(today, -(i + 1))).map((day) => (
            <button type="button" key={day} onClick={() => { setMore(false); void actions.markDone(habit.id, day); }}>
              {shortDay(day)}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
