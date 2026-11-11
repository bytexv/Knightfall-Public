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
      const present = await Promise.all(PRECACHE.map(path => cache.match(new URL(path, scope).href)));
      event.source?.postMessage({type: 'OFFLINE_STATUS', ready: present.every(Boolean), assets: present.filter(Boolean).length, build: self.__KNIGHTFALL_BUILD__});
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
  const fullEngine = relative.startsWith('engine/full/') && /\.(?:js|wasm)$/.test(relative);
  if (!known && !fullEngine) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request, {ignoreSearch: true});
    // A cached Response carries the URL of its first request. Returning that
    // URL for a worker can overwrite its #...,worker fragment, making a
    // Stockfish pthread recursively boot as a main engine. Preserve the
    // caller's script URL by returning a response with no redirected URL.
    const forWorker = response => event.request.destination === 'worker'
      ? new Response(response.body, {status:response.status,statusText:response.statusText,headers:response.headers})
      : response;
    if (cached) return forWorker(cached);
    const response = await fetch(event.request);
    if (fullEngine && response.ok && response.type !== 'opaque') {
      const cache = await caches.open(CACHE);
      try { await cache.put(event.request, response.clone()); } catch { /* Storage is optional; analysis still works online. */ }
    }
    return forWorker(response);
  })());
});
