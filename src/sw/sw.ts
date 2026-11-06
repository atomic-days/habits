import { route } from './route.ts';

// lib.webworker conflicts with the DOM lib the app uses, so the few worker types needed are declared here.
interface ExtendableEvent extends Event { waitUntil(p: Promise<unknown>): void }
interface FetchEvent extends ExtendableEvent { request: Request; respondWith(r: Promise<Response> | Response): void }
interface Worker {
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  addEventListener(type: 'install' | 'activate', fn: (e: ExtendableEvent) => void): void;
  addEventListener(type: 'fetch', fn: (e: FetchEvent) => void): void;
}
const sw = self as unknown as Worker;

const CACHE = 'habits-v1';
const INDEX = '/habits/index.html';

sw.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(['/habits/', INDEX]))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => sw.clients.claim()),
  );
});

async function networkFirst(req: Request): Promise<Response> {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const copy = res.clone();
      void caches.open(CACHE).then((c) => c.put(INDEX, copy));
    }
    return res;
  } catch (err) {
    const cached = await caches.match(INDEX);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(req: Request): Promise<Response> {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) {
    const copy = res.clone();
    void caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}

sw.addEventListener('fetch', (e) => {
  const req = e.request;
  const kind = route(new URL(req.url), req.mode, req.method);
  if (kind === 'network-first') e.respondWith(networkFirst(req));
  else if (kind === 'cache-first') e.respondWith(cacheFirst(req));
});
