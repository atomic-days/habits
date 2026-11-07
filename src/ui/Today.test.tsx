import { test, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/preact';
import { AppContext, type AppState } from './AppContext.tsx';
import { Today } from './Today.tsx';
import { seedData, SEED_NOW } from './testData.ts';
import type { AppData } from '../model/types.ts';

vi.mock('../store/repo', () => ({}));
beforeEach(() => localStorage.clear());
afterEach(cleanup);

function setup(data: AppData = seedData(), today = '2026-11-06', now = SEED_NOW) {
  const actions = {
    markDone: vi.fn(async () => {}), undoDone: vi.fn(async () => {}), setNumber: vi.fn(async () => {}),
    startFast: vi.fn(async () => {}), endFast: vi.fn(async () => {}), editFast: vi.fn(async () => {}),
    saveHabit: vi.fn(async () => {}), setArchived: vi.fn(async () => {}), deleteHabit: vi.fn(async () => {}), deleteFast: vi.fn(async () => {}),
  };
  const openForm = vi.fn();
  const state: AppState = {
    data, now, today, repo: { owner: 'o', repo: 'r', token: 't' },
    reload: async () => {}, openForm, openHistory: vi.fn(), actions,
  };
  render(<AppContext.Provider value={state}><Today /></AppContext.Provider>);
  return { actions, openForm };
}

const row = (name: string) => within(screen.getByText(name, { selector: 'h3 button' }).closest('li')!);

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

const SATURDAY = new Date('2026-11-07T09:00:00-05:00');

test('Friday laundry not done shows on Saturday as due yesterday and logs Friday', () => {
  const { actions } = setup(seedData(), '2026-11-07', SATURDAY);
  expect(row('Laundry').getByText('Due yesterday')).toBeTruthy();
  fireEvent.click(row('Laundry').getByRole('button', { name: 'Mark done' }));
  expect(actions.markDone).toHaveBeenCalledWith('laundry', '2026-11-06');
});

test('Friday laundry done on Friday has no row on Saturday', () => {
  const d = seedData();
  d.logs.push({ habit: 'laundry', date: '2026-11-06', value: 1, at: '2026-11-06T21:00:00-05:00' });
  setup(d, '2026-11-07', SATURDAY);
  expect(screen.queryByText('Laundry', { selector: 'h3 button' })).toBeNull();
});

test('the earlier-days menu covers yesterday back to 7 days ago', () => {
  setup();
  fireEvent.click(row('Laundry').getByRole('button', { name: 'More for Laundry' }));
  const labels = Array.from(document.querySelectorAll('.earlier button')).map((b) => b.textContent);
  expect(labels).toHaveLength(7);
  expect(labels[0]).toBe('Thu Nov 5');
  expect(labels[6]).toBe('Fri Oct 30');
});

test('the menu shows done days and tapping one undoes it', () => {
  const d = seedData();
  d.logs.push({ habit: 'laundry', date: '2026-11-04', value: 1, at: '2026-11-04T21:00:00-05:00' });
  const { actions } = setup(d);
  fireEvent.click(row('Laundry').getByRole('button', { name: 'More for Laundry' }));
  const done = row('Laundry').getByRole('button', { name: 'Wed Nov 4, done' });
  expect(done.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(done);
  expect(actions.undoDone).toHaveBeenCalledWith('laundry', '2026-11-04');
  expect(actions.markDone).not.toHaveBeenCalled();
});

test('the menu stays available once today is done', () => {
  const d = seedData();
  d.logs.push({ habit: 'laundry', date: '2026-11-06', value: 1, at: '2026-11-06T09:00:00-05:00' });
  const { actions } = setup(d);
  fireEvent.click(row('Laundry').getByRole('button', { name: 'More for Laundry' }));
  fireEvent.click(row('Laundry').getByRole('button', { name: 'Fri Oct 30' }));
  expect(actions.markDone).toHaveBeenCalledWith('laundry', '2026-10-30');
});

test('Archived (N) lists archived habits and opens the form', () => {
  const d = seedData();
  d.habits.push({ id: 'old', name: 'Old habit', color: 'green', archived: true, created: '2026-01-01',
    schedules: [{ from: '2026-01-01', type: 'daily' }], done: { type: 'check' } });
  const { openForm } = setup(d);
  expect(screen.queryByText('Old habit')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Archived (1)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Old habit' }));
  expect(openForm).toHaveBeenCalledWith('old');
});

test('no Archived button when nothing is archived', () => {
  setup();
  expect(screen.queryByRole('button', { name: /^Archived/ })).toBeNull();
});

test('Sync now sits under the header, above the fasting card and the streak cards', () => {
  setup();
  const sync = screen.getByLabelText('Apple Health sync');
  const header = document.querySelector('header.top')!;
  expect(header.compareDocumentPosition(sync) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(sync.compareDocumentPosition(screen.getByTestId('fast-card')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(sync.compareDocumentPosition(screen.getByTestId('streak-cards')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

function noHealth(): AppData {
  return { ...seedData(), health: {}, healthSyncedAt: null };
}
const connectCard = () => screen.queryByRole('region', { name: 'Connect Apple Health' });

test('with no Health data, a Connect Apple Health card lists three steps with their links', () => {
  setup(noHealth());
  const card = within(connectCard()!);
  expect(card.getAllByRole('listitem')).toHaveLength(3);
  // BASE_URL is /habits/ in the build and / under vitest.
  expect(card.getByRole('link', { name: 'Add the Health shortcut' }).getAttribute('href'))
    .toBe(`${import.meta.env.BASE_URL}habits-sync.shortcut`);
  expect(card.getByRole('link', { name: 'Run it once and allow Health' }).getAttribute('href'))
    .toBe('shortcuts://run-shortcut?name=Habits%20sync');
  expect(card.getByRole('link', { name: 'Bring in the past year' }).getAttribute('href'))
    .toBe('shortcuts://run-shortcut?name=Habits%20sync&input=text&text=365');
});

test('the card explains the three automations iOS needs added by hand', () => {
  setup(noHealth());
  const text = connectCard()!.textContent!;
  expect(text).toContain('iOS needs automations added by hand');
  expect(text).toContain('Automation');
  expect(text).toContain('Apple Watch workout ends');
  expect(text).toContain('7:30 AM');
  expect(text).toContain('9:30 PM');
  expect(text).toContain('Habits sync');
  expect(text).toContain('Run Immediately');
});

test('the Connect Apple Health card is hidden once Health data exists', () => {
  setup();
  expect(connectCard()).toBeNull();
});

test('dismissing the Connect Apple Health card keeps it hidden next time', () => {
  setup(noHealth());
  fireEvent.click(within(connectCard()!).getByRole('button', { name: 'Dismiss' }));
  expect(connectCard()).toBeNull();
  cleanup();
  setup(noHealth());
  expect(connectCard()).toBeNull();
});

test('the card still works when storage is unavailable', () => {
  const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  try {
    setup(noHealth());
    fireEvent.click(within(connectCard()!).getByRole('button', { name: 'Dismiss' }));
    expect(connectCard()).toBeNull();
  } finally {
    getItem.mockRestore();
    setItem.mockRestore();
  }
});
