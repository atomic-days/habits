import { gridWeeks, cellStyle } from '../model/grid.ts';
import type { Habit } from '../model/types.ts';
import { useApp } from './AppContext.tsx';

export function MiniGrid({ habit, weeks = 12 }: { habit: Habit; weeks?: number }) {
  const { data, today, now } = useApp();
  return (
    <span class="mini-grid" role="img" aria-label={`${habit.name} for the last ${weeks} weeks`}>
      {gridWeeks(habit, data, today, now, weeks).map((week, w) => (
        <span class="mini-week" key={w}>
          {week.map((c) => <span class="mini-cell" key={c.date} style={cellStyle(c, habit.color)} />)}
        </span>
      ))}
    </span>
  );
}
