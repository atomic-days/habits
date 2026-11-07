import type { AppData, DateKey, Fast, Habit } from './types.ts';

/** One queued tap. `at` is the local ISO time of the tap, so a late send still records when it happened. */
interface Base { id: string; at: string; attempts: number }
export type Op = Base & (
  | { type: 'markDone'; args: { habit: string; date: DateKey } }
  | { type: 'undoDone'; args: { habit: string; date: DateKey } }
  | { type: 'setNumber'; args: { habit: string; date: DateKey; value: number } }
  | { type: 'startFast'; args: { id: string } }
  | { type: 'endFast'; args: { id: string } }
  | { type: 'editFast'; args: { id: string; patch: { start?: string; end?: string | null } } }
  | { type: 'deleteFast'; args: { id: string } }
  | { type: 'saveHabit'; args: { habit: Habit } }
  | { type: 'setArchived'; args: { id: string; archived: boolean } }
  | { type: 'deleteHabit'; args: { id: string } }
);
export type OpType = Op['type'];

const withLog = (d: AppData, habit: string, date: DateKey, value: number, at: string): AppData => ({
  ...d,
  logs: [...d.logs.filter((x) => !(x.habit === habit && x.date === date)), { habit, date, value, at }],
});

const withoutLog = (d: AppData, habit: string, date: DateKey): AppData => ({
  ...d,
  logs: d.logs.filter((x) => !(x.habit === habit && x.date === date)),
});

function startFast(d: AppData, id: string, start: string): AppData {
  if (d.fasts.some((f) => f.id === id)) return d;
  const running = d.fasts.find((f) => f.end === null);
  if (!running) return { ...d, fasts: [...d.fasts, { id, start, end: null }] };
  if (Date.parse(start) >= Date.parse(running.start)) return d;
  return { ...d, fasts: d.fasts.map((f): Fast => (f === running ? { ...f, start } : f)) };
}

function endFast(d: AppData, id: string, end: string): AppData {
  const target = d.fasts.find((f) => f.id === id) ?? d.fasts.find((f) => f.end === null);
  return target ? { ...d, fasts: d.fasts.map((f): Fast => (f === target ? { ...f, end } : f)) } : d;
}

/** Applies one op to in-memory data the way the matching repo function changes the files. Pure. */
export function applyOp(d: AppData, op: Op): AppData {
  switch (op.type) {
    case 'markDone': return withLog(d, op.args.habit, op.args.date, 1, op.at);
    case 'undoDone': return withoutLog(d, op.args.habit, op.args.date);
    case 'setNumber': return withLog(d, op.args.habit, op.args.date, op.args.value, op.at);
    case 'startFast': return startFast(d, op.args.id, op.at);
    case 'endFast': return endFast(d, op.args.id, op.at);
    case 'editFast':
      return { ...d, fasts: d.fasts.map((f) => (f.id === op.args.id ? { ...f, ...op.args.patch } : f)) };
    case 'deleteFast': return { ...d, fasts: d.fasts.filter((f) => f.id !== op.args.id) };
    case 'saveHabit': {
      const h = op.args.habit;
      return { ...d, habits: d.habits.some((x) => x.id === h.id) ? d.habits.map((x) => (x.id === h.id ? h : x)) : [...d.habits, h] };
    }
    case 'setArchived':
      return { ...d, habits: d.habits.map((x) => (x.id === op.args.id ? { ...x, archived: op.args.archived } : x)) };
    case 'deleteHabit':
      return { ...d, habits: d.habits.filter((x) => x.id !== op.args.id), logs: d.logs.filter((e) => e.habit !== op.args.id) };
  }
}
