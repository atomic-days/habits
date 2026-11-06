import { test, expect, vi, beforeEach, afterEach, describe } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act, within } from '@testing-library/preact';
import { App } from './App.tsx';
import { AuthError, RateLimitError } from '../store/github.ts';
import { seedData } from './testData.ts';
import type { AppData } from '../model/types.ts';
import { emptyData } from '../model/fixtures.ts';
import * as repo from '../store/repo.ts';

vi.mock('../store/repo', () => ({
  loadAll: vi.fn(),
  saveHabit: vi.fn(),
  setArchived: vi.fn(),
  deleteHabit: vi.fn(),
  upsertLog: vi.fn(),
  removeLog: vi.fn(),
  startFast: vi.fn(),
  updateFast: vi.fn(),
}));

const loadAll = vi.mocked(repo.loadAll);
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
  const MSG = "Couldn't save. Check your connection and try again.";
  async function ready() {
    saveToken();
    loadAll.mockResolvedValue(dailyCheck());
    render(<App now={now} />);
    await screen.findByRole('heading', { name: 'Today' });
    return flossMark();
  }

  test('a failed write shows a dismissible banner', async () => {
    vi.mocked(repo.upsertLog).mockRejectedValue(new Error('boom'));
    fireEvent.click(await ready());
    expect(await screen.findByText(MSG)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(MSG)).toBeNull();
  });

  test('a failed Start fast shows the banner', async () => {
    vi.mocked(repo.startFast).mockRejectedValue(new Error('boom'));
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Start fast' }));
    expect(await screen.findByText(MSG)).toBeTruthy();
  });

  test('an AuthError goes to the token screen with its message', async () => {
    vi.mocked(repo.upsertLog).mockRejectedValue(new AuthError('401'));
    fireEvent.click(await ready());
    expect(await screen.findByText("GitHub didn't accept that token or repo. Paste a new token.")).toBeTruthy();
    expect(screen.getByLabelText('GitHub token')).toBeTruthy();
  });

  test('a rate limit shows its own message and keeps the saved token', async () => {
    vi.mocked(repo.upsertLog).mockRejectedValue(new RateLimitError('429'));
    fireEvent.click(await ready());
    expect(await screen.findByText('GitHub is rate-limiting requests. Try again in a few minutes.')).toBeTruthy();
    expect(localStorage.getItem('habits.config')).toBeTruthy();
  });

  test('a rate limit at load shows the message with Retry and keeps the token', async () => {
    saveToken();
    loadAll.mockRejectedValue(new RateLimitError('403'));
    render(<App now={now} />);
    expect(await screen.findByText('GitHub is rate-limiting requests. Try again in a few minutes.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(localStorage.getItem('habits.config')).toBeTruthy();
  });
});
