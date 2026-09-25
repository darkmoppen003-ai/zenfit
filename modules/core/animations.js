/* ── ZenFit V2 · core/animations.js ────────────────────────
   anime.js integration (Step 8): screen entrances, stagger
   reveals, swipe transitions. Graceful fallback to CSS when
   the CDN is unreachable (offline-first PWA).
────────────────────────────────────────────────────────────── */

let animeRef = null;
let loaded = false;

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

/** Animate a freshly rendered screen + stagger its cards.
 * dir: 'up' (default fade-rise), 'left' / 'right' (swipe flow),
 * 'pop' (tab/dock taps: fade + scale). */
export function animateScreenEnter(screenEl, dir = 'up') {
  if (!screenEl) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  const cards = screenEl.querySelectorAll('.card,.card-sm,.card-raised,.quest-card,.task-card,.stat-block');
  scrollTabsIntoView(screenEl);
  if (animeRef) {
    if (dir === 'pop') {
      animeRef({ targets: screenEl, opacity: [0, 1], scale: [0.97, 1], duration: 220, easing: 'easeOutCubic' });
    } else {
      const from = dir === 'left' ? [60, 0] : dir === 'right' ? [-60, 0] : [0, 0];
      const fromY = dir === 'up' ? [14, 0] : [0, 0];
      animeRef({ targets: screenEl, opacity: [0, 1], translateX: from, translateY: fromY, duration: 260, easing: 'easeOutCubic' });
    }
    if (cards.length) {
      // Above-fold cards enter with the screen; below-fold ones wait
      // for the scroll observer (no double animation, no flash).
      const visible = [...cards].filter((el) => el.getBoundingClientRect().top <= innerHeight * 0.9);
      if (visible.length) {
        animeRef({
          targets: visible, opacity: [0, 1], translateY: [10, 0],
          duration: 300, delay: animeRef.stagger(35, { start: 60 }), easing: 'easeOutCubic',
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
              duration: 480, easing: 'easeOutBack(1.4)',
            });
          } else {
            el.classList.add('anim-fadein');
          }
        });
      }, { root: null, rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    }
    (root || document).querySelectorAll('.card,.card-sm,.card-raised,.quest-card,.task-card,.stat-block,.plan-card,.bonus-card').forEach((el) => {
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

/** Pop a single element (quest complete, XP gain…). */
export function pop(elm) {
  if (!elm) return;
  if (animeRef) animeRef({ targets: elm, scale: [1, 1.06, 1], duration: 240, easing: 'easeOutBack' });
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
