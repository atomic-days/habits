import { describe, expect, test } from 'vitest';
import { mergeHealth, validatePayload } from './merge.ts';

const p = (sentAt: string, days: object) => validatePayload({ sentAt, days });

describe('validatePayload', () => {
  test('rejects a bad date key', () => {
    expect(() => p('2026-11-06T07:30:00-05:00', { '2026-13-01x': { steps: 1 } })).toThrow();
  });
  test('rejects a negative number', () => {
    expect(() => p('2026-11-06T07:30:00-05:00', { '2026-11-06': { steps: -1 } })).toThrow();
  });
  test('rejects a negative number inside a workout', () => {
    const w = { type: 'running', start: 'a', end: 'b', distanceKm: -2, durationMin: 10, avgHeartRate: null };
    expect(() => p('2026-11-06T07:30:00-05:00', { '2026-11-06': { workouts: [w] } })).toThrow();
  });
  test('rejects a sentAt that is not ISO', () => {
    expect(() => p('yesterday', { '2026-11-06': { steps: 1 } })).toThrow();
    expect(() => validatePayload({ days: {} })).toThrow();
  });
  test('drops unknown fields', () => {
    const v = p('2026-11-06T07:30:00-05:00', { '2026-11-06': { steps: 5, bogus: 1 } });
    expect(v.days['2026-11-06']).toEqual({ steps: 5 });
  });
});

describe('mergeHealth', () => {
  test('replaces the stored day completely and sets syncedAt', () => {
    const a = mergeHealth({}, p('2026-11-05T21:00:00-05:00', { '2026-11-05': { steps: 9000, waterLiters: 2 } }));
    const b = mergeHealth(a, p('2026-11-06T07:30:00-05:00', { '2026-11-05': { steps: 100 } }));
    expect(b['2026-11']['2026-11-05']).toEqual({ steps: 100, syncedAt: '2026-11-06T07:30:00-05:00' });
  });
  test('returns only changed months', () => {
    const r = mergeHealth({ '2026-09': { '2026-09-01': { steps: 1 } } },
      p('2026-11-01T08:00:00-04:00', { '2026-10-31': { steps: 1 }, '2026-11-01': { steps: 2 } }));
    expect(Object.keys(r).sort()).toEqual(['2026-10', '2026-11']);
  });
  test('merging the same payload twice equals merging once', () => {
    const pay = p('2026-11-06T07:30:00-05:00', { '2026-11-05': { steps: 9000 }, '2026-11-06': { sleepMinutes: 432 } });
    const once = mergeHealth({}, pay);
    expect(mergeHealth(once, pay)).toEqual(once);
  });
  test('two payloads for different days of one month keep both days', () => {
    const a = mergeHealth({}, p('2026-11-05T21:00:00-05:00', { '2026-11-05': { steps: 9000 } }));
    const b = mergeHealth(a, p('2026-11-06T07:30:00-05:00', { '2026-11-06': { sleepMinutes: 432 } }));
    expect(Object.keys(b['2026-11']).sort()).toEqual(['2026-11-05', '2026-11-06']);
  });
  test('does not mutate its input', () => {
    const files = { '2026-11': { '2026-11-05': { steps: 1 } } };
    mergeHealth(files, p('2026-11-06T07:30:00-05:00', { '2026-11-06': { steps: 2 } }));
    expect(files).toEqual({ '2026-11': { '2026-11-05': { steps: 1 } } });
  });
});
