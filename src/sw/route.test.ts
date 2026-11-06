import { describe, expect, test } from 'vitest';
import { route } from './route.ts';

const u = (path: string, origin = 'https://dhruvmetha.github.io') => new URL(path, origin);
// The app is served from https://<host>/habits/, so same-origin means the page's own origin.
const here = 'https://dhruvmetha.github.io';

describe('route', () => {
  test('non-GET bypasses', () => {
    expect(route(u('/habits/', here), 'navigate', 'POST')).toBe('bypass');
    expect(route(u('/habits/assets/a.js', here), 'cors', 'PUT')).toBe('bypass');
  });

  test('cross-origin bypasses, including api.github.com', () => {
    expect(route(new URL('https://api.github.com/repos/o/r/contents/data/habits.json'), 'cors', 'GET', here)).toBe('bypass');
    expect(route(new URL('https://fonts.gstatic.com/x.woff2'), 'cors', 'GET', here)).toBe('bypass');
  });

  test('navigations under /habits/ are network-first', () => {
    expect(route(u('/habits/', here), 'navigate', 'GET', here)).toBe('network-first');
    expect(route(u('/habits/index.html', here), 'navigate', 'GET', here)).toBe('network-first');
    expect(route(u('/habits', here), 'navigate', 'GET', here)).toBe('network-first');
  });

  test('navigations outside /habits/ bypass', () => {
    expect(route(u('/other/', here), 'navigate', 'GET', here)).toBe('bypass');
  });

  test('assets, icons and the manifest are cache-first', () => {
    expect(route(u('/habits/assets/index-abc.js', here), 'cors', 'GET', here)).toBe('cache-first');
    expect(route(u('/habits/assets/index-abc.css', here), 'cors', 'GET', here)).toBe('cache-first');
    expect(route(u('/habits/icon-192.png', here), 'no-cors', 'GET', here)).toBe('cache-first');
    expect(route(u('/habits/apple-touch-icon.png', here), 'no-cors', 'GET', here)).toBe('cache-first');
    expect(route(u('/habits/manifest.webmanifest', here), 'cors', 'GET', here)).toBe('cache-first');
  });

  test('other same-origin GETs bypass', () => {
    expect(route(u('/habits/sw.js', here), 'same-origin', 'GET', here)).toBe('bypass');
    expect(route(u('/habits/data.json', here), 'cors', 'GET', here)).toBe('bypass');
  });
});
