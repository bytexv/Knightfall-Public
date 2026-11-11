/* Knightfall offline shell. The build writes a content-addressed asset manifest. */
importScripts('./sw-manifest.js');
const PREFIX = 'knightfall-shell-';
const CACHE = PREFIX + self.__KNIGHTFALL_BUILD__;
const PRECACHE = self.__KNIGHTFALL_ASSETS__ || [];
const scope = new URL(self.registration.scope);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE.map(path => new Request(new URL(path, scope), {cache: 'reload'})));
  })());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'OFFLINE_STATUS') {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      const keys = await cache.keys();
      event.source?.postMessage({type: 'OFFLINE_STATUS', ready: keys.length >= PRECACHE.length, assets: keys.length, build: self.__KNIGHTFALL_BUILD__});
    })());
  }
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== scope.origin) return;
  const relative = url.pathname.slice(scope.pathname.length);
  if (relative.startsWith('api/') || relative === 'health' || relative === 'ws') return;
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        if (response.status < 500) return response;
        return (await caches.match(new URL('./index.html', scope).href)) || response;
      } catch {
        return (await caches.match(new URL('./index.html', scope).href)) || Response.error();
      }
    })());
    return;
  }
  const known = PRECACHE.some(path => new URL(path, scope).pathname === url.pathname);
  if (!known) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request, {ignoreSearch: true});
    return cached || fetch(event.request);
  })());
});
