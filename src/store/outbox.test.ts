import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./repo.ts', () => ({
  saveHabit: vi.fn(), setArchived: vi.fn(), deleteHabit: vi.fn(), upsertLog: vi.fn(), removeLog: vi.fn(),
  startFast: vi.fn(), endFast: vi.fn(), updateFast: vi.fn(),
}));

import * as store from './repo.ts';
import { AuthError, NetworkError } from './github.ts';
import { flush, localOutbox } from './outbox.ts';

const repo = { owner: 'o', repo: 'r', token: 't' };

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  for (const fn of Object.values(store)) vi.mocked(fn as never as () => Promise<unknown>).mockResolvedValue(undefined);
});

function queue() {
  const box = localOutbox();
  box.add({ type: 'startFast', args: { id: 'phone' }, at: '2026-11-06T20:02:00-05:00' });
  box.add({ type: 'markDone', args: { habit: 'floss', date: '2026-11-06' }, at: '2026-11-06T20:05:00-05:00' });
  box.add({ type: 'endFast', args: { id: 'phone' }, at: '2026-11-07T10:00:00-05:00' });
  return box;
}

describe('outbox storage', () => {
  test('keeps order, persists under habits.outbox.v1, and starts with zero attempts', () => {
    const box = queue();
    expect(box.list().map((o) => o.type)).toEqual(['startFast', 'markDone', 'endFast']);
    expect(box.list().every((o) => o.attempts === 0 && o.id)).toBe(true);
    expect(JSON.parse(localStorage.getItem('habits.outbox.v1')!)).toHaveLength(3);
    expect(localOutbox().list()).toHaveLength(3);
  });

  test('a corrupt value reads as an empty queue', () => {
    localStorage.setItem('habits.outbox.v1', '{nope');
    expect(localOutbox().list()).toEqual([]);
  });
});

describe('flush', () => {
  test('sends ops in order with their tap times and empties the queue', async () => {
    const box = queue();
    const calls: string[] = [];
    vi.mocked(store.startFast).mockImplementation(async () => { calls.push('startFast'); return {} as never; });
    vi.mocked(store.upsertLog).mockImplementation(async () => { calls.push('upsertLog'); });
    vi.mocked(store.endFast).mockImplementation(async () => { calls.push('endFast'); });
    const res = await flush(repo, box);
    expect(calls).toEqual(['startFast', 'upsertLog', 'endFast']);
    expect(store.startFast).toHaveBeenCalledWith(repo, '2026-11-06T20:02:00-05:00', 'phone');
    expect(store.upsertLog).toHaveBeenCalledWith(repo, { habit: 'floss', date: '2026-11-06', value: 1, at: '2026-11-06T20:05:00-05:00' });
    expect(store.endFast).toHaveBeenCalledWith(repo, 'phone', '2026-11-07T10:00:00-05:00');
    expect(box.list()).toEqual([]);
    expect(res.sent).toHaveLength(3);
    expect(res.stopped).toBeNull();
  });

  test('a NetworkError stops the flush, keeps the op and does not count an attempt', async () => {
    const box = queue();
    vi.mocked(store.upsertLog).mockRejectedValue(new NetworkError('offline'));
    const res = await flush(repo, box);
    expect(box.list().map((o) => o.type)).toEqual(['markDone', 'endFast']);
    expect(box.list()[0].attempts).toBe(0);
    expect(store.endFast).not.toHaveBeenCalled();
    expect(res.stopped).toBe('network');
  });

  test('an AuthError stops the flush and keeps the whole queue', async () => {
    const box = queue();
    vi.mocked(store.startFast).mockRejectedValue(new AuthError('401'));
    const res = await flush(repo, box);
    expect(box.list()).toHaveLength(3);
    expect(box.list()[0].attempts).toBe(0);
    expect(res.stopped).toBe('auth');
  });

  test('another error adds an attempt and stops; the third drops the op and the flush goes on', async () => {
    const box = queue();
    vi.mocked(store.startFast).mockRejectedValue(new Error('boom'));
    let res = await flush(repo, box);
    expect(res.stopped).toBe('error');
    expect(box.list()[0].attempts).toBe(1);
    res = await flush(repo, box);
    expect(box.list()[0].attempts).toBe(2);
    expect(res.dropped).toEqual([]);
    res = await flush(repo, box);
    expect(res.dropped.map((o) => o.type)).toEqual(['startFast']);
    expect(res.sent.map((o) => o.type)).toEqual(['markDone', 'endFast']);
    expect(res.stopped).toBeNull();
    expect(box.list()).toEqual([]);
  });

  test('a RateLimitError stops without counting an attempt', async () => {
    const { RateLimitError } = await import('./github.ts');
    const box = queue();
    vi.mocked(store.startFast).mockRejectedValue(new RateLimitError('rl'));
    const res = await flush(repo, box);
    expect(res.stopped).toBe('rate');
    expect(box.list()[0].attempts).toBe(0);
  });

  test('editFast, saveHabit, setArchived, deleteHabit, undoDone and setNumber call their repo functions', async () => {
    const box = localOutbox();
    const h = { id: 'h' } as never;
    box.add({ type: 'editFast', args: { id: 'f', patch: { start: 's' } }, at: 'a' });
    box.add({ type: 'saveHabit', args: { habit: h }, at: 'a' });
    box.add({ type: 'setArchived', args: { id: 'h', archived: true }, at: 'a' });
    box.add({ type: 'deleteHabit', args: { id: 'h' }, at: 'a' });
    box.add({ type: 'undoDone', args: { habit: 'h', date: 'd' }, at: 'a' });
    box.add({ type: 'setNumber', args: { habit: 'h', date: 'd', value: 4 }, at: 'a' });
    await flush(repo, box);
    expect(store.updateFast).toHaveBeenCalledWith(repo, 'f', { start: 's' });
    expect(store.saveHabit).toHaveBeenCalledWith(repo, h);
    expect(store.setArchived).toHaveBeenCalledWith(repo, 'h', true);
    expect(store.deleteHabit).toHaveBeenCalledWith(repo, 'h');
    expect(store.removeLog).toHaveBeenCalledWith(repo, 'h', 'd');
    expect(store.upsertLog).toHaveBeenCalledWith(repo, { habit: 'h', date: 'd', value: 4, at: 'a' });
    expect(box.list()).toEqual([]);
  });

  test('an op added while a flush is running is sent by that flush', async () => {
    const box = localOutbox();
    box.add({ type: 'startFast', args: { id: 'p' }, at: 'a' });
    vi.mocked(store.startFast).mockImplementation(async () => {
      box.add({ type: 'markDone', args: { habit: 'h', date: 'd' }, at: 'b' });
      return {} as never;
    });
    await flush(repo, box);
    expect(store.upsertLog).toHaveBeenCalledTimes(1);
    expect(box.list()).toEqual([]);
  });

  test('only one flush runs at a time', async () => {
    const box = queue();
    let release!: () => void;
    vi.mocked(store.startFast).mockImplementation(() => new Promise((res) => { release = () => res({} as never); }));
    const first = flush(repo, box);
    const second = flush(repo, box);
    expect(second).toBe(first);
    await Promise.resolve();
    release();
    await first;
    expect(store.startFast).toHaveBeenCalledTimes(1);
  });
});
