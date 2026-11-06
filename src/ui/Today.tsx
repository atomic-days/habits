import { dueToday, dueYesterday, comingUp } from '../model/schedule.ts';
import { isMet } from '../model/values.ts';
import { useApp } from './AppContext.tsx';
import { Archived } from './Archived.tsx';
import { FastCard } from './FastCard.tsx';
import { StreakCards } from './StreakCards.tsx';
import { SyncRow } from './SyncRow.tsx';
import { SyncStatus } from './SyncStatus.tsx';
import { TodayRow } from './TodayRow.tsx';
import { longDate, weekdayName } from './format.ts';
import './today.css';

export function Today() {
  const { data, now, today, openForm } = useApp();
  const active = data.habits.filter((h) => !h.archived);
  // The fasting card owns timer habits, so they get no row here.
  const rows = active.filter((h) => h.done.type !== 'timer' &&
    (dueToday(h, data, today, now).due || isMet(h, today, data, now) || dueYesterday(h, data, today, now)));
  const upcoming = comingUp(active, data, today, now);

  return (
    <main class="screen">
      <header class="top">
        <div>
          <div class="date">{longDate(today)}</div>
          <h1>Today</h1>
        </div>
        <button type="button" class="add" aria-label="Add habit" onClick={() => openForm(null)}>+</button>
      </header>

      <SyncStatus />

      <SyncRow />

      <FastCard />

      <ul class="list" aria-label="Today">
        {rows.map((h) => <TodayRow key={h.id} habit={h} />)}
      </ul>

      {upcoming.length > 0 && (
        <>
          <h2>Coming up</h2>
          <ul class="list" aria-label="Coming up">
            {upcoming.map(({ habit, date }) => (
              <li class="row upcoming" key={habit.id}>
                <h3>{habit.name}</h3>
                <span class="muted">{weekdayName(date)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <StreakCards />
      <Archived />
    </main>
  );
}
