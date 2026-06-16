/* Service worker — network-first so online users always get fresh files,
   with a cached fallback for offline. Bump CACHE when you change assets. */
const CACHE = 'daily-log-v11';
const ASSETS = [
  './', './index.html',
  './css/styles.css?v=11',
  './js/storage.js?v=11', './js/calories.js?v=11', './js/day.js?v=11',
  './js/money.js?v=11', './js/weight.js?v=11', './js/app.js?v=11',
  './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS).catch(() => {})) // tolerate any miss
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
