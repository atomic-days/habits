import { test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/preact';
import { AppContext, type AppState } from './AppContext.tsx';
import { Today } from './Today.tsx';
import { seedData, SEED_NOW } from './testData.ts';
import type { AppData } from '../model/types.ts';

vi.mock('../store/repo', () => ({}));
afterEach(cleanup);

function setup(data: AppData = seedData()) {
  const actions = {
    markDone: vi.fn(async () => {}), undoDone: vi.fn(async () => {}), setNumber: vi.fn(async () => {}),
    startFast: vi.fn(async () => {}), endFast: vi.fn(async () => {}), editFast: vi.fn(async () => {}),
    saveHabit: vi.fn(async () => {}), setArchived: vi.fn(async () => {}), deleteHabit: vi.fn(async () => {}),
  };
  const openForm = vi.fn();
  const state: AppState = {
    data, now: SEED_NOW, today: '2026-11-06', repo: { owner: 'o', repo: 'r', token: 't' },
    reload: async () => {}, openForm, actions,
  };
  render(<AppContext.Provider value={state}><Today /></AppContext.Provider>);
  return { actions, openForm };
}

const row = (name: string) => within(screen.getByText(name, { selector: 'h3' }).closest('li')!);

test('shows the date and an Add habit button', () => {
  const { openForm } = setup();
  expect(screen.getByText('Friday, Nov 6')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Add habit' }));
  expect(openForm).toHaveBeenCalledWith(null);
});

test('Mark done in the Laundry row logs today', () => {
  const { actions } = setup();
  fireEvent.click(row('Laundry').getByRole('button', { name: 'Mark done' }));
  expect(actions.markDone).toHaveBeenCalledWith('laundry', '2026-11-06');
});

test('More for Laundry logs an earlier day', () => {
  const { actions } = setup();
  fireEvent.click(row('Laundry').getByRole('button', { name: 'More for Laundry' }));
  fireEvent.click(row('Laundry').getByRole('button', { name: 'Wed Nov 4' }));
  expect(actions.markDone).toHaveBeenCalledWith('laundry', '2026-11-04');
});

test('a done check habit shows Done and Undo', () => {
  const d = seedData();
  d.logs.push({ habit: 'laundry', date: '2026-11-06', value: 1, at: '2026-11-06T09:00:00-05:00' });
  const { actions } = setup(d);
  expect(row('Laundry').getByText('Done')).toBeTruthy();
  fireEvent.click(row('Laundry').getByRole('button', { name: 'Undo' }));
  expect(actions.undoDone).toHaveBeenCalledWith('laundry', '2026-11-06');
});

test('Steps row shows value, streak nudge and source', () => {
  setup();
  const steps = row('Steps');
  expect(steps.getByText('8,412')).toBeTruthy();
  expect(steps.getByText('1,588 to go for a 4-day streak')).toBeTruthy();
  expect(steps.getByText('From Apple Health, 11:40 AM')).toBeTruthy();
  expect(steps.getByRole('progressbar')).toBeTruthy();
});

test('Runs row shows weekly progress', () => {
  setup();
  expect(row('Runs').getByText('1 of 2 this week')).toBeTruthy();
});

test('Cleaning is in Coming up with Sunday, not in Today', () => {
  setup();
  const today = screen.getByRole('list', { name: 'Today' });
  expect(within(today).queryByText('Cleaning')).toBeNull();
  const coming = within(screen.getByRole('list', { name: 'Coming up' }));
  expect(coming.getByText('Cleaning')).toBeTruthy();
  expect(coming.getByText('Sunday')).toBeTruthy();
});

test('a manual number row saves a value', () => {
  const d = seedData();
  d.habits.push({ id: 'pages', name: 'Pages', color: 'green', archived: false, created: '2026-01-01',
    schedules: [{ from: '2026-01-01', type: 'daily' }], done: { type: 'number', goal: 20, unit: 'pages', source: 'manual' } });
  const { actions } = setup(d);
  fireEvent.input(screen.getByLabelText('Pages'), { target: { value: '12' } });
  fireEvent.click(row('Pages').getByRole('button', { name: 'Save' }));
  expect(actions.setNumber).toHaveBeenCalledWith('pages', '2026-11-06', 12);
});

test('an archived habit appears nowhere', () => {
  const d = seedData();
  d.habits.push({ id: 'old', name: 'Old habit', color: 'green', archived: true, created: '2026-01-01',
    schedules: [{ from: '2026-01-01', type: 'daily' }], done: { type: 'check' } });
  setup(d);
  expect(screen.queryByText('Old habit')).toBeNull();
});
