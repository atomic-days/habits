import { PALETTES } from '../model/grid.ts';
import { streak } from '../model/streaks.ts';
import { useApp } from './AppContext.tsx';
import { MiniGrid } from './MiniGrid.tsx';
import { goalText } from './goalText.ts';

export function StreakCards() {
  const { data, today, now, openHistory } = useApp();
  const habits = data.habits.filter((h) => !h.archived);
  if (habits.length === 0) return null;
  return (
    <section data-testid="streak-cards">
      <h2>Streaks, last 12 weeks</h2>
      <div class="streak-grid">
        {habits.map((h) => {
          const s = streak(h, data, today, now);
          return (
            <button type="button" class="streak-card" key={h.id} onClick={() => openHistory(h.id)}>
              <span class="streak-head">
                <span class="streak-name">
                  <span class="dot" style={{ background: PALETTES[h.color][3] }} />
                  {h.name}
                </span>
                <span class="faint">Best {s.best}</span>
              </span>
              <MiniGrid habit={h} weeks={12} />
              <span class="streak-now">
                <span class="streak-num" style={{ color: PALETTES[h.color][3] }}>{s.current}</span>
                <span class="muted"> {s.unit}{s.current === 1 ? '' : 's'} in a row</span>
              </span>
              <span class="faint streak-goal">{goalText(h)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
