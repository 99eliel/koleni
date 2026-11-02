const CACHE_PREFIX = 'koleni-vendas';
const CACHE_VERSION = 'v1';
const CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`;
const BASE_PATH = new URL(self.registration.scope).pathname;
const pathFor = (path) => `${BASE_PATH}${path}`;
const APP_SHELL = [pathFor('manifest.webmanifest'), pathFor('pwa-icon.svg')];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then((cache) => cache.addAll(APP_SHELL))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE_PATH)) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, { cache: 'no-store' })
      .catch(() => caches.match(pathFor('index.html'))));
    return;
  }

  const shouldCache = url.pathname.startsWith(pathFor('assets/'))
    || url.pathname === pathFor('manifest.webmanifest')
    || url.pathname === pathFor('pwa-icon.svg');
  if (!shouldCache) return;

  event.respondWith(fetch(request, { cache: 'no-store' }).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request)));
});
