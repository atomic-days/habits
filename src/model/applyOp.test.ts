import { describe, expect, test } from 'vitest';
import { applyOp, type Op } from './applyOp.ts';
import { emptyData, habit } from './fixtures.ts';
import type { AppData } from './types.ts';

let n = 0;
const op = <T extends Op>(o: Omit<T, 'id' | 'attempts'>): Op => ({ id: `op${++n}`, attempts: 0, ...o }) as Op;
const check = habit({ id: 'floss', done: { type: 'check' } });
const base = (): AppData => ({ ...emptyData(), habits: [check] });

describe('applyOp', () => {
  test('markDone adds a log entry with the tap time and replaces one for the same day', () => {
    const a = applyOp(base(), op({ type: 'markDone', args: { habit: 'floss', date: '2026-11-06' }, at: '2026-11-06T08:00:00-05:00' }));
    expect(a.logs).toEqual([{ habit: 'floss', date: '2026-11-06', value: 1, at: '2026-11-06T08:00:00-05:00' }]);
    const b = applyOp(a, op({ type: 'markDone', args: { habit: 'floss', date: '2026-11-06' }, at: '2026-11-06T09:00:00-05:00' }));
    expect(b.logs).toHaveLength(1);
    expect(b.logs[0].at).toBe('2026-11-06T09:00:00-05:00');
  });

  test('undoDone removes the entry and leaves others', () => {
    const d = base();
    d.logs = [
      { habit: 'floss', date: '2026-11-06', value: 1, at: 'x' },
      { habit: 'floss', date: '2026-11-05', value: 1, at: 'y' },
    ];
    const out = applyOp(d, op({ type: 'undoDone', args: { habit: 'floss', date: '2026-11-06' }, at: 'z' }));
    expect(out.logs.map((l) => l.date)).toEqual(['2026-11-05']);
  });

  test('setNumber writes the value', () => {
    const out = applyOp(base(), op({ type: 'setNumber', args: { habit: 'floss', date: '2026-11-06', value: 7 }, at: '2026-11-06T10:00:00-05:00' }));
    expect(out.logs).toEqual([{ habit: 'floss', date: '2026-11-06', value: 7, at: '2026-11-06T10:00:00-05:00' }]);
  });

  test('startFast uses the phone id and tap time, then endFast closes it', () => {
    const started = applyOp(base(), op({ type: 'startFast', args: { id: 'phone' }, at: '2026-11-06T20:02:00-05:00' }));
    expect(started.fasts).toEqual([{ id: 'phone', start: '2026-11-06T20:02:00-05:00', end: null }]);
    const ended = applyOp(started, op({ type: 'endFast', args: { id: 'phone' }, at: '2026-11-07T12:00:00-05:00' }));
    expect(ended.fasts).toEqual([{ id: 'phone', start: '2026-11-06T20:02:00-05:00', end: '2026-11-07T12:00:00-05:00' }]);
  });

  test('startFast with a running fast keeps the earlier start', () => {
    const d = base();
    d.fasts = [{ id: 'run', start: '2026-11-06T20:00:00-05:00', end: null }];
    const later = applyOp(d, op({ type: 'startFast', args: { id: 'p' }, at: '2026-11-06T21:00:00-05:00' }));
    expect(later.fasts).toEqual(d.fasts);
    const earlier = applyOp(d, op({ type: 'startFast', args: { id: 'p' }, at: '2026-11-06T19:00:00-05:00' }));
    expect(earlier.fasts).toEqual([{ id: 'run', start: '2026-11-06T19:00:00-05:00', end: null }]);
  });

  test('endFast with an unknown id ends the running fast', () => {
    const d = base();
    d.fasts = [{ id: 'run', start: '2026-11-06T20:00:00-05:00', end: null }];
    const out = applyOp(d, op({ type: 'endFast', args: { id: 'gone' }, at: '2026-11-07T08:00:00-05:00' }));
    expect(out.fasts[0].end).toBe('2026-11-07T08:00:00-05:00');
  });

  test('editFast patches start and end', () => {
    const d = base();
    d.fasts = [{ id: 'f', start: '2026-11-06T20:00:00-05:00', end: null }];
    const out = applyOp(d, op({ type: 'editFast', args: { id: 'f', patch: { start: '2026-11-06T19:00:00-05:00', end: '2026-11-07T08:00:00-05:00' } }, at: 'z' }));
    expect(out.fasts).toEqual([{ id: 'f', start: '2026-11-06T19:00:00-05:00', end: '2026-11-07T08:00:00-05:00' }]);
  });

  test('saveHabit inserts then replaces by id', () => {
    const other = habit({ id: 'read', done: { type: 'check' } });
    const added = applyOp(base(), op({ type: 'saveHabit', args: { habit: other }, at: 'z' }));
    expect(added.habits.map((h) => h.id)).toEqual(['floss', 'read']);
    const renamed = applyOp(added, op({ type: 'saveHabit', args: { habit: { ...other, name: 'Reading' } }, at: 'z' }));
    expect(renamed.habits.map((h) => h.name)).toEqual(['floss', 'Reading']);
  });

  test('setArchived flips the flag', () => {
    const out = applyOp(base(), op({ type: 'setArchived', args: { id: 'floss', archived: true }, at: 'z' }));
    expect(out.habits[0].archived).toBe(true);
  });

  test('deleteHabit removes the habit and its log entries', () => {
    const d = base();
    d.logs = [{ habit: 'floss', date: '2026-11-06', value: 1, at: 'x' }, { habit: 'read', date: '2026-11-06', value: 1, at: 'x' }];
    const out = applyOp(d, op({ type: 'deleteHabit', args: { id: 'floss' }, at: 'z' }));
    expect(out.habits).toEqual([]);
    expect(out.logs.map((l) => l.habit)).toEqual(['read']);
  });

  test('does not mutate its input', () => {
    const d = base();
    const copy = structuredClone(d);
    applyOp(d, op({ type: 'markDone', args: { habit: 'floss', date: '2026-11-06' }, at: 'x' }));
    expect(d).toEqual(copy);
  });
});
