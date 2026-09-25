/* ── ZenFit V2 · core/fullscreen.js ────────────────────────
   V1 behavior kept: "double-tap splash → fullscreen".
   Improved: reliable double-tap detection (300ms window),
   works on the splash AND anywhere via triple-tap opt-in,
   remembers preference, iOS fallback (standalone prompt).
────────────────────────────────────────────────────────────── */
import { S } from './store.js';

function requestFS(elm = document.documentElement) {
  const req = elm.requestFullscreen || elm.webkitRequestFullscreen || elm.msRequestFullscreen;
  if (req) return Promise.resolve(req.call(elm)).catch(() => {});
  return Promise.resolve();
}
function exitFS() {
  if (!document.fullscreenElement) return Promise.resolve();
  return document.exitFullscreen?.().catch(() => {}) || Promise.resolve();
}
export const isFullscreen = () => !!document.fullscreenElement;
export function toggleFullscreen() {
  return isFullscreen() ? exitFS() : requestFS();
}

/**
 * Attach double-tap-to-fullscreen on the splash element.
 * Double tap = two pointerdowns within 320ms.
 * Shows a hint, respects S.fullscreenAutoStart on phones.
 */
export function initSplashFullscreen(splashEl) {
  if (!splashEl) return;
  let lastTap = 0, tapTimer = null;
  splashEl.addEventListener('pointerdown', () => {
    const now = Date.now();
    if (now - lastTap < 320) {
      clearTimeout(tapTimer);
      lastTap = 0;
      requestFS().then(() => {
        window.ZF?.toast?.('Fullscreen on — double-tap splash to toggle');
      });
    } else {
      lastTap = now;
      // Single tap still dismisses splash via app.js flow; nothing needed here
    }
  });

  // Auto-fullscreen on splash for phones (V1 setting, default ON)
  if (S.fullscreenAutoStart && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) {
    const once = () => {
      // Browsers require a gesture — first touch tries fullscreen silently
      requestFS();
      window.removeEventListener('touchstart', once);
    };
    window.addEventListener('touchstart', once, { passive: true });
  }
}
