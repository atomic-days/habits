import { test, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { AppContext, type AppState } from './AppContext.tsx';
import { Today } from './Today.tsx';
import { seedData, SEED_NOW } from './testData.ts';

vi.mock('../store/repo', () => ({}));
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  setScroll(0);
});

function setScroll(top: number) {
  Object.defineProperty(document.documentElement, 'scrollTop', { value: top, configurable: true });
}

function setup(refresh: () => Promise<void>) {
  const state: AppState = {
    data: seedData(), now: SEED_NOW, today: '2026-11-06', repo: { owner: 'o', repo: 'r', token: 't' },
    reload: async () => {}, refresh, openForm: () => {}, actions: {} as AppState['actions'],
  };
  render(<AppContext.Provider value={state}><Today /></AppContext.Provider>);
}

const touch = (y: number) => ({ touches: [{ clientX: 10, clientY: y }], changedTouches: [{ clientX: 10, clientY: y }] });
function drag(distance: number) {
  fireEvent.touchStart(document, touch(100));
  fireEvent.touchMove(document, touch(100 + distance / 2));
  fireEvent.touchMove(document, touch(100 + distance));
  fireEvent.touchEnd(document, { touches: [], changedTouches: [{ clientX: 10, clientY: 100 + distance }] });
}

test('dragging down 100px from the top and releasing refreshes once', async () => {
  const refresh = vi.fn(async () => {});
  setup(refresh);
  drag(100);
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
});

test('dragging 40px does not refresh', async () => {
  const refresh = vi.fn(async () => {});
  setup(refresh);
  drag(40);
  await new Promise((r) => setTimeout(r, 20));
  expect(refresh).not.toHaveBeenCalled();
});

test('dragging while scrolled down does not refresh', async () => {
  const refresh = vi.fn(async () => {});
  setScroll(50);
  setup(refresh);
  drag(100);
  await new Promise((r) => setTimeout(r, 20));
  expect(refresh).not.toHaveBeenCalled();
});

test('the indicator is busy and labeled while refreshing, then gone', async () => {
  let done!: () => void;
  const refresh = vi.fn(() => new Promise<void>((r) => { done = r; }));
  setup(refresh);
  drag(100);
  const ind = await screen.findByLabelText('Refreshing');
  expect(ind.getAttribute('aria-busy')).toBe('true');
  done();
  await waitFor(() => expect(screen.queryByLabelText('Refreshing')).toBeNull());
  await waitFor(() => expect(document.querySelector('.ptr')).toBeNull());
});
