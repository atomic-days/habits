import { test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/preact';
import { HistoryChart } from './HistoryChart.tsx';
import type { HistorySeries } from '../model/history.ts';
import { PALETTES } from '../model/grid.ts';

afterEach(() => { cleanup(); vi.useRealTimers(); });

const bars: HistorySeries = {
  kind: 'bar', goal: 10000, unit: 'steps', yMax: 15000,
  points: [
    { date: '2026-11-02', value: null, met: false },
    { date: '2026-11-03', value: 10500, met: true },
    { date: '2026-11-04', value: 7592, met: false },
    { date: '2026-11-05', value: 11000, met: true },
    { date: '2026-11-06', value: 8412, met: false },
  ],
};
const line: HistorySeries = {
  kind: 'line', goal: 7, unit: 'hours', yMax: 8,
  points: [
    { date: '2026-11-02', value: 7.5, met: true },
    { date: '2026-11-03', value: null, met: false },
    { date: '2026-11-04', value: 6, met: false },
    { date: '2026-11-05', value: 7, met: true },
  ],
};
const draw = (s: HistorySeries) => render(<HistoryChart series={s} color="cyan" label="Steps chart" />);
const svg = () => screen.getByRole('img', { name: 'Steps chart' });

test('one bar per point with data, none for gaps', () => {
  draw(bars);
  expect(svg().querySelectorAll('[data-bar]')).toHaveLength(4);
});

test('bars that meet the goal use the brightest shade, the rest the second', () => {
  draw(bars);
  const fill = (date: string) => svg().querySelector(`[data-bar="${date}"]`)!.getAttribute('fill');
  expect(fill('2026-11-03')).toBe(PALETTES.cyan[3]);
  expect(fill('2026-11-04')).toBe(PALETTES.cyan[2]);
});

test('a dashed goal line has a label', () => {
  draw(bars);
  const goal = svg().querySelector('[data-testid="goal-line"]')!;
  expect(goal.getAttribute('stroke-dasharray')).toBeTruthy();
  expect(screen.getByText('Goal 10,000')).toBeTruthy();
});

test('no goal, no goal line', () => {
  draw({ ...bars, goal: null });
  expect(svg().querySelector('[data-testid="goal-line"]')).toBeNull();
});

test('the y axis has 3 or 4 gridlines with labels', () => {
  draw(bars);
  expect(svg().querySelectorAll('[data-gridline]')).toHaveLength(3);
  for (const t of ['0', '5K', '10K', '15K']) expect(screen.getByText(t)).toBeTruthy();
});

test('x labels show a few dates', () => {
  draw(bars);
  expect(screen.getByText('Nov 2')).toBeTruthy();
  expect(screen.getByText('Nov 6')).toBeTruthy();
});

test('a line has a dot per point with data and breaks at a gap', () => {
  draw(line);
  expect(svg().querySelectorAll('[data-dot]')).toHaveLength(3);
  expect(svg().querySelector('[data-testid="line-path"]')!.getAttribute('d')!.match(/M/g)).toHaveLength(2);
  expect(svg().querySelectorAll('[data-bar]')).toHaveLength(0);
});

test('a percent axis is labeled in percent', () => {
  draw({ kind: 'line', goal: null, unit: '%', yMax: 100, points: [{ date: '2026-11-02', value: 50, met: false }] });
  expect(screen.getByText('100%')).toBeTruthy();
  expect(screen.getByText('50%')).toBeTruthy();
});

test('a pointer shows a crosshair and a readout with the date and value', () => {
  draw(bars);
  const readout = screen.getByRole('status');
  expect(readout.getAttribute('aria-live')).toBe('polite');
  expect(readout.textContent).toBe('');
  fireEvent.pointerDown(svg(), { clientX: 1000, pointerId: 1 });
  expect(readout.textContent).toBe('Fri Nov 6 · 8,412 steps');
  expect(svg().querySelector('[data-testid="crosshair"]')).toBeTruthy();
  fireEvent.pointerMove(svg(), { clientX: 0, pointerId: 1 });
  expect(readout.textContent).toBe('Mon Nov 2 · no data');
});

test('weekly points read as a week', () => {
  draw({ ...bars, points: [
    { date: '2026-10-26', value: 9000, met: false }, { date: '2026-11-02', value: 10028, met: true },
  ] });
  fireEvent.pointerDown(svg(), { clientX: 1000, pointerId: 1 });
  expect(screen.getByRole('status').textContent).toBe('Week of Nov 2 · 10,028 steps');
});

test('lifting a finger after a drag hides it, a tap stays for 3 seconds', () => {
  vi.useFakeTimers();
  draw(bars);
  const readout = screen.getByRole('status');
  fireEvent.pointerDown(svg(), { clientX: 10, pointerId: 1 });
  fireEvent.pointerMove(svg(), { clientX: 200, pointerId: 1 });
  fireEvent.pointerUp(svg(), { pointerId: 1 });
  expect(readout.textContent).toBe('');
  fireEvent.pointerDown(svg(), { clientX: 200, pointerId: 1 });
  fireEvent.pointerUp(svg(), { pointerId: 1 });
  expect(readout.textContent).not.toBe('');
  act(() => { vi.advanceTimersByTime(3100); });
  expect(readout.textContent).toBe('');
  expect(svg().querySelector('[data-testid="crosshair"]')).toBeNull();
});

test('arrow keys step through the points', () => {
  draw(bars);
  fireEvent.keyDown(svg(), { key: 'ArrowLeft' });
  expect(screen.getByRole('status').textContent).toBe('Fri Nov 6 · 8,412 steps');
  fireEvent.keyDown(svg(), { key: 'ArrowLeft' });
  expect(screen.getByRole('status').textContent).toBe('Thu Nov 5 · 11,000 steps');
});
