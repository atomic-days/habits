import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { ColorName, Done, HealthType, Weekday } from '../model/types.ts';
import { PALETTES } from '../model/grid.ts';
import { useApp } from './AppContext.tsx';
import {
  buildHabit, formFromHabit, healthDone, validateForm, type FormState, type ScheduleBody,
} from './habitForm.ts';
import './habitForm.css';

const COLORS = Object.keys(PALETTES) as ColorName[];
const DAYS: [Weekday, string][] = [
  ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'],
  ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday'],
];
const SCHEDULES: { type: ScheduleBody['type']; label: string; make: () => ScheduleBody }[] = [
  { type: 'daily', label: 'Every day', make: () => ({ type: 'daily' }) },
  { type: 'weekdays', label: 'Certain days', make: () => ({ type: 'weekdays', days: [] }) },
  { type: 'per_week', label: 'Some times a week', make: () => ({ type: 'per_week', count: 1 }) },
  { type: 'every_n_days', label: 'Every few days', make: () => ({ type: 'every_n_days', n: 2 }) },
  { type: 'per_month', label: 'Some times a month', make: () => ({ type: 'per_month', count: 1 }) },
];
const HEALTH: [HealthType, string][] = [
  ['steps', 'Steps'], ['sleep', 'Sleep'], ['workouts', 'Workouts'],
  ['exercise', 'Exercise minutes'],
];
const MEASURES: ['count' | 'distance' | 'minutes', string][] = [['count', 'Count'], ['distance', 'Distance'], ['minutes', 'Minutes']];

type DoneKind = 'check' | 'number' | 'timer';
const DONE_OPTIONS: [DoneKind, string][] = [['check', 'Tick it off'], ['number', 'Hit a number'], ['timer', 'Fast for a while']];

function Option({ selected, label, onSelect, children }: {
  selected: boolean; label: string; onSelect: () => void; children?: ComponentChildren;
}) {
  return (
    <div class={`opt${selected ? ' on' : ''}`}>
      <button type="button" class="opt-row" aria-pressed={selected} onClick={onSelect}>
        <span class="radio" aria-hidden="true" />
        <span>{label}</span>
      </button>
      {selected && children ? <div class="opt-body">{children}</div> : null}
    </div>
  );
}

function Stepper({ value, min, max, less, more, unit, onChange }: {
  value: number; min: number; max: number; less: string; more: string; unit: string; onChange: (n: number) => void;
}) {
  return (
    <div class="stepper">
      <button type="button" class="round" aria-label={less} disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <span class="step-value" aria-live="polite">{value}</span>
      <button type="button" class="round" aria-label={more} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
      <span class="muted">{unit}</span>
    </div>
  );
}

function positive(text: string): number | null {
  const n = Number(text);
  return text.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
}

export function HabitForm({ habitId, onClose }: { habitId: string | null; onClose: () => void }) {
  const { data, today, actions } = useApp();
  const existing = habitId === null ? undefined : data.habits.find((h) => h.id === habitId);
  const [f, setF] = useState<FormState>(() => existing
    ? formFromHabit(existing, today)
    : { name: '', color: 'blue', schedule: { type: 'daily' }, done: { type: 'check' } });
  const [goalText, setGoalText] = useState(() => (f.done.type === 'number' ? String(f.done.goal) : ''));
  const [hoursText, setHoursText] = useState(() => (f.done.type === 'timer' ? String(f.done.goalHours) : '16'));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const patch = (p: Partial<FormState>) => setF((cur) => ({ ...cur, ...p }));
  const setDone = (done: Done) => {
    patch({ done });
    if (done.type === 'number') setGoalText(String(done.goal));
    if (done.type === 'timer') setHoursText(String(done.goalHours));
  };
  const s = f.schedule;
  const d = f.done;

  async function guarded(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      onClose();
    } catch {
      setError("Couldn't save that. Try again.");
      setBusy(false);
    }
  }

  function save() {
    const problem = validateForm(f);
    setError(problem);
    if (problem) return;
    void guarded(() => actions.saveHabit(buildHabit(f, existing, data.habits, today)));
  }

  const checkIns = existing ? data.logs.filter((l) => l.habit === existing.id).length : 0;

  return (
    <form class="screen hform" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
      <header class="hbar">
        <button type="button" class="link" onClick={onClose}>Cancel</button>
        <h1>{existing ? 'Edit habit' : 'New habit'}</h1>
        <button type="submit" class="link accent" disabled={busy}>Save</button>
      </header>

      {error && <p class="error" role="alert">{error}</p>}

      <label class="sect" for="habit-name">Name</label>
      <input id="habit-name" class="text" type="text" value={f.name} autoComplete="off"
        onInput={(e) => patch({ name: (e.currentTarget as HTMLInputElement).value })} />

      <div class="sect" id="color-label">Color</div>
      <div class="swatches" role="group" aria-labelledby="color-label">
        {COLORS.map((c) => (
          <button key={c} type="button" class={`swatch${f.color === c ? ' on' : ''}`} aria-label={c}
            aria-pressed={f.color === c} style={{ background: PALETTES[c][3] }} onClick={() => patch({ color: c })} />
        ))}
      </div>

      <div class="sect" id="often-label">How often</div>
      <div class="opts" role="group" aria-labelledby="often-label">
        {SCHEDULES.map((o) => (
          <Option key={o.type} label={o.label} selected={s.type === o.type}
            onSelect={() => s.type !== o.type && patch({ schedule: o.make() })}>
            {s.type === 'weekdays' && (
              <div class="days" role="group" aria-label="Days">
                {DAYS.map(([k, name]) => {
                  const on = s.days.includes(k);
                  return (
                    <button key={k} type="button" class={`round day${on ? ' on' : ''}`} aria-label={name} aria-pressed={on}
                      onClick={() => patch({ schedule: { type: 'weekdays', days: on ? s.days.filter((x) => x !== k) : [...s.days, k] } })}>
                      {name.slice(0, 1)}
                    </button>
                  );
                })}
              </div>
            )}
            {s.type === 'per_week' && (
              <Stepper value={s.count} min={1} max={7} less="Fewer times" more="More times" unit="times a week"
                onChange={(count) => patch({ schedule: { type: 'per_week', count } })} />
            )}
            {s.type === 'every_n_days' && (
              <Stepper value={s.n} min={2} max={60} less="Fewer days" more="More days" unit="days apart"
                onChange={(n) => patch({ schedule: { type: 'every_n_days', n } })} />
            )}
            {s.type === 'per_month' && (
              <Stepper value={s.count} min={1} max={31} less="Fewer times" more="More times" unit="times a month"
                onChange={(count) => patch({ schedule: { type: 'per_month', count } })} />
            )}
          </Option>
        ))}
      </div>
      <p class="hint">A new schedule starts today. Past weeks keep the schedule they had.</p>

      <div class="sect" id="done-label">Done means</div>
      <div class="opts" role="group" aria-labelledby="done-label">
        {DONE_OPTIONS.map(([kind, label]) => (
          <Option key={kind} label={label} selected={d.type === kind}
            onSelect={() => {
              if (d.type === kind) return;
              setDone(kind === 'check' ? { type: 'check' }
                : kind === 'timer' ? { type: 'timer', goalHours: 16 }
                : { type: 'number', goal: 1, unit: '', source: 'manual' });
            }}>
            {d.type === 'timer' && (
              <label class="field">Goal hours
                <input class="text" type="number" inputMode="decimal" min="1" value={hoursText}
                  onInput={(e) => {
                    const t = (e.currentTarget as HTMLInputElement).value;
                    setHoursText(t);
                    const n = positive(t);
                    if (n !== null) patch({ done: { type: 'timer', goalHours: n } });
                  }} />
              </label>
            )}
            {d.type === 'number' && (
              <>
                <div class="pair">
                  <label class="field">Goal
                    <input class="text" type="number" inputMode="decimal" min="0" value={goalText}
                      onInput={(e) => {
                        const t = (e.currentTarget as HTMLInputElement).value;
                        setGoalText(t);
                        const n = positive(t);
                        if (n !== null) patch({ done: { ...d, goal: n } });
                      }} />
                  </label>
                  <label class="field">Unit
                    <input class="text" type="text" value={d.unit}
                      onInput={(e) => patch({ done: { ...d, unit: (e.currentTarget as HTMLInputElement).value } })} />
                  </label>
                </div>
                <div class="switch" role="group" aria-label="Where the number comes from">
                  <button type="button" aria-pressed={d.source === 'manual'} class={d.source === 'manual' ? 'on' : ''}
                    onClick={() => d.source !== 'manual' && setDone({ type: 'number', goal: 1, unit: '', source: 'manual' })}>I enter it</button>
                  <button type="button" aria-pressed={d.source === 'health'} class={d.source === 'health' ? 'on' : ''}
                    onClick={() => d.source !== 'health' && setDone(healthDone('steps', d))}>Apple Health</button>
                </div>
                {d.source === 'health' && (
                  <>
                    <div class="chips" role="group" aria-label="Health type">
                      {HEALTH.map(([t, label]) => (
                        <button key={t} type="button" class={d.healthType === t ? 'on' : ''} aria-pressed={d.healthType === t}
                          onClick={() => d.healthType !== t && setDone(healthDone(t, d))}>{label}</button>
                      ))}
                    </div>
                    {d.healthType === 'workouts' && (
                      <>
                        <label class="field">Workout type
                          <input class="text" type="text" value={d.workoutType}
                            onInput={(e) => patch({ done: { ...d, workoutType: (e.currentTarget as HTMLInputElement).value.trim().toLowerCase() } })} />
                        </label>
                        <div class="switch" role="group" aria-label="Measure">
                          {MEASURES.map(([m, label]) => (
                            <button key={m} type="button" class={d.measure === m ? 'on' : ''} aria-pressed={d.measure === m}
                              onClick={() => patch({ done: { ...d, measure: m } })}>{label}</button>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </Option>
        ))}
      </div>

      {existing && (
        <div class="danger-zone">
          <button type="button" class="archive" disabled={busy}
            onClick={() => void guarded(() => actions.setArchived(existing.id, !existing.archived))}>
            {existing.archived ? 'Unarchive' : 'Archive'}
          </button>
          {confirming ? (
            <div class="confirm" role="group" aria-label="Confirm delete">
              <p>Delete {existing.name} and its {checkIns} check-ins?</p>
              <div class="confirm-actions">
                <button type="button" onClick={() => setConfirming(false)}>Keep it</button>
                <button type="button" class="delete" disabled={busy}
                  onClick={() => void guarded(() => actions.deleteHabit(existing.id))}>Delete</button>
              </div>
            </div>
          ) : (
            <button type="button" class="delete" onClick={() => setConfirming(true)}>Delete habit</button>
          )}
        </div>
      )}
    </form>
  );
}
