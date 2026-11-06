import type { Op } from '../model/applyOp.ts';
import { AuthError, NetworkError, RateLimitError, type DataRepo } from './github.ts';
import * as store from './repo.ts';

export type { Op, OpType } from '../model/applyOp.ts';

const KEY = 'habits.outbox.v1';
export const MAX_ATTEMPTS = 3;

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
export type NewOp = DistributiveOmit<Op, 'id' | 'attempts'>;

export interface Outbox {
  list(): Op[];
  add(op: NewOp): Op;
  remove(id: string): void;
  setAttempts(id: string, attempts: number): void;
}

export function localOutbox(): Outbox {
  const read = (): Op[] => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
      return Array.isArray(v) ? (v as Op[]) : [];
    } catch {
      return [];
    }
  };
  const write = (ops: Op[]) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(ops));
    } catch {
      // storage full or blocked: the op stays in the caller's memory only
    }
  };
  return {
    list: read,
    add(op) {
      const full = { ...op, id: crypto.randomUUID(), attempts: 0 } as Op;
      write([...read(), full]);
      return full;
    },
    remove: (id) => write(read().filter((o) => o.id !== id)),
    setAttempts: (id, attempts) => write(read().map((o) => (o.id === id ? { ...o, attempts } : o))),
  };
}

function send(r: DataRepo, op: Op): Promise<unknown> {
  switch (op.type) {
    case 'markDone': return store.upsertLog(r, { habit: op.args.habit, date: op.args.date, value: 1, at: op.at });
    case 'undoDone': return store.removeLog(r, op.args.habit, op.args.date);
    case 'setNumber': return store.upsertLog(r, { habit: op.args.habit, date: op.args.date, value: op.args.value, at: op.at });
    case 'startFast': return store.startFast(r, op.at, op.args.id);
    case 'endFast': return store.endFast(r, op.args.id, op.at);
    case 'editFast': return store.updateFast(r, op.args.id, op.args.patch);
    case 'saveHabit': return store.saveHabit(r, op.args.habit);
    case 'setArchived': return store.setArchived(r, op.args.id, op.args.archived);
    case 'deleteHabit': return store.deleteHabit(r, op.args.id);
  }
}

export interface FlushResult {
  sent: Op[];
  dropped: Op[];
  /** Why the flush ended early, or null when it ran through the whole queue. */
  stopped: 'network' | 'auth' | 'rate' | 'error' | null;
}

let running: Promise<FlushResult> | null = null;

/** Sends queued ops in order, one at a time. Only one flush runs at once; a second call gets the first's result. */
export function flush(r: DataRepo, outbox: Outbox): Promise<FlushResult> {
  running ??= run(r, outbox).finally(() => { running = null; });
  return running;
}

async function run(r: DataRepo, outbox: Outbox): Promise<FlushResult> {
  const result: FlushResult = { sent: [], dropped: [], stopped: null };
  // Re-read the head each time so a tap made during the flush is picked up too.
  for (let op = outbox.list()[0]; op; op = outbox.list()[0]) {
    try {
      await send(r, op);
      outbox.remove(op.id);
      result.sent.push(op);
    } catch (e) {
      if (e instanceof NetworkError) { result.stopped = 'network'; return result; }
      if (e instanceof AuthError) { result.stopped = 'auth'; return result; }
      // A rate limit is temporary, so it must never eat the user's change.
      if (e instanceof RateLimitError) { result.stopped = 'rate'; return result; }
      const attempts = op.attempts + 1;
      if (attempts < MAX_ATTEMPTS) {
        outbox.setAttempts(op.id, attempts);
        result.stopped = 'error';
        return result;
      }
      outbox.remove(op.id);
      result.dropped.push({ ...op, attempts });
    }
  }
  return result;
}
