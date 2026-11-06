import type { AppData, DateKey, Fast, Habit, HealthDay, LogEntry } from '../model/types.ts';
import type { FileCache } from './cache.ts';
import { getFile, getRepo, listDir, updateFile, type DataRepo } from './github.ts';

const HABITS = 'data/habits.json';
const FASTS = 'data/fasts.json';
const LOG_DIR = 'data/log';
const HEALTH_DIR = 'data/health';

type LogFile = { entries: LogEntry[] };

const logPath = (date: DateKey) => `${LOG_DIR}/${date.slice(0, 4)}.json`;

async function listJson(r: DataRepo, dir: string) {
  return (await listDir(r, dir)).filter((f) => f.name.endsWith('.json'));
}

async function readCached<T>(r: DataRepo, f: { path: string; sha: string }, cache?: FileCache): Promise<T | null> {
  const hit = cache?.get(f.path);
  if (hit && hit.sha === f.sha) return hit.json as T;
  const file = await getFile<T>(r, f.path);
  if (!file) return null;
  cache?.set(f.path, file.sha, file.json);
  return file.json;
}

function buildData(
  habits: Habit[], fasts: Fast[], logs: (LogFile | null)[], months: (Record<DateKey, HealthDay> | null)[],
): AppData {
  const health: Record<DateKey, HealthDay> = {};
  let healthSyncedAt: string | null = null;
  for (const month of months) {
    for (const [date, day] of Object.entries(month ?? {})) {
      health[date] = day;
      if (day.syncedAt && (healthSyncedAt === null || day.syncedAt > healthSyncedAt)) healthSyncedAt = day.syncedAt;
    }
  }
  return { habits, logs: logs.flatMap((l) => l?.entries ?? []), fasts, health, healthSyncedAt };
}

/** Rebuilds AppData from the files loadAll last cached. Null when habits.json was never cached. */
export function loadFromCache(cache: FileCache): AppData | null {
  const habits = cache.get(HABITS);
  if (!habits) return null;
  const under = (dir: string) => cache.paths().filter((p) => p.startsWith(`${dir}/`) && p.endsWith('.json')).sort();
  return buildData(
    (habits.json as { habits: Habit[] }).habits ?? [],
    ((cache.get(FASTS)?.json as { fasts: Fast[] } | undefined)?.fasts) ?? [],
    under(LOG_DIR).map((p) => cache.get(p)!.json as LogFile),
    under(HEALTH_DIR).map((p) => cache.get(p)!.json as Record<DateKey, HealthDay>),
  );
}

export async function loadAll(r: DataRepo, cache?: FileCache): Promise<AppData> {
  // A mistyped repo would 404 on every file below and look like an empty repo.
  await getRepo(r);
  const [habits, fasts, logFiles, healthFiles] = await Promise.all([
    getFile<{ habits: Habit[] }>(r, HABITS),
    getFile<{ fasts: Fast[] }>(r, FASTS),
    listJson(r, LOG_DIR),
    listJson(r, HEALTH_DIR),
  ]);
  const logs = await Promise.all(logFiles.map((f) => readCached<LogFile>(r, f, cache)));
  const months = await Promise.all(healthFiles.map((f) => readCached<Record<DateKey, HealthDay>>(r, f, cache)));

  if (habits) cache?.set(HABITS, habits.sha, habits.json);
  if (fasts) cache?.set(FASTS, fasts.sha, fasts.json);
  return buildData(habits?.json.habits ?? [], fasts?.json.fasts ?? [], logs, months);
}

function mutateHabits(r: DataRepo, message: string, fn: (hs: Habit[]) => Habit[]) {
  return updateFile<{ habits: Habit[] }>(r, HABITS, { habits: [] }, (c) => ({ habits: fn(c.habits) }), message);
}

export async function saveHabit(r: DataRepo, h: Habit): Promise<void> {
  await mutateHabits(r, `Save habit ${h.name}`, (hs) =>
    hs.some((x) => x.id === h.id) ? hs.map((x) => (x.id === h.id ? h : x)) : [...hs, h]);
}

export async function setArchived(r: DataRepo, id: string, archived: boolean): Promise<void> {
  await mutateHabits(r, `${archived ? 'Archive' : 'Unarchive'} habit ${id}`, (hs) =>
    hs.map((x) => (x.id === id ? { ...x, archived } : x)));
}

export async function deleteHabit(r: DataRepo, id: string): Promise<void> {
  await mutateHabits(r, `Delete habit ${id}`, (hs) => hs.filter((x) => x.id !== id));
  for (const f of await listJson(r, LOG_DIR)) {
    await updateFile<LogFile>(r, f.path, { entries: [] },
      (c) => ({ entries: c.entries.filter((e) => e.habit !== id) }), `Delete log for ${id}`);
  }
}

export async function upsertLog(r: DataRepo, e: LogEntry): Promise<void> {
  await updateFile<LogFile>(r, logPath(e.date), { entries: [] }, (c) => ({
    entries: [...c.entries.filter((x) => !(x.habit === e.habit && x.date === e.date)), e],
  }), `Log ${e.habit} ${e.date}`);
}

export async function removeLog(r: DataRepo, habit: string, date: DateKey): Promise<void> {
  await updateFile<LogFile>(r, logPath(date), { entries: [] }, (c) => ({
    entries: c.entries.filter((x) => !(x.habit === habit && x.date === date)),
  }), `Remove log ${habit} ${date}`);
}

function mutateFasts(r: DataRepo, message: string, fn: (fs: Fast[]) => Fast[]) {
  return updateFile<{ fasts: Fast[] }>(r, FASTS, { fasts: [] }, (c) => ({ fasts: fn(c.fasts) }), message);
}

export async function startFast(r: DataRepo, start: string, id: string = crypto.randomUUID()): Promise<Fast> {
  let result: Fast = { id, start, end: null };
  // The check runs inside the callback so a conflict retry and a second device both see the latest file.
  await mutateFasts(r, 'Start fast', (fs) => {
    const same = fs.find((f) => f.id === id);
    if (same) {
      result = same; // already stored, so a retried queue op adds nothing
      return fs;
    }
    const running = fs.find((f) => f.end === null);
    if (running) {
      // Two starts for one fast: the earlier time is the real one.
      result = Date.parse(start) < Date.parse(running.start) ? { ...running, start } : running;
      return fs.map((f) => (f === running ? result : f));
    }
    result = { id, start, end: null };
    return [...fs, result];
  });
  return result;
}

/** Ends the fast with this id. If no such fast exists, ends the running one, if any. */
export async function endFast(r: DataRepo, id: string, end: string): Promise<void> {
  await mutateFasts(r, 'End fast', (fs) => {
    const target = fs.find((f) => f.id === id) ?? fs.find((f) => f.end === null);
    return target ? fs.map((f) => (f === target ? { ...f, end } : f)) : fs;
  });
}

export async function updateFast(r: DataRepo, id: string, patch: { start?: string; end?: string | null }): Promise<void> {
  await mutateFasts(r, 'Update fast', (fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
}

/** Maps each health file path to its current sha. */
export async function healthShas(r: DataRepo): Promise<Record<string, string>> {
  return Object.fromEntries((await listJson(r, HEALTH_DIR)).map((f) => [f.path, f.sha]));
}
