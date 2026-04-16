const CACHE_NAME = 'venueiq-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/app.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500;700&display=swap'
];

// Install — cache core assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, fallback to cache
self.addEventListener('fetch', (e) => {
  // Skip non-GET requests, API calls, and WebSocket connections
  if (e.request.method !== 'GET' || e.request.url.includes('/api/') || e.request.url.includes('socket.io')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Only cache successful responses
        if (res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
