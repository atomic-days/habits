import { useEffect, useRef, useState } from 'preact/hooks';
import type { Habit } from '../model/types.ts';
import { cellStyle, gridWeeks } from '../model/grid.ts';
import { historySeries, rangeAverage, recentEntries, type HistoryRange } from '../model/history.ts';
import { streak } from '../model/streaks.ts';
import { useApp } from './AppContext.tsx';
import { HistoryChart } from './HistoryChart.tsx';
import { number } from './format.ts';
import './history.css';

const RANGES: { id: HistoryRange; label: string; title: string }[] = [
  { id: '30d', label: '30 days', title: 'Last 30 days' },
  { id: '12w', label: '12 weeks', title: 'Last 12 weeks' },
  { id: '1y', label: '1 year', title: 'Last year, by week' },
];
const RECENT = 14;

function plural(n: number, unit: string): string {
  return `${unit}${n === 1 ? '' : 's'}`;
}

export function HabitHistory({ habit, onBack }: { habit: Habit; onBack: () => void }) {
  const { data, today, now, openForm } = useApp();
  const [range, setRange] = useState<HistoryRange>('30d');
  const yearRef = useRef<HTMLDivElement>(null);

  // The grid is wider than the phone, so start at the right edge where today is.
  useEffect(() => {
    const el = yearRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const s = streak(habit, data, today, now);
  const series = historySeries(habit, data, today, now, range);
  const avg = rangeAverage(habit, data, today, now, range);
  const chore = habit.done.type === 'check';
  const active = RANGES.find((r) => r.id === range)!;
  const title = chore && range === '30d' ? 'Last 30 days, by week' : active.title;
  const entries = recentEntries(habit, data, today, now, RECENT);
  const weeks = gridWeeks(habit, data, today, now, 53);

  return (
    <main class="screen history">
      <header class="hbar">
        <button type="button" class="icon" aria-label="Back" onClick={onBack}>←</button>
        <h1>{habit.name}</h1>
        <button type="button" class="icon" aria-label={`Edit ${habit.name}`} onClick={() => openForm(habit.id)}>✎</button>
      </header>

      <div class="stats" role="group" aria-label="Stats">
        <div class="stat">
          <span class="stat-num">{s.current}</span>
          <span class="stat-unit">{plural(s.current, s.unit)}</span>
          <span class="stat-label">Current streak</span>
        </div>
        <div class="stat">
          <span class="stat-num">{s.best}</span>
          <span class="stat-unit">{plural(s.best, s.unit)}</span>
          <span class="stat-label">Best streak</span>
        </div>
        <div class="stat">
          <span class="stat-num">{avg === null ? '–' : `${number(avg)}${series.unit === '%' ? '%' : ''}`}</span>
          <span class="stat-unit">{series.unit === '%' ? 'done' : series.unit}</span>
          <span class="stat-label">Average</span>
        </div>
      </div>

      <div class="seg" role="group" aria-label="Range">
        {RANGES.map((r) => (
          <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.label}</button>
        ))}
      </div>

      <h2>{title}</h2>
      <HistoryChart key={range} series={series} color={habit.color} label={`${habit.name}, ${title.toLowerCase()}`} />

      <h2>Past year</h2>
      <div class="year" ref={yearRef}>
        <div class="year-grid" role="img" aria-label={`${habit.name} for the last 53 weeks`}>
          {weeks.map((week, w) => (
            <span class="year-week" key={w}>
              {week.map((c) => <span class="year-cell" key={c.date} style={cellStyle(c, habit.color)} />)}
            </span>
          ))}
        </div>
      </div>

      <h2>Recent entries</h2>
      {entries.length === 0 ? <p class="muted">Nothing recorded yet.</p> : (
        <ul class="list entries" aria-label="Recent entries">
          {entries.map((e) => <li class="row entry" key={e.key}>{e.text}</li>)}
        </ul>
      )}
    </main>
  );
}
