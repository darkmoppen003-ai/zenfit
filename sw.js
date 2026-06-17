// ZenFit Service Worker v7.8 — Major Visual Update
// Full offline support + background notifications

const CACHE = 'zenfit-v7.8';
const STATIC_CACHE = 'zenfit-static-v7.8';
const DYNAMIC_CACHE = 'zenfit-dynamic-v7.8';

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './zenfit.png',
  './favicon.ico',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js',
  'https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@400;500;600;700&display=swap',
];

const STATIC_ASSETS = [
  './assets/male/rank_S_idle.gif',
  './assets/male/rank_S_action.gif',
  './assets/male/rank_E_idle.gif',
  './assets/male/rank_E_action.gif',
  './assets/male/rank_D_idle.gif',
  './assets/male/rank_D_action.gif',
  './assets/male/rank_C_idle.gif',
  './assets/male/rank_C_action.gif',
  './assets/male/rank_B_idle.gif',
  './assets/male/rank_B_action.gif',
  './assets/male/rank_A_idle.gif',
  './assets/male/rank_A_action.gif',
  './assets/female/rank_S_idle.gif',
  './assets/female/rank_S_action.gif',
  './assets/female/rank_E_idle.gif',
  './assets/female/rank_E_action.gif',
  './assets/female/rank_D_idle.gif',
  './assets/female/rank_D_action.gif',
  './assets/female/rank_C_idle.gif',
  './assets/female/rank_C_action.gif',
  './assets/female/rank_B_idle.gif',
  './assets/female/rank_B_action.gif',
  './assets/female/rank_A_idle.gif',
  './assets/female/rank_A_action.gif',
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
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE);
    const staticCache = await caches.open(STATIC_CACHE);
    await staticCache.addAll(STATIC_ASSETS);
  };
  e.waitUntil(precacheAll().then(() => self.skipWaiting()));
});

// Activate — clean old caches, claim clients
self.addEventListener('activate', e => {
  const cleanCache = async () => {
    const keys = await caches.keys();
    const keep = [CACHE, STATIC_CACHE, DYNAMIC_CACHE];
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
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.status === 200 && res.type !== 'error') {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
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
    return cached || caches.match('./index.html');
  }
}

// Helper: stale-while-revalidate
async function staleWhileRevalidate(req) {
  const cached = await caches.match(req);
  if (cached) {
    fetch(req).then(res => {
      if (res && res.status === 200 && res.type !== 'error') {
        caches.open(DYNAMIC_CACHE).then(c => c.put(req, res.clone()));
      }
    }).catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(req);
    if (res && res.status === 200 && res.type !== 'error') {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    return caches.match('./index.html');
  }
}

// Fetch — intelligent routing
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  if (e.request.method !== 'GET' || shouldNeverCache(url)) return;

  const isStaticAsset = STATIC_ASSETS.some(a => e.request.url.includes(a));

  if (isStaticAsset) {
    e.respondWith(staleWhileRevalidate(e.request));
    return;
  }

  if (url.origin === self.location.origin) {
    e.respondWith(cacheFirst(e.request));
    return;
  }

  if (url.hostname.includes('cdnjs.cloudflare.com') || url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(cacheFirst(e.request));
    return;
  }

  e.respondWith(networkFirst(e.request));
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
