import { test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/preact';
import { AppContext, type AppState } from './AppContext.tsx';
import { StreakCards } from './StreakCards.tsx';
import { seedData, SEED_NOW } from './testData.ts';
import type { AppData } from '../model/types.ts';

vi.mock('../store/repo', () => ({}));
afterEach(cleanup);

function setup(data: AppData = seedData()) {
  const openForm = vi.fn();
  const state = {
    data, now: SEED_NOW, today: '2026-11-06', repo: { owner: 'o', repo: 'r', token: 't' },
    reload: async () => {}, openForm, actions: {},
  } as unknown as AppState;
  render(<AppContext.Provider value={state}><StreakCards /></AppContext.Provider>);
  return { openForm };
}

const card = (name: string) => within(screen.getByText(name).closest('button')!);

test('one card per active habit under the section title', () => {
  const d = seedData();
  d.habits[5].archived = true; // cleaning
  setup(d);
  expect(screen.getByText('Streaks, last 12 weeks')).toBeTruthy();
  expect(screen.getAllByRole('button')).toHaveLength(5);
  expect(screen.queryByText('Cleaning')).toBeNull();
});

test('a mini grid has 12 columns of 7 cells', () => {
  setup();
  const grid = screen.getByRole('img', { name: 'Laundry for the last 12 weeks' });
  expect(grid.children).toHaveLength(12);
  for (const col of Array.from(grid.children)) expect(col.children).toHaveLength(7);
});

test('the steps card shows its streak and best', () => {
  setup();
  const c = card('Steps');
  expect(c.getByText('3')).toBeTruthy();
  expect(c.getByText(/days in a row/)).toBeTruthy();
  expect(c.getByText(/Best/)).toBeTruthy();
  expect(c.getByText('Goal 10,000 steps')).toBeTruthy();
});

test('a streak of 1 uses the singular', () => {
  const d = seedData();
  d.logs.push({ habit: 'laundry', date: '2026-11-06', value: 1, at: '2026-11-06T09:00:00-05:00' });
  setup(d);
  expect(card('Laundry').getByText(/^ ?times? in a row$/)).toBeTruthy();
});

test('clicking the Laundry card opens its form', () => {
  const { openForm } = setup();
  fireEvent.click(screen.getByText('Laundry'));
  expect(openForm).toHaveBeenCalledWith('laundry');
});
