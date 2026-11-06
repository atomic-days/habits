import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact';
import { App } from './App.tsx';
import { AuthError } from '../store/github.ts';
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
