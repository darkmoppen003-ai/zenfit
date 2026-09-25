/* ── ZenFit V2 · core/pwa.js ───────────────────────────────
   Service-worker registration, update flow, install prompt,
   online/offline indicator. GitHub Pages + CF Worker safe.
────────────────────────────────────────────────────────────── */
import { APP_BUILD } from './store.js';

export function initPWA() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      // Auto-check for updates hourly
      setInterval(() => reg.update().catch(() => {}), 3600000);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            banner(`Update ${APP_BUILD} ready — <button class="btn btn-sm btn-primary" id="zf-reload">Refresh</button>`);
            document.getElementById('zf-reload')?.addEventListener('click', () => {
              reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
              location.reload();
            });
          }
        });
      });
    }).catch(() => {});
  });

  window.addEventListener('online', () => banner('Back online — all data is local, nothing lost.'));
  window.addEventListener('offline', () => banner("You're offline — tracking still works."));
}

let bannerTimer = null;
function banner(html) {
  let b = document.getElementById('zf-pwa-banner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'zf-pwa-banner';
    b.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:10001;background:var(--bg-surface);border:1px solid var(--primary);border-radius:12px;padding:10px 16px;font-size:13px;';
    document.body.appendChild(b);
  }
  b.innerHTML = html;
  b.style.display = 'block';
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { b.style.display = 'none'; }, 6000);
}
