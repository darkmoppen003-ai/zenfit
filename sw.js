// ZenFit Service Worker
// Full offline support + background notifications + auto-update

// ── BUILD INFO (auto-updated by update-build.js) ───
const SW_BUILD = "2026.07.13.2";
const SCHEMA_VERSION = 1;

// Cache names derived from build — changes on every deploy
// forces browser to detect SW update and refresh all caches
const CACHE = `zenfit-${SW_BUILD}`;
const STATIC_CACHE = `zenfit-static-${SW_BUILD}`;
const DYNAMIC_CACHE = `zenfit-dynamic-${SW_BUILD}`;
const BUILD_CACHE = `zenfit-build-${SW_BUILD}`;

const PRECACHE = [
  './',
  './index.html',
  './offline.html',
  './manifest.json',
  './zenfit.png',
  './favicon.ico',
  // Note: CDN resources are fetched at runtime, not precached, to avoid install failures
];

const STATIC_ASSETS = [
  './assets/male/rank_S_idle.gif',
  './assets/male/rank_E_idle.gif',
  './assets/male/rank_D_idle.gif',
  './assets/male/rank_C_idle.gif',
  './assets/male/rank_B_idle.gif',
  './assets/male/rank_A_idle.gif',
  './assets/female/rank_S_idle.gif',
  './assets/female/rank_E_idle.gif',
  './assets/female/rank_D_idle.gif',
  './assets/female/rank_C_idle.gif',
  './assets/female/rank_B_idle.gif',
  './assets/female/rank_A_idle.gif',
  './assets/mascot/med.gif',
  './assets/mascot/habits.png',
  './assets/mascot/nutrition.png',
  './assets/mascot/study.png',
  './assets/mascot/tasks.png',
  './assets/mascot/water.png',
  './assets/mascot/workout.png',
  './assets/zen/campfire.mp3',
  './assets/zen/chime.mp3',
  './assets/zen/forest_morning.mp3',
  './assets/zen/heavy_rain.mp3',
  './assets/zen/ocean.mp3',
  './assets/zen/rain_puddle.mp3',
  './assets/zen/rainy_forest.mp3',
  './assets/zen/river.mp3',
  './assets/zen/soul_frequencies.mp3',
  './assets/zen/thunder.mp3',
];

const NEVER_CACHE_HOSTS = [
  'anthropic.com',
  'openfoodfacts',
  'peerjs.com',
  'exercisedb',
];

// Install — precache core shell + static assets
self.addEventListener('install', e => {
  const precacheAll = async () => {
    // Store build metadata for cross-session build tracking
    const metaCache = await caches.open(BUILD_CACHE);
    await metaCache.put('zenfit-build-meta', new Response(JSON.stringify({
      build: SW_BUILD,
      schema: SCHEMA_VERSION,
      timestamp: Date.now()
    })));

    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE);
    const staticCache = await caches.open(STATIC_CACHE);
    await staticCache.addAll(STATIC_ASSETS);
  };
  e.waitUntil(precacheAll().then(() => self.skipWaiting()));
});

// Activate — clean old caches (including previous builds), claim clients
self.addEventListener('activate', e => {
  const cleanCache = async () => {
    const keys = await caches.keys();
    const keep = [CACHE, STATIC_CACHE, DYNAMIC_CACHE, BUILD_CACHE];
    // Delete any cache that doesn't match this build — ensures no stale data survives a deploy
    await Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  };
  e.waitUntil(cleanCache());
});

// Helper: should never cache check
function shouldNeverCache(url) {
  return NEVER_CACHE_HOSTS.some(h => url.hostname.includes(h));
}

// Helper: cache-first strategy
async function cacheFirst(req) {
  // Strip query params for cache matching
  const cacheKey = req.url.includes('?') ? new Request(req.url.split('?')[0], req) : req;
  const cached = await caches.match(cacheKey);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.status === 200 && res.type !== 'error') {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(cacheKey, res.clone());
    }
    return res;
  } catch {
    const dest = req.destination;
    if (dest === 'document' || dest === '') return caches.match('./offline.html');
    return caches.match('./index.html');
  }
}

// Helper: network-first strategy
async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.status === 200 && res.type !== 'error') {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    const dest = req.destination;
    if (dest === 'document' || dest === '') return caches.match('./offline.html');
    return caches.match('./index.html');
  }
}

// Helper: stale-while-revalidate
async function staleWhileRevalidate(req) {
  const cacheKey = req.url.includes('?') ? new Request(req.url.split('?')[0], req) : req;
  const cached = await caches.match(cacheKey);
  if (cached) {
    fetch(req).then(res => {
      if (res && res.status === 200 && res.type !== 'error') {
        caches.open(DYNAMIC_CACHE).then(c => c.put(cacheKey, res.clone()));
      }
    }).catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(req);
    if (res && res.status === 200 && res.type !== 'error') {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(cacheKey, res.clone());
    }
    return res;
  } catch {
    const dest = req.destination;
    if (dest === 'document' || dest === '') return caches.match('./offline.html');
    return caches.match('./index.html');
  }
}

// Fetch — intelligent routing
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  if (e.request.method !== 'GET' || shouldNeverCache(url)) return;

  const reqPath = e.request.url.split('?')[0];
  const isStaticAsset = STATIC_ASSETS.some(a => reqPath.includes(a));

  if (isStaticAsset) {
    e.respondWith(staleWhileRevalidate(e.request));
    return;
  }

  if (url.origin === self.location.origin) {
    // HTML documents: network-first so users always get fresh content on deploy
    if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/offline.html' || /\.html?$/i.test(url.pathname)) {
      e.respondWith(networkFirst(e.request));
    } else if (/\.css$/i.test(url.pathname)) {
      // Styles: cache-first for speed
      e.respondWith(cacheFirst(e.request));
    } else {
      e.respondWith(cacheFirst(e.request));
    }
    return;
  }

  if (url.hostname.includes('cdnjs.cloudflare.com') || url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(cacheFirst(e.request));
    return;
  }

  e.respondWith(networkFirst(e.request));
});

// Clean old caches (from previous builds) when network is available
async function cleanOldCaches() {
  try {
    const keys = await caches.keys();
    const keep = [CACHE, STATIC_CACHE, DYNAMIC_CACHE, BUILD_CACHE];
    await Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k)));
  } catch {}
}

// On network online, sweep old caches
self.addEventListener('online', () => {
  cleanOldCaches();
});

// ── MESSAGE HANDLER (from main thread) ────────────────
self.addEventListener('message', e => {
  const data = e.data;
  if (!data || !data.type) return;

  switch (data.type) {
    case 'SHOW_NOTIFICATION':
      if (data.payload) {
        self.registration.showNotification(data.payload.title || 'ZenFit', {
          body: data.payload.body || '',
          tag: data.payload.tag || 'zenfit-notif',
          icon: data.payload.icon || 'zenfit.png',
          badge: 'zenfit.png',
          vibrate: [200, 100, 200],
          data: { url: data.payload.url || './' },
          requireInteraction: true,
        });
      }
      break;

    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'SCHEDULE_REMINDER':
      scheduleReminderViaSW(data.payload);
      break;

    case 'GET_VERSION':
      // Main thread asks for current SW build info
      if (e.source) {
        e.source.postMessage({
          type: 'VERSION_INFO',
          build: SW_BUILD,
          schema: SCHEMA_VERSION
        });
      }
      break;

    case 'BUILD_UPDATED':
      // Main thread notified us of a new build — soft refresh
      if (data && data.schemaVersion && data.schemaVersion !== SCHEMA_VERSION) {
        // Schema version mismatch — clear all caches for clean slate
        caches.keys().then(keys =>
          Promise.all(keys.map(k => caches.delete(k)))
        );
      }
      break;

    case 'CLEAR_ALL_CACHES':
      // Force clear everything (manual or migration trigger)
      caches.keys().then(keys =>
        Promise.all(keys.map(k => caches.delete(k)))
      ).then(() => {
        if (e.source) e.source.postMessage({ type: 'CACHES_CLEARED' });
      });
      break;
  }
});

// ── NOTIFICATION CLICK ─────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const swURL = self.location.href;
  const swDir = swURL.substring(0, swURL.lastIndexOf('/') + 1);
  const urlToOpen = e.notification.data && e.notification.data.url
    ? new URL(e.notification.data.url, swDir).href
    : swDir;

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// ── BACKGROUND SYNC ────────────────────────────────────
self.addEventListener('sync', e => {
  if (e.tag === 'zenfit-notif-sync') {
    e.waitUntil(processPendingNotifications());
  }
});

async function processPendingNotifications() {
  try {
    const cache = await caches.open(DYNAMIC_CACHE);
    const pendingReq = await cache.match('./_pending_notifs');
    if (!pendingReq) return;
    const pending = await pendingReq.json();
    for (const n of pending) {
      await self.registration.showNotification(n.title || 'ZenFit', {
        body: n.body || '',
        tag: n.tag || 'zenfit-sync',
        icon: 'zenfit.png',
        badge: 'zenfit.png',
        vibrate: [200, 100, 200],
        data: { url: n.url || './' },
        requireInteraction: true,
      });
    }
    await cache.delete('./_pending_notifs');
  } catch {}
}

let _reminderTimer = null;

async function scheduleReminderViaSW(payload) {
  if (!payload || !payload.delayMs) return;
  if (_reminderTimer) clearTimeout(_reminderTimer);
  const delay = Math.min(payload.delayMs, 86400000);
  _reminderTimer = setTimeout(async () => {
    _reminderTimer = null;
    await self.registration.showNotification(payload.title || 'ZenFit', {
      body: payload.body || '',
      tag: payload.tag || 'zenfit-scheduled',
      icon: 'zenfit.png',
      badge: 'zenfit.png',
      vibrate: [200, 100, 200],
      data: { url: payload.url || './' },
      requireInteraction: true,
    });
  }, delay);
}

// ── PERIODIC BACKGROUND SYNC (water reminders) ────────
self.addEventListener('periodicsync', e => {
  if (e.tag === 'zenfit-water-reminder') {
    e.waitUntil(fireWaterReminder());
  }
});

async function fireWaterReminder() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const swDir = self.location.href.substring(0, self.location.href.lastIndexOf('/') + 1);
  const isAppOpen = clients.some(c => c.url.startsWith(swDir));
  if (isAppOpen) return;
  await self.registration.showNotification('💧 Hydration Check', {
    body: 'Time to drink water, hunter! Stay hydrated.',
    tag: 'zenfit-water',
    icon: 'zenfit.png',
    badge: 'zenfit.png',
    vibrate: [200, 100, 200],
    data: { url: './' },
    requireInteraction: true,
  });
}
