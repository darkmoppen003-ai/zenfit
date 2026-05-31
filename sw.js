// ZenFit Service Worker — Offline Cache
// Version bump this string to force cache refresh on deploy
const CACHE = 'zenfit-v2';

const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js',
];

// Install — cache core shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

// Activate — delete old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — cache-first for shell/assets, network-first for API calls
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept: Anthropic API, OpenFoodFacts, PeerJS broker, analytics
  if (
    url.hostname.includes('anthropic.com') ||
    url.hostname.includes('openfoodfacts') ||
    url.hostname.includes('peerjs.com') ||
    url.hostname.includes('exercisedb') ||
    e.request.method !== 'GET'
  ) {
    return;
  }

  // Cache-first for same-origin files and CDN assets
  if (
    url.origin === self.location.origin ||
    url.hostname.includes('cdnjs.cloudflare.com')
  ) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(response => {
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return response;
        }).catch(() => caches.match('/index.html'));
      })
    );
    return;
  }

  // Network-first for everything else (gif assets etc.)
  e.respondWith(
    fetch(e.request).then(response => {
      if (!response || response.status !== 200) return response;
      const clone = response.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return response;
    }).catch(() => caches.match(e.request))
  );
});
