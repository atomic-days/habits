import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/preact';
import { AppContext, type AppState } from './AppContext.tsx';
import { SyncRow } from './SyncRow.tsx';
import { seedData, SEED_NOW } from './testData.ts';
import * as repo from '../store/repo';

vi.mock('../store/repo', () => ({ healthShas: vi.fn() }));
const healthShas = vi.mocked(repo.healthShas);

let hrefSet: string[] = [];
const reload = vi.fn(async () => {});

beforeEach(() => {
  vi.useFakeTimers({ now: SEED_NOW });
  localStorage.clear();
  hrefSet = [];
  reload.mockClear();
  healthShas.mockReset();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { set href(v: string) { hrefSet.push(v); }, get href() { return 'http://localhost/'; } },
  });
  render(
    <AppContext.Provider value={{
      data: seedData(), now: SEED_NOW, today: '2026-11-06', repo: { owner: 'o', repo: 'r', token: 't' },
      reload, openForm: () => {}, openHistory: () => {}, actions: {} as AppState['actions'],
    }}><SyncRow /></AppContext.Provider>,
  );
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

async function tapSync() {
  fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}
async function comeBack() {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(0); });
}
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

test('shows when the last sync happened', () => {
  expect(screen.getByText('Synced 11:40 AM')).toBeTruthy();
});

test('Sync now stores the start time and shas, then opens the shortcut', async () => {
  healthShas.mockResolvedValue({ 'data/health/2026-11.json': 'a1' });
  await tapSync();
  expect(JSON.parse(localStorage.getItem('habits.healthShas')!)).toEqual({ 'data/health/2026-11.json': 'a1' });
  expect(localStorage.getItem('habits.syncStartedAt')).toBeTruthy();
  expect(hrefSet).toEqual(['shortcuts://run-shortcut?name=Habits%20sync&input=text&text=7']);
});

test('a change on the third poll, then a quiet poll, reloads once', async () => {
  healthShas.mockResolvedValue({ f: 'a1' });
  await tapSync();
  healthShas.mockReset();
  healthShas.mockResolvedValueOnce({ f: 'a1' }).mockResolvedValueOnce({ f: 'a1' }).mockResolvedValue({ f: 'b2' });
  await comeBack();
  expect(screen.getByText('Waiting for Apple Health…')).toBeTruthy();
  await tick(10_000);
  await tick(10_000);
  await tick(10_000);
  expect(reload).not.toHaveBeenCalled();
  await tick(10_000);
  expect(reload).toHaveBeenCalledTimes(1);
  await tick(60_000);
  expect(reload).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem('habits.syncStartedAt')).toBeNull();
  expect(screen.queryByText('Waiting for Apple Health…')).toBeNull();
});

test('a second month file landing after the first is still caught before the reload', async () => {
  healthShas.mockResolvedValue({ a: '1', b: '1' });
  await tapSync();
  healthShas.mockReset();
  healthShas.mockResolvedValueOnce({ a: '2', b: '1' }).mockResolvedValue({ a: '2', b: '2' });
  await comeBack();
  await tick(10_000);
  await tick(10_000);
  expect(reload).not.toHaveBeenCalled();
  await tick(10_000);
  expect(reload).toHaveBeenCalledTimes(1);
});

test('files that keep changing reload once at the 120 second limit', async () => {
  healthShas.mockResolvedValue({ f: 'a1' });
  await tapSync();
  let n = 0;
  healthShas.mockReset();
  healthShas.mockImplementation(async () => ({ f: `v${n++}` }));
  await comeBack();
  await tick(110_000);
  expect(reload).not.toHaveBeenCalled();
  await tick(10_000);
  expect(reload).toHaveBeenCalledTimes(1);
  await tick(60_000);
  expect(reload).toHaveBeenCalledTimes(1);
});

test('no change in 120 seconds shows the failure', async () => {
  healthShas.mockResolvedValue({ f: 'a1' });
  await tapSync();
  await comeBack();
  await tick(120_000);
  expect(screen.getByText("Sync didn't arrive. Try again.")).toBeTruthy();
  expect(reload).not.toHaveBeenCalled();
  expect(localStorage.getItem('habits.syncStartedAt')).toBeNull();
});

test('coming back after more than 5 minutes does not poll', async () => {
  healthShas.mockResolvedValue({ f: 'a1' });
  await tapSync();
  await tick(6 * 60_000);
  await comeBack();
  expect(screen.queryByText('Waiting for Apple Health…')).toBeNull();
});

test('offline disables Sync now and says why', () => {
  cleanup();
  render(
    <AppContext.Provider value={{
      data: seedData(), now: SEED_NOW, today: '2026-11-06', repo: { owner: 'o', repo: 'r', token: 't' },
      reload, openForm: () => {}, openHistory: () => {}, actions: {} as AppState['actions'],
      sync: { offline: true, pending: 0, syncing: false, syncedAt: null },
    }}><SyncRow /></AppContext.Provider>,
  );
  expect((screen.getByRole('button', { name: 'Sync now' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText('Needs a connection')).toBeTruthy();
});
