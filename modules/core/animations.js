/* ── ZenFit V2 · core/animations.js ────────────────────────
   anime.js integration (Step 8): screen entrances, stagger
   reveals, swipe transitions. Graceful fallback to CSS when
   the CDN is unreachable (offline-first PWA).
────────────────────────────────────────────────────────────── */

let animeRef = null;
let loaded = false;

/* Real spring physics (anime 3.2 spring easing). Falls back to the
   --ease-spring overshoot curve in CSS when anime is offline. */
export const SPRING = 'spring(1, 110, 13, 0)';

export function loadAnime() {
  if (loaded) return Promise.resolve(animeRef);
  loaded = true;
  return new Promise((resolve) => {
    if (window.anime) { animeRef = window.anime; return resolve(animeRef); }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js';
    s.onload = () => { animeRef = window.anime || null; resolve(animeRef); };
    s.onerror = () => resolve(null); // offline → CSS fallback
    document.head.appendChild(s);
    setTimeout(() => resolve(window.anime || null), 4000);
  });
}

/* anime.js leaves final inline styles behind. A residual transform on a
   container turns it into the containing block for fixed descendants (the
   Studio sheet anchors to the viewport, not a 900px-tall screen). Snap the
   element back to its class-defined look once the entrance finishes. */
function snapStyle(el) {
  try { el.style.transform = ''; el.style.opacity = ''; } catch {}
}

/** Animate a freshly rendered screen + stagger its cards.
 * dir: 'up' (default fade-rise), 'left' / 'right' (swipe flow),
 * 'pop' (tab/dock taps: fade + scale). */
export function animateScreenEnter(screenEl, dir = 'up') {
  if (!screenEl) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  const cards = screenEl.querySelectorAll('.card,.card-sm,.card-raised,.quest-card,.task-card,.stat-block');
  // The Studio sheet is a fixed overlay: entrance transforms on it leave the
  // sticky head offset and re-bounce on every option change. Skip it.
  scrollTabsIntoView(screenEl);
  if (animeRef) {
    if (dir === 'pop') {
      animeRef({ targets: screenEl, opacity: [0, 1], scale: [0.96, 1], duration: 420, easing: SPRING, complete: () => snapStyle(screenEl) });
    } else {
      const from = dir === 'left' ? [60, 0] : dir === 'right' ? [-60, 0] : [0, 0];
      const fromY = dir === 'up' ? [14, 0] : [0, 0];
      animeRef({ targets: screenEl, opacity: [0, 1], translateX: from, translateY: fromY, duration: 260, easing: 'easeOutCubic', complete: () => snapStyle(screenEl) });
    }
    if (cards.length) {
      // Above-fold cards enter with the screen; below-fold ones wait
      // for the scroll observer (no double animation, no flash).
      const visible = [...cards].filter((el) => !el.closest('#sc-sheet') && el.getBoundingClientRect().top <= innerHeight * 0.9);
      if (visible.length) {
        animeRef({
          targets: visible, opacity: [0, 1], translateY: [12, 0], scale: [0.97, 1],
          duration: 520, delay: animeRef.stagger(35, { start: 60 }), easing: SPRING,
          complete: () => visible.forEach(snapStyle),
        });
      }
    }
  } else {
    screenEl.classList.add('anim-fadein');
  }
  observeScrollReveals(screenEl);
}

/* ── Scroll reveal: cards slide up + grow + settle with a soft
   bounce as they enter the viewport. One-shot per element. ── */
let revealObserver = null;
export function observeScrollReveals(root) {
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!revealObserver) {
      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const el = en.target;
          revealObserver.unobserve(el);
          if (animeRef) {
            animeRef({
              targets: el, opacity: [0.35, 1], translateY: [26, 0], scale: [0.96, 1],
              duration: 560, easing: SPRING,
              complete: () => snapStyle(el),
            });
          } else {
            el.classList.add('anim-fadein');
          }
        });
      }, { root: null, rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    }
    (root || document).querySelectorAll('.card,.card-sm,.card-raised,.quest-card,.task-card,.stat-block,.plan-card,.bonus-card').forEach((el) => {
      if (el.closest('#sc-sheet')) return; // fixed overlay — never scroll-revealed
      const r = el.getBoundingClientRect();
      // Only arm below-the-fold elements; above-fold already entered.
      if (r.top > innerHeight * 0.85) revealObserver.observe(el);
    });
  } catch { /* IntersectionObserver unavailable — content simply shows */ }
}

/** Smooth-scroll every tab bar so the active tab glides into view. */
export function scrollTabsIntoView(root) {
  try {
    root.querySelectorAll('.chart-tab-bar,.an-sec-bar').forEach((bar) => {
      const active = bar.querySelector('.chart-tab.active,.an-sec-btn.active');
      if (!active) return;
      const target = active.offsetLeft - bar.clientWidth / 2 + active.clientWidth / 2;
      if (animeRef) {
        const obj = { x: bar.scrollLeft };
        animeRef({
          targets: obj, x: Math.max(0, target), duration: 350, easing: 'easeOutCubic',
          update: () => { bar.scrollLeft = obj.x; },
        });
      } else {
        bar.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
      }
    });
  } catch { /* non-scrollable bars */ }
}

/** Spring entrance for overlays, sheets and dialogs (showcase-style). */
export function springIn(elm) {
  if (!elm) return;
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  } catch {}
  if (animeRef) animeRef({ targets: elm, opacity: [0, 1], scale: [0.92, 1], duration: 480, easing: SPRING, complete: () => snapStyle(elm) });
  else { elm.classList.remove('anim-spring'); elm.getBoundingClientRect(); elm.classList.add('anim-spring'); }
}

/** Pop a single element (quest complete, XP gain…). */
export function pop(elm) {
  if (!elm) return;
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  } catch {}
  if (animeRef) animeRef({ targets: elm, scale: [0.94, 1], duration: 450, easing: SPRING });
  else { elm.classList.remove('anim-pop'); elm.getBoundingClientRect(); elm.classList.add('anim-pop'); }
}

/** Animated number count-up for hero stats. */
export function countUp(elm, to, { duration = 600 } = {}) {
  if (!elm) return;
  const from = Number(elm.dataset.v || 0);
  elm.dataset.v = to;
  if (!animeRef) { elm.textContent = to; return; }
  const obj = { v: from };
  animeRef({
    targets: obj, v: to, duration, easing: 'easeOutCubic',
    update: () => { elm.textContent = Math.round(obj.v); },
  });
}

/** Showcase-style number choreography for any freshly rendered root.
 * `[data-count]` count up (staggered, suffix/decimals aware),
 * `.xp-bar[data-w]` fills, `circle[data-ring="t c"]` dash sweeps,
 * `.insight` cards rise. One call per render; reduced-motion and
 * no-anime fall back to final values instantly. Pass instant=true on
 * state-driven rerenders so zero-initialized nodes paint finals
 * without replaying the choreography. */
export function animateNumbers(root, instant = false) {
  if (!root || !root.querySelectorAll) return;
  let reduce = false;
  try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch {}
  const counts = [...root.querySelectorAll('[data-count]')];
  const bars = [...root.querySelectorAll('.xp-bar[data-w],.stat-bar[data-w],.char-stat-bar-fill[data-w]')];
  const rings = [...root.querySelectorAll('circle[data-ring]')];
  const insights = [...root.querySelectorAll('.insight')];
  const paintCount = (el) => {
    const raw = el.dataset.count;
    const to = Number(raw);
    if (!Number.isFinite(to)) { el.textContent = `${raw}${el.dataset.suffix || ''}`; return null; }
    return { to, dec: Math.min(1, (String(raw).split('.')[1] || '').length) };
  };
  if (reduce || instant || !animeRef) {
    counts.forEach((el) => {
      const p = paintCount(el);
      if (p) el.textContent = `${p.dec ? p.to.toFixed(p.dec) : Math.round(p.to)}${el.dataset.suffix || ''}`;
    });
    bars.forEach((el) => { el.style.width = `${el.dataset.w}%`; });
    rings.forEach((el) => {
      const [t, c] = String(el.dataset.ring).split(' ');
      el.setAttribute('stroke-dasharray', `${t} ${c}`);
    });
    return;
  }
  counts.forEach((el, i) => {
    const p = paintCount(el);
    if (!p) return;
    const o = { v: 0 };
    animeRef({
      targets: o, v: p.to, duration: 700, delay: 150 + i * 55, easing: 'easeOutCubic',
      update: () => { el.textContent = `${p.dec ? o.v.toFixed(p.dec) : Math.round(o.v)}${el.dataset.suffix || ''}`; },
    });
  });
  bars.forEach((el, i) => {
    animeRef({ targets: el, width: `${el.dataset.w}%`, duration: 750, delay: 150 + i * 50, easing: SPRING });
  });
  rings.forEach((el) => {
    const [t, c] = String(el.dataset.ring).split(' ').map(Number);
    if (!Number.isFinite(t) || !Number.isFinite(c)) return;
    const o = { v: 0 };
    animeRef({
      targets: o, v: t, duration: 900, delay: 150, easing: 'easeOutCubic',
      update: () => { el.setAttribute('stroke-dasharray', `${Math.round(o.v)} ${c}`); },
    });
  });
  if (insights.length) {
    animeRef({ targets: insights, opacity: [0, 1], translateY: [14, 0], duration: 380, delay: animeRef.stagger(80, { start: 100 }), easing: 'easeOutCubic' });
  }
}
