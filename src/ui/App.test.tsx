import { test, expect, vi, beforeEach, afterEach, describe } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act, within } from '@testing-library/preact';
import { App } from './App.tsx';
import { AuthError, NetworkError, RateLimitError } from '../store/github.ts';
import { seedData } from './testData.ts';
import type { AppData } from '../model/types.ts';
import { emptyData } from '../model/fixtures.ts';
import * as repo from '../store/repo.ts';

vi.mock('../store/repo', () => ({
  loadAll: vi.fn(),
  loadFromCache: vi.fn(),
  saveHabit: vi.fn(),
  setArchived: vi.fn(),
  deleteHabit: vi.fn(),
  upsertLog: vi.fn(),
  removeLog: vi.fn(),
  startFast: vi.fn(),
  updateFast: vi.fn(),
  endFast: vi.fn(),
}));

const loadAll = vi.mocked(repo.loadAll);
const loadFromCache = vi.mocked(repo.loadFromCache);
const now = () => new Date('2026-11-06T11:52:00-05:00');

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

function saveToken() {
  localStorage.setItem('habits.config', JSON.stringify({ owner: 'dhruvmetha', repo: 'habits-data', token: 't' }));
}

test('with no config it asks for a token and defaults the repo', () => {
  render(<App now={now} />);
  expect(screen.getByLabelText('GitHub token')).toBeTruthy();
  expect((screen.getByLabelText('Data repo') as HTMLInputElement).value).toBe('dhruvmetha/habits-data');
});

test('submitting saves the config and loads once', async () => {
  loadAll.mockResolvedValue(emptyData());
  render(<App now={now} />);
  fireEvent.input(screen.getByLabelText('GitHub token'), { target: { value: 'ghp_abc' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('heading', { name: 'Today' });
  expect(loadAll).toHaveBeenCalledTimes(1);
  expect(JSON.parse(localStorage.getItem('habits.config')!)).toEqual({
    owner: 'dhruvmetha', repo: 'habits-data', token: 'ghp_abc',
  });
});

test('a bad token shows the token screen with a message', async () => {
  saveToken();
  loadAll.mockRejectedValue(new AuthError('401'));
  render(<App now={now} />);
  expect(await screen.findByText("GitHub didn't accept that token or repo. Paste a new token.")).toBeTruthy();
  expect(screen.getByLabelText('GitHub token')).toBeTruthy();
});

test('a network error offers Retry', async () => {
  saveToken();
  loadAll.mockRejectedValueOnce(new TypeError('fetch failed'));
  loadAll.mockResolvedValue(emptyData());
  render(<App now={now} />);
  expect(screen.getByText('Loading…')).toBeTruthy();
  expect(await screen.findByText("Couldn't reach GitHub.")).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(loadAll).toHaveBeenCalledTimes(2));
  await screen.findByRole('heading', { name: 'Today' });
});

const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
function setVisibility(v: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: v });
  document.dispatchEvent(new Event('visibilitychange'));
}

function flossMark() {
  const li = within(screen.getByRole('list', { name: 'Today' })).getAllByRole('listitem')
    .find((x) => x.querySelector('h3')?.textContent === 'Floss')!;
  return within(li).getByRole('button', { name: 'Mark done' });
}

function dailyCheck(): AppData {
  const d = seedData();
  d.habits.push({ id: 'floss', name: 'Floss', color: 'green', archived: false, created: '2026-01-01',
    schedules: [{ from: '2026-01-01', type: 'daily' }], done: { type: 'check' } });
  return d;
}

describe('the clock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  test('ticks every 30 seconds without refetching, so the date and the fasting ring advance', async () => {
    saveToken();
    const d = seedData();
    d.fasts.push({ id: 'f', start: '2026-11-06T20:00:00-05:00', end: null });
    loadAll.mockResolvedValue(d);
    let t = new Date('2026-11-06T20:00:10-05:00');
    render(<App now={() => t} />);
    await advance(0);
    expect(screen.getByText('Friday, Nov 6')).toBeTruthy();
    expect(screen.getByRole('img', { name: /^0:00 fasted/ })).toBeTruthy();
    t = new Date('2026-11-06T20:30:20-05:00');
    await advance(30_000);
    expect(screen.getByRole('img', { name: /^0:30 fasted/ })).toBeTruthy();
    t = new Date('2026-11-07T00:00:10-05:00');
    await advance(30_000);
    expect(screen.getByText('Saturday, Nov 7')).toBeTruthy();
    expect(loadAll).toHaveBeenCalledTimes(1);
  });

  test('does not tick while hidden', async () => {
    saveToken();
    loadAll.mockResolvedValue(emptyData());
    let t = new Date('2026-11-06T23:59:00-05:00');
    render(<App now={() => t} />);
    await advance(0);
    act(() => setVisibility('hidden'));
    t = new Date('2026-11-07T08:00:00-05:00');
    await advance(60_000);
    expect(screen.getByText('Friday, Nov 6')).toBeTruthy();
  });

  test('resuming on a new day shows it, reloads, and Mark done writes the new date', async () => {
    saveToken();
    loadAll.mockResolvedValue(dailyCheck());
    vi.mocked(repo.upsertLog).mockResolvedValue(undefined);
    let t = new Date('2026-11-06T21:00:00-05:00');
    render(<App now={() => t} />);
    await advance(0);
    act(() => setVisibility('hidden'));
    t = new Date('2026-11-07T08:00:00-05:00');
    act(() => setVisibility('visible'));
    await advance(0);
    expect(screen.getByText('Saturday, Nov 7')).toBeTruthy();
    expect(loadAll).toHaveBeenCalledTimes(2);
    fireEvent.click(flossMark());
    await advance(0);
    expect(vi.mocked(repo.upsertLog).mock.calls[0][1]).toMatchObject({ habit: 'floss', date: '2026-11-07' });
  });

  test('a failed background reload keeps the screen', async () => {
    saveToken();
    loadAll.mockResolvedValueOnce(emptyData()).mockRejectedValue(new TypeError('offline'));
    render(<App now={now} />);
    await advance(0);
    act(() => setVisibility('hidden'));
    act(() => setVisibility('visible'));
    await advance(0);
    expect(screen.getByRole('heading', { name: 'Today' })).toBeTruthy();
    expect(screen.queryByText("Couldn't reach GitHub.")).toBeNull();
  });
});

describe('write failures', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  const DROPPED = "Couldn't save a change after 3 tries, so it was dropped.";
  async function ready() {
    saveToken();
    loadAll.mockResolvedValue(dailyCheck());
    render(<App now={now} />);
    await advance(0);
    return flossMark();
  }

  test('a change that fails 3 times is dropped with a dismissible banner', async () => {
    vi.mocked(repo.upsertLog).mockRejectedValue(new Error('boom'));
    fireEvent.click(await ready());
    await advance(0);
    expect(screen.queryByText(DROPPED)).toBeNull();
    await advance(30_000);
    expect(screen.queryByText(DROPPED)).toBeNull();
    await advance(30_000);
    expect(repo.upsertLog).toHaveBeenCalledTimes(3);
    expect(screen.getByText(DROPPED)).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('habits.outbox.v1')!)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(DROPPED)).toBeNull();
  });

  test('an AuthError goes to the token screen with its message and keeps the queue', async () => {
    vi.mocked(repo.upsertLog).mockRejectedValue(new AuthError('401'));
    fireEvent.click(await ready());
    await advance(0);
    expect(screen.getByText("GitHub didn't accept that token or repo. Paste a new token.")).toBeTruthy();
    expect(screen.getByLabelText('GitHub token')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('habits.outbox.v1')!)).toHaveLength(1);
  });

  test('a rate limit shows its own message, keeps the token and the queued change', async () => {
    vi.mocked(repo.upsertLog).mockRejectedValue(new RateLimitError('429'));
    fireEvent.click(await ready());
    await advance(0);
    expect(screen.getByText('GitHub is rate-limiting requests. Try again in a few minutes.')).toBeTruthy();
    expect(localStorage.getItem('habits.config')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('habits.outbox.v1')!)).toHaveLength(1);
  });
});

describe('load failures', () => {
  test('a rate limit at load shows the message with Retry and keeps the token', async () => {
    saveToken();
    loadAll.mockRejectedValue(new RateLimitError('403'));
    render(<App now={now} />);
    expect(await screen.findByText('GitHub is rate-limiting requests. Try again in a few minutes.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(localStorage.getItem('habits.config')).toBeTruthy();
  });

  test('a NetworkError with no cache shows the unreachable screen', async () => {
    saveToken();
    loadAll.mockRejectedValue(new NetworkError('offline'));
    render(<App now={now} />);
    expect(await screen.findByText("Couldn't reach GitHub.")).toBeTruthy();
  });
});

describe('offline', () => {
  beforeEach(() => {
    saveToken();
    loadFromCache.mockReturnValue(dailyCheck());
    loadAll.mockRejectedValue(new NetworkError('offline'));
    vi.mocked(repo.upsertLog).mockRejectedValue(new NetworkError('offline'));
    vi.mocked(repo.startFast).mockRejectedValue(new NetworkError('offline'));
  });

  test('renders the cached data at once, then stays on it and says so', async () => {
    localStorage.setItem('habits.syncedAt', '2026-11-04T21:14:00-05:00');
    render(<App now={now} />);
    // Cached data shows before loadAll settles.
    expect(screen.getByRole('heading', { name: 'Today' })).toBeTruthy();
    expect(await screen.findByText('Offline. Showing data from Wed Nov 4 9:14 PM.')).toBeTruthy();
    expect(screen.getAllByRole('heading', { name: 'Floss' }).length).toBeGreaterThan(0);
    expect(screen.queryByText("Couldn't reach GitHub.")).toBeNull();
  });

  test('says "earlier" when no sync time was ever recorded', async () => {
    render(<App now={now} />);
    expect(await screen.findByText('Offline. Showing data from earlier.')).toBeTruthy();
  });

  test('a same-day sync time shows just the time', async () => {
    localStorage.setItem('habits.syncedAt', '2026-11-06T09:14:00-05:00');
    render(<App now={now} />);
    expect(await screen.findByText('Offline. Showing data from 9:14 AM.')).toBeTruthy();
  });

  test('Mark done shows the habit done right away and counts the waiting change', async () => {
    render(<App now={now} />);
    await screen.findByText(/^Offline\./);
    fireEvent.click(flossMark());
    expect(await screen.findByText('Offline. 1 change waiting to sync.')).toBeTruthy();
    const li = within(screen.getByRole('list', { name: 'Today' })).getAllByRole('listitem')
      .find((x) => x.querySelector('h3')?.textContent === 'Floss')!;
    expect(within(li).getByText('Done')).toBeTruthy();
    const ops = JSON.parse(localStorage.getItem('habits.outbox.v1')!);
    expect(ops).toMatchObject([{ type: 'markDone', args: { habit: 'floss', date: '2026-11-06' }, at: '2026-11-06T11:52:00-05:00' }]);
  });

  test('Start fast queues a phone-made id with the tap time and shows the fast running', async () => {
    render(<App now={now} />);
    await screen.findByText(/^Offline\./);
    fireEvent.click(screen.getByRole('button', { name: 'Start fast' }));
    await screen.findByRole('button', { name: 'End fast' });
    const [op] = JSON.parse(localStorage.getItem('habits.outbox.v1')!);
    expect(op).toMatchObject({ type: 'startFast', at: '2026-11-06T11:52:00-05:00' });
    expect(op.args.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('when online fires and the flush succeeds, it sends, reloads and the row clears', async () => {
    render(<App now={now} />);
    await screen.findByText(/^Offline\./);
    fireEvent.click(flossMark());
    await screen.findByText('Offline. 1 change waiting to sync.');
    vi.mocked(repo.upsertLog).mockResolvedValue(undefined);
    loadAll.mockResolvedValue(dailyCheck());
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(screen.queryByText(/waiting to sync|Offline|Syncing/)).toBeNull());
    expect(repo.upsertLog).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ habit: 'floss', value: 1 }));
    expect(loadAll).toHaveBeenCalledTimes(2);
    expect(JSON.parse(localStorage.getItem('habits.outbox.v1')!)).toEqual([]);
    expect(localStorage.getItem('habits.syncedAt')).toBeTruthy();
  });

  test('a queue left from an earlier session is sent on start', async () => {
    localStorage.setItem('habits.outbox.v1', JSON.stringify([
      { id: 'x', type: 'markDone', args: { habit: 'floss', date: '2026-11-05' }, at: '2026-11-05T22:00:00-05:00', attempts: 0 },
    ]));
    vi.mocked(repo.upsertLog).mockResolvedValue(undefined);
    loadAll.mockResolvedValue(dailyCheck());
    render(<App now={now} />);
    await waitFor(() => expect(repo.upsertLog).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText(/waiting to sync|Syncing/)).toBeNull());
  });
});
