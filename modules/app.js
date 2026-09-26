/* ── ZenFit V2 · app.js (bootstrap) ────────────────────────
   Boot: splash → theme/bg → router → PWA → onboarding.
   window.ZF is the ONLY global bridge (used by dynamic
   templates). Everything else communicates via store.subscribe.
────────────────────────────────────────────────────────────── */
import { S, update, save, subscribe, flushSave, APP_VERSION, APP_BUILD } from './core/store.js';
import { initRouter, switchScreen, renderActive, getCurrent } from './core/router.js';
import { applyBackgroundConfig, showNotif } from './core/ui.js';
import { loadAnime } from './core/animations.js';
import { initPWA } from './core/pwa.js';
import { initNotifications } from './core/notify.js';
import { initSplashFullscreen } from './core/fullscreen.js';
import { applyTheme } from './features/customization.js';
import { maybeOnboard } from './features/guide.js';
import { maybeChangelog } from './features/changelog.js';
import { checkAchievements } from './core/achievements.js';

/* Global bridge for templates + legacy inline handlers */
window.ZF = {
  go: (id, sub, dir) => switchScreen(id, sub, dir),
  rerender: () => renderActive(),
  save: () => save(),
  update: (fn, opts) => update(fn, opts),
  toast: (msg, type) => showNotif(msg, type),
  applyBg: () => applyBackgroundConfig(),
  get S() { return S; },
  get screen() { return getCurrent().screen; },
};

let splashDone = false;

/* Touch devices: block long-press menu + legacy pinch gesture.
   Scoped to coarse pointers — desktop right-click stays intact. */
try {
  if (window.matchMedia?.('(pointer: coarse)').matches) {
    document.addEventListener('contextmenu', (e) => {
      if (!e.target.closest?.('input,textarea,select,[contenteditable]')) e.preventDefault();
    });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }
} catch {}

function boot() {
  // V1 build/schema check: when APP_BUILD changes (new deploy), persist
  // versions and notify the service worker (V1 logic, adapted).
  try {
    const lastBuild = localStorage.getItem('zf_build');
    if (APP_BUILD && lastBuild !== APP_BUILD) {
      localStorage.setItem('zf_build', APP_BUILD);
      localStorage.setItem('zf_schema', '1');
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'BUILD_UPDATED', build: APP_BUILD, schemaVersion: 1 });
      }
    }
  } catch {}
  // Migrate removed themes, then apply before first paint (no flash)
  try {
    if (S.theme === 'dark' || S.theme === 'obsidian') {
      S.theme = 'midnight';
      update((s) => { s.theme = 'midnight'; }, { silent: true });
    }
  } catch {}
  try { applyTheme(S.theme || 'midnight'); } catch {}
  applyBackgroundConfig();

  initRouter();
  // V1 boot parity: daily quests exist before first paint.
  try {
    import('./features/quests.js').then((m) => { try { m.ensureDailyQuests(); } catch {} }).catch(() => {});
  } catch {}
  // Perf: state-driven re-renders are debounced — rapid successive
  // updates (sliders, bursts of XP) coalesce into ONE render.
  // Navigation calls renderActive() directly (immediate).
  let renderTimer = null;
  subscribe(() => {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => renderActive(), 80);
    try { import('./core/missions.js').then((m) => { try { m.checkMissions(); } catch {} }).catch(() => {}); } catch {}
  });
  initPWA();
  try { initNotifications(); } catch {}
  loadAnime();
  runSplash();
  // Check achievements on every load (catches anything earned offline)
  setTimeout(() => {
    try {
      const fresh = checkAchievements();
      if (fresh?.length) window.ZF.rerender();
    } catch {}
    try { import('./core/missions.js').then((m) => { try { m.checkMissions(); } catch {} }).catch(() => {}); } catch {}
  }, 200);
}

function runSplash() {
  const splash = document.getElementById('splash');
  const bar = document.getElementById('splash-bar');
  initSplashFullscreen(splash);
  let progress = 0;
  const iv = setInterval(() => {
    progress = Math.min(100, progress + 8 + Math.random() * 14);
    if (bar) bar.style.width = `${progress}%`;
    if (progress >= 100) {
      clearInterval(iv);
      setTimeout(hideSplash, 250);
    }
  }, 90);

  // Tap to skip waiting; double-tap = fullscreen (handled in fullscreen.js)
  splash?.addEventListener('pointerup', () => {
    if (progress > 40) { clearInterval(iv); hideSplash(); }
  });
  // Safety: never trap the user
  setTimeout(hideSplash, 5000);
}

function hideSplash() {
  if (splashDone) return;
  splashDone = true;
  const splash = document.getElementById('splash');
  if (window.anime && splash) {
    window.anime({ targets: splash, opacity: [1, 0], duration: 300, easing: 'easeOutCubic', complete: () => splash.remove() });
  } else splash?.remove();
  maybeOnboard();
  setTimeout(() => { try { maybeChangelog(); } catch {} }, 600);
}

document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
try {
  window.addEventListener('pagehide', () => { try { flushSave(); } catch {} });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { try { flushSave(); } catch {} } });
} catch {}
console.log(`[ZenFit] v${APP_VERSION} build ${APP_BUILD}`);
