import { test, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/preact';
import { AppContext, type AppState, type SyncInfo } from './AppContext.tsx';
import { SyncStatus } from './SyncStatus.tsx';
import { seedData, SEED_NOW } from './testData.ts';

vi.mock('../store/repo', () => ({}));
afterEach(cleanup);

function show(sync: Partial<SyncInfo>) {
  const state: AppState = {
    data: seedData(), now: SEED_NOW, today: '2026-11-06', repo: { owner: 'o', repo: 'r', token: 't' },
    reload: async () => {}, openForm: () => {}, openHistory: () => {}, actions: {} as AppState['actions'],
    sync: { offline: false, pending: 0, syncing: false, syncedAt: null, ...sync },
  };
  return render(<AppContext.Provider value={state}><SyncStatus /></AppContext.Provider>);
}

test('shows nothing when online with an empty queue', () => {
  const { container } = show({});
  expect(container.textContent).toBe('');
});

test('offline with an empty queue shows when the data is from', () => {
  show({ offline: true, syncedAt: '2026-11-06T21:14:00-05:00' });
  expect(screen.getByRole('status').textContent).toBe('Offline. Showing data from 9:14 PM.');
});

test('offline with changes counts them, singular and plural', () => {
  show({ offline: true, pending: 2, syncedAt: '2026-11-06T21:14:00-05:00' });
  expect(screen.getByRole('status').textContent).toBe('Offline. 2 changes waiting to sync.');
  cleanup();
  show({ offline: true, pending: 1 });
  expect(screen.getByRole('status').textContent).toBe('Offline. 1 change waiting to sync.');
});

test('online and flushing shows Syncing', () => {
  show({ pending: 2, syncing: true });
  expect(screen.getByRole('status').textContent).toBe('Syncing 2 changes…');
});

test('online with changes that are not sending yet says they wait', () => {
  show({ pending: 1 });
  expect(screen.getByRole('status').textContent).toBe('1 change waiting to sync.');
});
