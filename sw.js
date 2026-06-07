// Service worker de Andy Color (PWA). Cachea el "app shell" para que arranque
// offline y al instante; las llamadas al API (/generate, /capabilities…) siempre
// van a la red.
const CACHE = 'andycolor-v2';
const SHELL = [
  '/',
  '/js/svg-game.js',
  '/js/creations.js',
  '/js/finale.js',
  '/js/membership.js',
  '/js/ads.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll falla entero si un recurso no responde; lo hacemos tolerante
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // POST /generate -> red
  const url = new URL(req.url);
  // El API siempre a la red (nunca cacheado).
  if (url.origin === location.origin && /^\/(generate|capabilities|health|preview)\b/.test(url.pathname)) {
    return;
  }
  // App shell: cache-first con refresco en segundo plano.
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        const cacheable = res && res.ok &&
          (url.origin === location.origin || url.href.includes('cdn.jsdelivr.net'));
        if (cacheable) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached || (req.mode === 'navigate' ? caches.match('/') : undefined));
      return cached || network;
    })
  );
});
