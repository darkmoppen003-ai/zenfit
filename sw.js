// ZenFit V2 Service Worker — offline shell + updates.
// Cache names derive from build → every deploy refreshes cleanly.

const SW_BUILD = "2026.09.26.26";
const SCHEMA_VERSION = 11;

const CACHE = `zenfit-${SW_BUILD}`;
const STATIC_CACHE = `zenfit-static-${SW_BUILD}`;
const DYNAMIC_CACHE = `zenfit-dynamic-${SW_BUILD}`;
const BUILD_CACHE = `zenfit-build-${SW_BUILD}`;

const PRECACHE = [
  './',
  './index.html',
  './offline.html',
  './export.html',
  './manifest.json',
  './zenfit.png',
  './favicon.ico',
  './chart.umd.js',
  './driver.js',
  './driver.css',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './css/screens.css',
  './css/animations.css',
  './css/responsive.css',
  './modules/app.js',
  './modules/core/store.js',
  './modules/core/utils.js',
  './modules/core/sanitize.js',
  './modules/core/router.js',
  './modules/core/ui.js',
  './modules/core/animations.js',
  './modules/core/pwa.js',
  './modules/core/fullscreen.js',
  './modules/core/selectors.js',
  './modules/core/nutrition-parse.js',
  './modules/core/backup.js',
  './modules/core/achievements.js',
  './modules/core/peer.js',
  './modules/core/cloud.js',
  './modules/core/notify.js',
  './modules/core/countries.js',
  './modules/core/secrets.js',
  './modules/features/dashboard.js',
  './modules/features/nutrition.js',
  './modules/features/water.js',
  './modules/features/workout.js',
  './modules/features/habits.js',
  './modules/features/tasks.js',
  './modules/features/zen.js',
  './modules/features/quests.js',
  './modules/features/analytics.js',
  './modules/features/profile.js',
  './modules/features/leaderboard.js',
  './modules/features/customization.js',
  './modules/features/admin.js',
  './modules/features/guide.js',
  './modules/features/changelog.js',
  './modules/features/achievements-screen.js',
  './modules/features/inbox.js',
  './modules/core/missions.js',
];

const STATIC_ASSETS = [
  './assets/mascot/med.gif',
  './assets/mascot/habits.png',
  './assets/mascot/nutrition.png',
  './assets/mascot/study.png',
  './assets/mascot/tasks.png',
  './assets/mascot/water.png',
  './assets/mascot/workout.png',
  './assets/mascot/mascot.png',
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
  './assets/bg/berserk.jpg',
  './assets/bg/holy.jpeg',
  './assets/bg/kafka-honkai-star-rail-hr.jpg',
  './assets/bg/knowledge.png',
  './assets/bg/man.jpg',
  './assets/bg/toji.jpg',
  './assets/bg/violet evergarden.png',
];

const NEVER_CACHE_HOSTS = ['anthropic.com', 'openfoodfacts', 'peerjs.com', 'exercisedb', 'supabase.co'];

self.addEventListener('install', (e) => {
  const precacheAll = async () => {
    const metaCache = await caches.open(BUILD_CACHE);
    await metaCache.put('zenfit-build-meta', new Response(JSON.stringify({ build: SW_BUILD, schema: SCHEMA_VERSION, timestamp: Date.now() })));
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE).catch(() => {});
    const staticCache = await caches.open(STATIC_CACHE);
    await staticCache.addAll(STATIC_ASSETS).catch(() => {});
  };
  e.waitUntil(precacheAll().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => {
        const keep = [CACHE, STATIC_CACHE, DYNAMIC_CACHE, BUILD_CACHE];
        return Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k)));
      })
      .then(() => self.clients.claim())
  );
});

function shouldNeverCache(url) {
  return NEVER_CACHE_HOSTS.some((h) => url.hostname.includes(h));
}

async function cacheFirst(req) {
  const cacheKey = req.url.includes('?') ? new Request(req.url.split('?')[0], req) : req;
  const cached = await caches.match(cacheKey);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE);
      try { await cache.put(cacheKey, res.clone()); } catch {}
    }
    return res;
  } catch {
    return caches.match('./offline.html');
  }
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE);
      try { await cache.put(req, res.clone()); } catch {}
    }
    return res;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    return caches.match('./offline.html');
  }
}

async function staleWhileRevalidate(req) {
  const cacheKey = req.url.includes('?') ? new Request(req.url.split('?')[0], req) : req;
  const cached = await caches.match(cacheKey);
  if (cached) {
    fetch(req).then((res) => {
      if (res && res.status === 200) caches.open(DYNAMIC_CACHE).then((c) => c.put(cacheKey, res.clone()).catch(() => {}));
    }).catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(req);
    if (res && res.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE);
      try { await cache.put(cacheKey, res.clone()); } catch {}
    }
    return res;
  } catch {
    return caches.match('./offline.html');
  }
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (shouldNeverCache(url)) return;
  const reqPath = e.request.url.split('?')[0];
  if (STATIC_ASSETS.some((a) => reqPath.includes(a))) { e.respondWith(staleWhileRevalidate(e.request)); return; }
  if (url.origin === self.location.origin) {
    if (/\.html?$|\/$/.test(url.pathname)) e.respondWith(networkFirst(e.request));
    else e.respondWith(cacheFirst(e.request));
    return;
  }
  if (url.hostname.includes('cdnjs.cloudflare.com') || url.hostname.includes('fonts.g')) {
    e.respondWith(cacheFirst(e.request));
    return;
  }
  e.respondWith(networkFirst(e.request));
});

self.addEventListener('message', (e) => {
  const data = e.data;
  if (!data || !data.type) return;
  switch (data.type) {
    case 'SHOW_NOTIFICATION':
      if (data.payload) {
        self.registration.showNotification(data.payload.title || 'ZenFit', {
          body: data.payload.body || '', tag: data.payload.tag || 'zenfit-notif',
          icon: 'zenfit.png', badge: 'zenfit.png',
          vibrate: [200, 100, 200], data: { url: data.payload.url || './' }, requireInteraction: true,
        });
      }
      break;
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
    case 'BUILD_UPDATED':
      self.skipWaiting();
      break;
    case 'SCHEDULE_REMINDER':
      scheduleReminderViaSW(data.payload);
      break;
    case 'GET_VERSION':
      if (e.source) e.source.postMessage({ type: 'VERSION_INFO', build: SW_BUILD, schema: SCHEMA_VERSION });
      break;
    case 'CLEAR_ALL_CACHES':
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .then(() => { if (e.source) e.source.postMessage({ type: 'CACHES_CLEARED' }); });
      break;
  }
});

// One timer per tag so water/task/study/streak reminders never clobber.
const reminderTimers = {};

async function scheduleReminderViaSW(payload) {
  if (!payload || !payload.delayMs) return;
  const tag = payload.tag || 'zenfit-scheduled';
  if (reminderTimers[tag]) clearTimeout(reminderTimers[tag]);
  const delay = Math.min(payload.delayMs, 86400000);
  reminderTimers[tag] = setTimeout(async () => {
    delete reminderTimers[tag];
    await self.registration.showNotification(payload.title || 'ZenFit', {
      body: payload.body || '',
      tag,
      icon: 'zenfit.png',
      badge: 'zenfit.png',
      vibrate: [200, 100, 200],
      data: { url: payload.url || './' },
      requireInteraction: true,
    });
  }, delay);
}

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const swDir = self.location.href.substring(0, self.location.href.lastIndexOf('/') + 1);
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) if ('focus' in client) return client.focus();
      if (clients.openWindow) return clients.openWindow(swDir);
    })
  );
});

self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'zenfit-water-reminder') {
    e.waitUntil(
      self.registration.showNotification('💧 Hydration Check', {
        body: 'Time to drink water, hunter! Stay hydrated.',
        tag: 'zenfit-water', icon: 'zenfit.png', badge: 'zenfit.png', data: { url: './' }, requireInteraction: true,
      })
    );
  }
});
