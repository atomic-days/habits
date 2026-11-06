export type Route = 'network-first' | 'cache-first' | 'bypass';

const SCOPE = '/habits/';
const STATIC = /^\/habits\/(assets\/.+|manifest\.webmanifest|[^/]+\.png)$/;

/** Decides how the service worker handles a request. `origin` defaults to the worker's own. */
export function route(url: URL, mode: RequestMode, method: string, origin: string = location.origin): Route {
  if (method !== 'GET') return 'bypass';
  // Cross-origin includes api.github.com: data never enters the service-worker cache.
  if (url.origin !== origin) return 'bypass';
  if (mode === 'navigate') {
    return url.pathname === '/habits' || url.pathname.startsWith(SCOPE) ? 'network-first' : 'bypass';
  }
  return STATIC.test(url.pathname) ? 'cache-first' : 'bypass';
}
