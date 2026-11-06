import { useState } from 'preact/hooks';
import { fastHours, validateFast } from '../model/fasting.ts';
import { streak } from '../model/streaks.ts';
import { toDateKey, localIso } from '../model/dates.ts';
import type { Fast } from '../model/types.ts';
import { useApp } from './AppContext.tsx';
import { FastRing } from './FastRing.tsx';
import { timeOfDay, weekdayName } from './format.ts';

const BAD_TIME = 'Enter a valid date and time';
const pad = (n: number) => String(n).padStart(2, '0');

/** An ISO instant as the 'YYYY-MM-DDTHH:mm' a datetime-local input wants, in the phone's zone. */
function toInput(iso: string): string {
  const d = new Date(iso);
  return `${toDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : localIso(d);
}

export function FastCard() {
  const { data, now, today, actions } = useApp();
  const habit = data.habits.find((h) => !h.archived && h.done.type === 'timer');
  const [editing, setEditing] = useState(false);
  const [startVal, setStartVal] = useState('');
  const [endVal, setEndVal] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!habit || habit.done.type !== 'timer') return null;

  const goal = habit.done.goalHours;
  const running = data.fasts.find((f) => f.end === null);
  const dayPrefix = (iso: string) => (toDateKey(new Date(iso)) === today ? '' : `${weekdayName(toDateKey(new Date(iso))).slice(0, 3)} `);

  if (!running) {
    const ended = data.fasts.filter((f) => f.end !== null)
      .sort((a, b) => new Date(b.end!).getTime() - new Date(a.end!).getTime())[0];
    let last = 'No fasts yet';
    if (ended) {
      const n = Math.floor((now.getTime() - new Date(ended.end!).getTime()) / 3_600_000);
      last = n < 1 ? 'Last fast ended less than an hour ago'
        : `Last fast ended ${n} ${n === 1 ? 'hour' : 'hours'} ago`;
    }
    return (
      <section class="card fast" data-testid="fast-card">
        <p class="muted">{last}</p>
        <button type="button" class="primary" onClick={() => actions.startFast()}>Start fast</button>
      </section>
    );
  }

  const hours = fastHours(running, now);
  const goalAt = localIso(new Date(new Date(running.start).getTime() + goal * 3_600_000));
  const n = streak(habit, data, today, now).current;

  function openEdit(f: Fast) {
    setStartVal(toInput(f.start));
    setEndVal(f.end ? toInput(f.end) : '');
    setError(null);
    setEditing(true);
  }

  async function save(f: Fast) {
    const start = parseInput(startVal);
    const end = endVal === '' ? null : parseInput(endVal);
    if (start === null || (endVal !== '' && end === null)) { setError(BAD_TIME); return; }
    const problem = validateFast(start, end, now);
    if (problem) { setError(problem); return; }
    setError(null);
    await actions.editFast(f.id, { start, end });
    setEditing(false);
  }

  return (
    <section class="card fast" data-testid="fast-card">
      <div class="fast-top">
        <FastRing hours={hours} goalHours={goal} />
        <div class="fast-info">
          <div>Started {dayPrefix(running.start)}{timeOfDay(running.start)}</div>
          <div class="muted">
            {hours >= goal ? 'Passed' : 'Hits'} {goal}h at {dayPrefix(goalAt)}{timeOfDay(goalAt)}
          </div>
          <div class="muted">{n} {n === 1 ? 'day' : 'days'} in a row at {goal}h+</div>
        </div>
      </div>
      <div class="row-actions">
        <button type="button" class="primary" onClick={() => actions.endFast(running.id)}>End fast</button>
        <button type="button" onClick={() => (editing ? setEditing(false) : openEdit(running))}>Edit times</button>
      </div>
      {editing && (
        <form class="fast-edit" onSubmit={(e) => { e.preventDefault(); void save(running); }}>
          <label>Start
            <input type="datetime-local" value={startVal} onInput={(e) => setStartVal(e.currentTarget.value)} />
          </label>
          <label>End
            <input type="datetime-local" value={endVal} onInput={(e) => setEndVal(e.currentTarget.value)} />
          </label>
          {error && <p class="error" role="alert">{error}</p>}
          <button type="submit" class="primary">Save</button>
        </form>
      )}
    </section>
  );
}
