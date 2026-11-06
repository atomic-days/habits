import { test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { AppContext, type AppState } from './AppContext.tsx';
import { FastCard } from './FastCard.tsx';
import { seedData, SEED_NOW } from './testData.ts';
import type { AppData } from '../model/types.ts';

vi.mock('../store/repo', () => ({}));
afterEach(cleanup);

function setup(data: AppData) {
  const actions = {
    markDone: vi.fn(async () => {}), undoDone: vi.fn(async () => {}), setNumber: vi.fn(async () => {}),
    startFast: vi.fn(async () => {}), endFast: vi.fn(async () => {}), editFast: vi.fn(async () => {}),
    saveHabit: vi.fn(async () => {}), setArchived: vi.fn(async () => {}), deleteHabit: vi.fn(async () => {}),
  };
  const state: AppState = {
    data, now: SEED_NOW, today: '2026-11-06', repo: { owner: 'o', repo: 'r', token: 't' },
    reload: async () => {}, openForm: vi.fn(), actions,
  };
  render(<AppContext.Provider value={state}><FastCard /></AppContext.Provider>);
  return actions;
}

function running(): AppData {
  const d = seedData();
  d.fasts.push({ id: 'f1', start: '2026-11-05T17:07:00-05:00', end: null });
  return d;
}

test('a running fast shows the clock, start, goal time and streak line', () => {
  setup(running());
  expect(screen.getAllByText('18:45').length).toBeGreaterThan(0);
  expect(screen.getByText('Started Thu 5:07 PM')).toBeTruthy();
  expect(screen.getByText('Passed 16h at 9:07 AM')).toBeTruthy();
  expect(screen.getByText(/days? in a row at 16h\+/)).toBeTruthy();
});

test('End fast ends the running fast', () => {
  const a = setup(running());
  fireEvent.click(screen.getByRole('button', { name: 'End fast' }));
  expect(a.endFast).toHaveBeenCalledWith('f1');
});

test('with no fast running, Start fast starts one', () => {
  const a = setup(seedData());
  expect(screen.getByText('No fasts yet')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Start fast' }));
  expect(a.startFast).toHaveBeenCalled();
});

test('shows how long ago the last fast ended', () => {
  const d = seedData();
  d.fasts.push({ id: 'old', start: '2026-11-05T10:00:00-05:00', end: '2026-11-06T06:52:00-05:00' });
  setup(d);
  expect(screen.getByText('Last fast ended 5 hours ago')).toBeTruthy();
});

test('Edit times rejects an end before the start', () => {
  const a = setup(running());
  fireEvent.click(screen.getByRole('button', { name: 'Edit times' }));
  const [start, end] = Array.from(document.querySelectorAll('input[type="datetime-local"]')) as HTMLInputElement[];
  expect(start.value).toBe('2026-11-05T17:07');
  fireEvent.input(end, { target: { value: '2026-11-05T16:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByText('End must be after start')).toBeTruthy();
  expect(a.editFast).not.toHaveBeenCalled();
});

test('Edit times saves valid times', async () => {
  const a = setup(running());
  fireEvent.click(screen.getByRole('button', { name: 'Edit times' }));
  const [start] = Array.from(document.querySelectorAll('input[type="datetime-local"]')) as HTMLInputElement[];
  fireEvent.input(start, { target: { value: '2026-11-05T16:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(a.editFast).toHaveBeenCalledWith('f1', { start: '2026-11-05T16:00:00-05:00', end: null });
});

test('no card without a timer habit', () => {
  const d = seedData();
  d.habits = d.habits.filter((h) => h.done.type !== 'timer');
  setup(d);
  expect(screen.queryByTestId('fast-card')).toBeNull();
});
