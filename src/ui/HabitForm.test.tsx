import { test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { AppContext, type AppState } from './AppContext.tsx';
import { HabitForm } from './HabitForm.tsx';
import { seedData, SEED_NOW } from './testData.ts';

vi.mock('../store/repo', () => ({}));
afterEach(cleanup);

function setup(habitId: string | null, logs = 0) {
  const data = seedData();
  for (let i = 0; i < logs; i++) data.logs.push({ habit: 'laundry', date: `2026-02-${String(i + 1).padStart(2, '0')}`, value: 1, at: '' });
  const actions = {
    markDone: vi.fn(async () => {}), undoDone: vi.fn(async () => {}), setNumber: vi.fn(async () => {}),
    startFast: vi.fn(async () => {}), endFast: vi.fn(async () => {}), editFast: vi.fn(async () => {}),
    saveHabit: vi.fn(async () => {}), setArchived: vi.fn(async () => {}), deleteHabit: vi.fn(async () => {}), deleteFast: vi.fn(async () => {}),
  };
  const onClose = vi.fn();
  const state: AppState = {
    data, now: SEED_NOW, today: '2026-11-06', repo: { owner: 'o', repo: 'r', token: 't' },
    reload: async () => {}, openForm: () => {}, openHistory: () => {}, actions,
  };
  render(<AppContext.Provider value={state}><HabitForm habitId={habitId} onClose={onClose} /></AppContext.Provider>);
  return { actions, onClose };
}

test('Some times a week shows the steppers', () => {
  setup(null);
  expect(screen.queryByRole('button', { name: 'More times' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Some times a week' }));
  expect(screen.getByRole('button', { name: 'Fewer times' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'More times' }));
  expect(screen.getByText('2')).toBeTruthy();
});

test('Save on a valid new habit calls saveHabit, then onClose', async () => {
  const { actions, onClose } = setup(null);
  fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Stretch' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(actions.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ id: 'stretch', name: 'Stretch', created: '2026-11-06' }));
  expect(actions.saveHabit.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]);
});

test('Save with no name shows the error and does not save', () => {
  const { actions, onClose } = setup(null);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByRole('alert').textContent).toBe('Give it a name');
  expect(actions.saveHabit).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

test('Workouts shows the workout type and measure fields', () => {
  setup(null);
  fireEvent.click(screen.getByRole('button', { name: 'Hit a number' }));
  fireEvent.click(screen.getByRole('button', { name: 'Apple Health' }));
  fireEvent.click(screen.getByRole('button', { name: 'Workouts' }));
  expect((screen.getByLabelText('Workout type') as HTMLInputElement).value).toBe('running');
  expect(screen.getByRole('button', { name: 'Count' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Distance' }));
  expect(screen.getByRole('button', { name: 'Distance' }).getAttribute('aria-pressed')).toBe('true');
});

test('Apple Health offers steps, sleep, workouts and exercise minutes only', () => {
  setup(null);
  fireEvent.click(screen.getByRole('button', { name: 'Hit a number' }));
  fireEvent.click(screen.getByRole('button', { name: 'Apple Health' }));
  for (const n of ['Steps', 'Sleep', 'Workouts', 'Exercise minutes']) expect(screen.getByRole('button', { name: n })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Water' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Mindful minutes' })).toBeNull();
});

test('Delete asks for confirmation and counts the check-ins', async () => {
  const { actions, onClose } = setup('laundry', 17);
  fireEvent.click(screen.getByRole('button', { name: 'Delete habit' }));
  expect(screen.getByText('Delete Laundry and its 17 check-ins?')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
  expect(screen.queryByText('Delete Laundry and its 17 check-ins?')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Delete habit' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(actions.deleteHabit).toHaveBeenCalledWith('laundry');
});

test('Archive calls setArchived, and an archived habit offers Unarchive', async () => {
  const { actions } = setup('laundry');
  fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
  await vi.waitFor(() => expect(actions.setArchived).toHaveBeenCalledWith('laundry', true));
});

test('new habit has no Archive or Delete', () => {
  setup(null);
  expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Delete habit' })).toBeNull();
  expect(screen.getByText('New habit')).toBeTruthy();
});
