/* =========================================================
   ATCHMS Service Worker — v1.0
   Progressive Web App support: offline caching, install
   ========================================================= */

const CACHE_NAME = 'atchms-v2';
const STATIC_CACHE = 'atchms-static-v2';
const DYNAMIC_CACHE = 'atchms-dynamic-v2';

// Calculate dynamic base folder path (e.g. "/atchms/" or "/")
const SW_PATH = self.location.pathname;
const BASE_PATH = SW_PATH.substring(0, SW_PATH.lastIndexOf('/') + 1);

/* Pages & assets to pre-cache on install (App Shell) */
const PRECACHE_URLS = [
  BASE_PATH + 'index.html',
  BASE_PATH + 'login.html',
  BASE_PATH + 'register.html',
  BASE_PATH + 'about.html',
  BASE_PATH + 'contact.html',
  BASE_PATH + 'hostels.html',
  BASE_PATH + 'dashboard.html',
  BASE_PATH + 'my-application.html',
  BASE_PATH + 'payments.html',
  BASE_PATH + 'maintenance.html',
  BASE_PATH + 'profile.html',
  BASE_PATH + 'room-details.html',
  BASE_PATH + 'room-designer.html',
  BASE_PATH + 'style.css',
  BASE_PATH + 'api.js',
  BASE_PATH + 'room3d.js',
  BASE_PATH + 'manifest.json',
  BASE_PATH + 'atc-logo.png',
  BASE_PATH + 'atc-building.jpg',
  BASE_PATH + 'icons/icon-192x192.png',
  BASE_PATH + 'icons/icon-512x512.png'
];

/* ── Install: pre-cache the App Shell ── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Pre-caching app shell… base path:', BASE_PATH);
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW] Some pre-cache items failed:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

/* ── Activate: clean up old caches ── */
self.addEventListener('activate', (event) => {
  const VALID_CACHES = [STATIC_CACHE, DYNAMIC_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => !VALID_CACHES.includes(name))
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      )
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: Cache-First for static assets, Network-First for API ── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  /* Skip cross-origin requests (Google Maps, fonts, etc.) */
  if (url.origin !== self.location.origin) return;

  /* API calls → Network-First (always try live data, fallback gracefully) */
  if (url.pathname.startsWith(BASE_PATH + 'api/')) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  /* Static assets & pages → Cache-First with network fallback */
  event.respondWith(cacheFirstStrategy(request));
});

/* ──────────────────────────────────────
   Strategy: Cache-First
   Best for: HTML pages, CSS, JS, images
   ────────────────────────────────────── */
async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    /* Offline fallback for navigation requests */
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/atchms/offline.html');
      return fallback || new Response('<h2>You are offline. Please reconnect to continue.</h2>', {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    return new Response('', { status: 408, statusText: 'Request timeout' });
  }
}

/* ──────────────────────────────────────
   Strategy: Network-First
   Best for: API calls (live data preferred)
   ────────────────────────────────────── */
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'You are offline. Cached data unavailable.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/* ── Push Notifications (future support) ── */
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || 'ATCHMS', {
    body: data.body || '',
    icon: '/atchms/icons/icon-192x192.png',
    badge: '/atchms/icons/icon-72x72.png',
    data: { url: data.url || '/atchms/dashboard.html' }
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/atchms/dashboard.html')
  );
});
