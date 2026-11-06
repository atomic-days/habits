import { test, expect } from 'vitest';
import { ringGeometry, formatClock, ringCaption } from './fastRing.ts';

test('segments appear as the fast grows', () => {
  expect(ringGeometry(0, 16).seg1).toBe('');
  expect(ringGeometry(8, 16).seg1).not.toBe('');
  expect(ringGeometry(8, 16).seg2).toBe('');
  expect(ringGeometry(20, 16).seg2).not.toBe('');
  expect(ringGeometry(20, 16).lap2).toBe('');
  expect(ringGeometry(31, 16).lap2).not.toBe('');
});

test('the tick sits at the goal angle', () => {
  const t = ringGeometry(10, 16).tick;
  expect([t.x1, t.y1, t.x2, t.y2].map((v) => +v.toFixed(2))).toEqual([27.56, 94.5, 11.98, 103.5]);
});

test('the head starts at the top, and moves to lap 2 past 24h', () => {
  expect(ringGeometry(0, 16).head).toEqual({ x: 70, y: 12 });
  const h = ringGeometry(30, 16).head;
  const q = ringGeometry(6, 16).head;
  expect(+h.x.toFixed(2)).toBe(+q.x.toFixed(2));
  expect(+h.y.toFixed(2)).toBe(+q.y.toFixed(2));
});

test('a full lap still draws', () => {
  expect(ringGeometry(24, 16).seg2).toContain('A');
});

test('clock and caption', () => {
  expect(formatClock(18.75)).toBe('18:45');
  expect(formatClock(0.05)).toBe('0:03');
  expect(ringCaption(14.37, 16)).toBe('goal 16h');
  expect(ringCaption(18.75, 16)).toBe('+2:45 past 16h');
});
