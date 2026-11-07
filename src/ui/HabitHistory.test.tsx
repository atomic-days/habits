import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/preact';
import { App } from './App.tsx';
import { seedData } from './testData.ts';
import type { AppData } from '../model/types.ts';
import * as repo from '../store/repo.ts';

vi.mock('../store/repo', () => ({
  loadAll: vi.fn(), loadFromCache: vi.fn(), saveHabit: vi.fn(), setArchived: vi.fn(), deleteHabit: vi.fn(),
  deleteFast: vi.fn(), upsertLog: vi.fn(), removeLog: vi.fn(), startFast: vi.fn(), updateFast: vi.fn(), endFast: vi.fn(),
}));

const now = () => new Date('2026-11-06T11:52:00-05:00');
afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  localStorage.setItem('habits.config', JSON.stringify({ owner: 'o', repo: 'r', token: 't' }));
});

/** Steps for each of the last 100 days, so 30 days and 12 weeks have different bar counts. */
function busy(): AppData {
  const d = seedData();
  for (let i = 0; i < 100; i++) {
    const day = new Date(Date.UTC(2026, 10, 6 - i)).toISOString().slice(0, 10);
    d.health[day] = { steps: 6000 + i * 50 };
  }
  d.fasts.push({ id: 'f1', start: '2026-11-05T21:30:00-05:00', end: '2026-11-06T13:45:00-05:00' });
  d.logs.push({ habit: 'laundry', date: '2026-10-30', value: 1, at: '2026-10-30T20:00:00-04:00' });
  return d;
}

async function open(name: string, d: AppData = busy()) {
  vi.mocked(repo.loadAll).mockResolvedValue(d);
  vi.mocked(repo.loadFromCache).mockReturnValue(d);
  render(<App now={now} />);
  await screen.findByRole('heading', { name: 'Today' });
  fireEvent.click(within(screen.getByTestId('streak-cards')).getByText(name));
}
const bars = () => document.querySelectorAll('[data-bar]').length;

test('tapping a streak card opens the history, and Back returns to Today', async () => {
  await open('Steps');
  expect(screen.getByRole('heading', { name: 'Steps' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('heading', { name: 'Today' })).toBeTruthy();
});

test('tapping a habit name in a Today row opens its history', async () => {
  const d = busy();
  vi.mocked(repo.loadAll).mockResolvedValue(d);
  vi.mocked(repo.loadFromCache).mockReturnValue(d);
  render(<App now={now} />);
  await screen.findByRole('heading', { name: 'Today' });
  fireEvent.click(within(screen.getByRole('list', { name: 'Today' })).getByRole('button', { name: 'Steps' }));
  expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
});

test('the pencil opens the habit form, and closing it returns to the history', async () => {
  await open('Steps');
  fireEvent.click(screen.getByRole('button', { name: 'Edit Steps' }));
  expect(screen.getByRole('heading', { name: 'Edit habit' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('heading', { name: 'Steps' })).toBeTruthy();
});

test('switching the range changes the number of bars', async () => {
  await open('Steps');
  expect(screen.getByRole('button', { name: '30 days' }).getAttribute('aria-pressed')).toBe('true');
  expect(bars()).toBe(30);
  fireEvent.click(screen.getByRole('button', { name: '12 weeks' }));
  expect(bars()).toBe(84);
  fireEvent.click(screen.getByRole('button', { name: '1 year' }));
  expect(bars()).toBe(15); // 100 days of data touch 15 weeks
});

test('the stats row shows the current streak, best streak and the average', async () => {
  await open('Steps');
  const stats = screen.getByRole('group', { name: 'Stats' });
  expect(within(stats).getByText('Current streak')).toBeTruthy();
  expect(within(stats).getByText('Best streak')).toBeTruthy();
  expect(within(stats).getByText('Average')).toBeTruthy();
});

test('the year grid has 53 weeks, and recent entries are worded for the habit', async () => {
  await open('Steps');
  expect(screen.getByRole('img', { name: 'Steps for the last 53 weeks' }).children).toHaveLength(53);
  const items = within(screen.getByRole('list', { name: 'Recent entries' })).getAllByRole('listitem');
  expect(items).toHaveLength(14);
  expect(items[0].textContent).toBe('Fri Nov 6 · 6,000 steps');
});

test('a fasting history lists fasts', async () => {
  await open('Fasting');
  expect(screen.getByText('Thu 9:30 PM → Fri 1:45 PM · 16h 15m')).toBeTruthy();
});

test('a chore shows a percentage line and done entries', async () => {
  await open('Laundry');
  expect(screen.getByText('Fri Oct 30 · done')).toBeTruthy();
  expect(screen.getByText('100%')).toBeTruthy();
});
