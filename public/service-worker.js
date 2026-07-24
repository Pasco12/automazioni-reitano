const CACHE_NAME = 'reitano-app-v1.0.10';
const APP_SHELL = [
  '/app',
  '/admin-app',
  '/css/app.css',
  '/js/client-app.js',
  '/js/admin-app.js',
  '/logo.svg',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/manifest-admin.webmanifest',
  '/app-icon-192.png',
  '/app-icon-512.png'
];
const APP_SHELL_PATHS = new Set(APP_SHELL);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => null));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;

  // Il service worker supporta solo le due web app. Le pagine pubbliche
  // devono sempre usare i file aggiornati distribuiti dal server.
  if (!APP_SHELL_PATHS.has(url.pathname)) return;

  if (url.pathname === '/app' || url.pathname === '/admin-app') {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => cached))
  );
});
