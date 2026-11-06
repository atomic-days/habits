import { test, expect } from 'vitest';
import { syncUrl, syncedLabel } from './sync.ts';

const now = new Date('2026-11-06T11:52:00-05:00');

test('syncUrl', () => {
  expect(syncUrl()).toBe('shortcuts://run-shortcut?name=Habits%20sync&input=text&text=7');
  expect(syncUrl(30)).toBe('shortcuts://run-shortcut?name=Habits%20sync&input=text&text=30');
});

test('syncedLabel', () => {
  expect(syncedLabel('2026-11-06T11:40:00-05:00', now)).toBe('Synced 11:40 AM');
  expect(syncedLabel('2026-11-05T21:02:00-05:00', now)).toBe('Synced yesterday 9:02 PM');
  expect(syncedLabel('2026-11-02T21:02:00-05:00', now)).toBe('Synced Mon Nov 2 9:02 PM');
  expect(syncedLabel(null, now)).toBe('Never synced');
});
