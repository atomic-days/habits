import { test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/preact';
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
    saveHabit: vi.fn(async () => {}), setArchived: vi.fn(async () => {}), deleteHabit: vi.fn(async () => {}), deleteFast: vi.fn(async () => {}),
  };
  const state: AppState = {
    data, now: SEED_NOW, today: '2026-11-06', repo: { owner: 'o', repo: 'r', token: 't' },
    reload: async () => {}, openForm: vi.fn(), openHistory: vi.fn(), actions,
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

test('Start fast is disabled while the write is in flight', async () => {
  const a = setup(seedData());
  let finish!: () => void;
  a.startFast.mockImplementation(() => new Promise<void>((r) => { finish = r; }));
  const btn = screen.getByRole('button', { name: 'Start fast' }) as HTMLButtonElement;
  await act(async () => { fireEvent.click(btn); });
  expect(btn.disabled).toBe(true);
  await act(async () => { fireEvent.click(btn); });
  expect(a.startFast).toHaveBeenCalledTimes(1);
  await act(async () => { finish(); });
  expect(btn.disabled).toBe(false);
});

test('Start fast re-enables after a failed write', async () => {
  const a = setup(seedData());
  a.startFast.mockRejectedValue(new Error('boom'));
  const btn = screen.getByRole('button', { name: 'Start fast' }) as HTMLButtonElement;
  fireEvent.click(btn);
  await act(async () => {});
  expect(btn.disabled).toBe(false);
});

function ended(): AppData {
  const d = seedData();
  d.fasts.push({ id: 'old', start: '2026-11-05T10:00:00-05:00', end: '2026-11-06T06:52:00-05:00' });
  return d;
}

test('Edit last fast saves new times for the most recent ended fast', async () => {
  const a = setup(ended());
  fireEvent.click(screen.getByRole('button', { name: 'Edit last fast' }));
  const [start, end] = Array.from(document.querySelectorAll('input[type="datetime-local"]')) as HTMLInputElement[];
  expect(start.value).toBe('2026-11-05T10:00');
  expect(end.value).toBe('2026-11-06T06:52');
  fireEvent.input(end, { target: { value: '2026-11-06T07:15' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await act(async () => {});
  expect(a.editFast).toHaveBeenCalledWith('old', { start: '2026-11-05T10:00:00-05:00', end: '2026-11-06T07:15:00-05:00' });
});

test('Edit last fast rejects an end before the start and an empty end', () => {
  const a = setup(ended());
  fireEvent.click(screen.getByRole('button', { name: 'Edit last fast' }));
  const [, end] = Array.from(document.querySelectorAll('input[type="datetime-local"]')) as HTMLInputElement[];
  fireEvent.input(end, { target: { value: '2026-11-05T09:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByText('End must be after start')).toBeTruthy();
  fireEvent.input(end, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByText('Enter a valid date and time')).toBeTruthy();
  expect(a.editFast).not.toHaveBeenCalled();
});

test('no Edit last fast without an ended fast, or while one is running', () => {
  setup(seedData());
  expect(screen.queryByRole('button', { name: 'Edit last fast' })).toBeNull();
  cleanup();
  setup(running());
  expect(screen.queryByRole('button', { name: 'Edit last fast' })).toBeNull();
});

test('Discard asks first, and Discard deletes the running fast', () => {
  const a = setup(running());
  fireEvent.click(screen.getByRole('button', { name: 'Discard fast' }));
  expect(screen.getByText("Discard this fast? It won't be saved.")).toBeTruthy();
  expect(a.deleteFast).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
  expect(a.deleteFast).toHaveBeenCalledWith('f1');
});

test('Keep fasting does not delete anything', () => {
  const a = setup(running());
  fireEvent.click(screen.getByRole('button', { name: 'Discard fast' }));
  fireEvent.click(screen.getByRole('button', { name: 'Keep fasting' }));
  expect(a.deleteFast).not.toHaveBeenCalled();
  expect(screen.queryByText("Discard this fast? It won't be saved.")).toBeNull();
});

test('Delete fast in Edit times confirms, then deletes that fast', () => {
  const a = setup(running());
  fireEvent.click(screen.getByRole('button', { name: 'Edit times' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete fast' }));
  expect(screen.getByText('Delete this fast?')).toBeTruthy();
  expect(a.deleteFast).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(a.deleteFast).toHaveBeenCalledWith('f1');
});

test('Delete fast in Edit last fast deletes the last ended fast, and Keep it backs out', () => {
  const d = seedData();
  d.fasts.push({ id: 'old', start: '2026-11-05T10:00:00-05:00', end: '2026-11-06T06:52:00-05:00' });
  const a = setup(d);
  fireEvent.click(screen.getByRole('button', { name: 'Edit last fast' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete fast' }));
  fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
  expect(a.deleteFast).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Delete fast' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(a.deleteFast).toHaveBeenCalledWith('old');
});
