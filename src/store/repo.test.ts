import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Habit, LogEntry, Fast } from '../model/types.ts';
import type { FileCache } from './cache.ts';

vi.mock('./github.ts', async (orig) => {
  const actual = await orig<typeof import('./github.ts')>();
  return { ...actual, getRepo: vi.fn(), getFile: vi.fn(), listDir: vi.fn(), updateFile: vi.fn() };
});

import * as gh from './github.ts';
import {
  deleteHabit, healthShas, loadAll, removeLog, saveHabit, setArchived, startFast, updateFast, upsertLog,
} from './repo.ts';

const repo = { owner: 'o', repo: 'r', token: 't' };
const habit = (id: string): Habit => ({
  id, name: id, color: 'cyan', archived: false, created: '2026-01-01',
  schedules: [{ from: '2026-01-01', type: 'daily' }], done: { type: 'check' },
});
const entry = (habit: string, date: string, value = 1): LogEntry =>
  ({ habit, date, value, at: `${date}T08:00:00-05:00` });

// In-memory files behind the mocked client.
let files: Record<string, unknown>;
beforeEach(() => {
  files = {};
  vi.mocked(gh.getRepo).mockReset().mockResolvedValue(undefined);
  vi.mocked(gh.getFile).mockReset().mockImplementation(async (_r, p) =>
    p in files ? { json: structuredClone(files[p]) as never, sha: `sha-${p}` } : null);
  vi.mocked(gh.listDir).mockReset().mockImplementation(async (_r, dir) =>
    Object.keys(files).filter((p) => p.startsWith(dir + '/'))
      .map((p) => ({ name: p.slice(dir.length + 1), path: p, sha: `sha-${p}` })));
  vi.mocked(gh.updateFile).mockReset().mockImplementation(async (_r, p, empty, mutate) => {
    const next = mutate(structuredClone((p in files ? files[p] : empty)) as never);
    files[p] = next;
    return next as never;
  });
});

describe('loadAll', () => {
  test('an empty repo loads as empty data', async () => {
    vi.mocked(gh.getFile).mockResolvedValue(null);
    vi.mocked(gh.listDir).mockResolvedValue([]);
    expect(await loadAll(repo)).toEqual({ habits: [], logs: [], fasts: [], health: {}, healthSyncedAt: null });
    expect(gh.getRepo).toHaveBeenCalled();
  });

  test('a missing repo rejects with NotFoundRepoError', async () => {
    vi.mocked(gh.getRepo).mockRejectedValue(new gh.NotFoundRepoError('nope'));
    await expect(loadAll(repo)).rejects.toBeInstanceOf(gh.NotFoundRepoError);
    expect(gh.getFile).not.toHaveBeenCalled();
  });

  test('loads every file and finds the latest syncedAt', async () => {
    files['data/habits.json'] = { habits: [habit('a')] };
    files['data/fasts.json'] = { fasts: [{ id: 'f', start: 'x', end: null }] };
    files['data/log/2025.json'] = { entries: [entry('a', '2025-12-31')] };
    files['data/log/2026.json'] = { entries: [entry('a', '2026-01-01')] };
    files['data/health/2026-10.json'] = { '2026-10-31': { steps: 1, syncedAt: '2026-11-01T00:00:00Z' } };
    files['data/health/2026-11.json'] = { '2026-11-01': { steps: 2, syncedAt: '2026-11-02T00:00:00Z' } };
    const d = await loadAll(repo);
    expect(d.habits).toHaveLength(1);
    expect(d.fasts).toHaveLength(1);
    expect(d.logs).toHaveLength(2);
    expect(Object.keys(d.health)).toEqual(['2026-10-31', '2026-11-01']);
    expect(d.healthSyncedAt).toBe('2026-11-02T00:00:00Z');
  });

  test('a health file whose listed sha matches the cache is not fetched again', async () => {
    files['data/health/2026-11.json'] = { '2026-11-01': { steps: 9 } };
    const cache: FileCache = {
      get: (p) => (p === 'data/health/2026-11.json'
        ? { sha: 'sha-data/health/2026-11.json', json: { '2026-11-01': { steps: 5 } } } : null),
      set: vi.fn(),
    };
    const d = await loadAll(repo, cache);
    expect(d.health['2026-11-01'].steps).toBe(5);
    const fetched = vi.mocked(gh.getFile).mock.calls.map((c) => c[1]);
    expect(fetched).not.toContain('data/health/2026-11.json');
  });

  test('a changed sha is fetched and cached', async () => {
    files['data/health/2026-11.json'] = { '2026-11-01': { steps: 9 } };
    const cache: FileCache = {
      get: () => ({ sha: 'old', json: { '2026-11-01': { steps: 5 } } }),
      set: vi.fn(),
    };
    const d = await loadAll(repo, cache);
    expect(d.health['2026-11-01'].steps).toBe(9);
    expect(cache.set).toHaveBeenCalledWith('data/health/2026-11.json', 'sha-data/health/2026-11.json', { '2026-11-01': { steps: 9 } });
  });
});

describe('mutations', () => {
  test('saveHabit inserts, then replaces by id', async () => {
    await saveHabit(repo, habit('a'));
    await saveHabit(repo, { ...habit('a'), name: 'renamed' });
    await saveHabit(repo, habit('b'));
    const hs = (files['data/habits.json'] as { habits: Habit[] }).habits;
    expect(hs.map((h) => h.name)).toEqual(['renamed', 'b']);
  });

  test('setArchived flips the flag', async () => {
    files['data/habits.json'] = { habits: [habit('a')] };
    await setArchived(repo, 'a', true);
    expect((files['data/habits.json'] as { habits: Habit[] }).habits[0].archived).toBe(true);
  });

  test('upsertLog for laundry on 2026-11-06 replaces the old entry', async () => {
    files['data/log/2026.json'] = { entries: [entry('laundry', '2026-11-06', 1), entry('laundry', '2026-11-05', 1)] };
    await upsertLog(repo, entry('laundry', '2026-11-06', 7));
    const es = (files['data/log/2026.json'] as { entries: LogEntry[] }).entries;
    expect(es).toHaveLength(2);
    expect(es.find((e) => e.date === '2026-11-06')?.value).toBe(7);
  });

  test('an entry dated 2025-12-31 goes to data/log/2025.json', async () => {
    await upsertLog(repo, entry('laundry', '2025-12-31'));
    expect(Object.keys(files)).toEqual(['data/log/2025.json']);
  });

  test('removeLog drops only that habit and date', async () => {
    files['data/log/2026.json'] = { entries: [entry('a', '2026-11-06'), entry('b', '2026-11-06')] };
    await removeLog(repo, 'a', '2026-11-06');
    expect((files['data/log/2026.json'] as { entries: LogEntry[] }).entries.map((e) => e.habit)).toEqual(['b']);
  });

  test('deleteHabit removes the habit and its entries from every log file', async () => {
    files['data/habits.json'] = { habits: [habit('laundry'), habit('run')] };
    files['data/log/2025.json'] = { entries: [entry('laundry', '2025-12-31'), entry('run', '2025-12-31')] };
    files['data/log/2026.json'] = { entries: [entry('laundry', '2026-11-06'), entry('run', '2026-11-06')] };
    await deleteHabit(repo, 'laundry');
    expect((files['data/habits.json'] as { habits: Habit[] }).habits.map((h) => h.id)).toEqual(['run']);
    for (const p of ['data/log/2025.json', 'data/log/2026.json']) {
      expect((files[p] as { entries: LogEntry[] }).entries.map((e) => e.habit)).toEqual(['run']);
    }
  });

  test('startFast creates an open fast with a uuid; updateFast patches it', async () => {
    const f = await startFast(repo, '2026-11-06T20:00:00-05:00');
    expect(f.end).toBeNull();
    expect(f.id).toMatch(/^[0-9a-f-]{36}$/);
    await updateFast(repo, f.id, { end: '2026-11-07T12:00:00-05:00' });
    await updateFast(repo, f.id, { start: '2026-11-06T19:00:00-05:00' });
    const fasts = (files['data/fasts.json'] as { fasts: Fast[] }).fasts;
    expect(fasts).toEqual([{ id: f.id, start: '2026-11-06T19:00:00-05:00', end: '2026-11-07T12:00:00-05:00' }]);
  });

  test('startFast refuses when a fast is already running and returns it', async () => {
    const first = await startFast(repo, '2026-11-06T20:00:00-05:00');
    const second = await startFast(repo, '2026-11-06T20:01:00-05:00');
    expect(second).toEqual(first);
    expect((files['data/fasts.json'] as { fasts: Fast[] }).fasts).toEqual([first]);
  });

  test('startFast starts a new fast after the last one ended', async () => {
    files['data/fasts.json'] = { fasts: [{ id: 'old', start: '2026-11-05T10:00:00-05:00', end: '2026-11-05T20:00:00-05:00' }] };
    const f = await startFast(repo, '2026-11-06T20:00:00-05:00');
    expect(f.id).not.toBe('old');
    expect((files['data/fasts.json'] as { fasts: Fast[] }).fasts).toHaveLength(2);
  });

  test('healthShas maps each health file path to its sha', async () => {
    files['data/health/2026-10.json'] = {};
    expect(await healthShas(repo)).toEqual({ 'data/health/2026-10.json': 'sha-data/health/2026-10.json' });
  });
});
