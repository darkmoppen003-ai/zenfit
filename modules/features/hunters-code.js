/* ── ZenFit V2 · features/hunters-code.js ───────────────────
   The Hunter's Code — mandatory first-entry rules screen.

   Startup priority 1 (see modules/app.js): this screen blocks the
   app until the user accepts or rejects. The update panel (2) and
   the guided tour (3) only start after it resolves.

   Acceptance is versioned: `hunterCodeVersion` stores which rules
   revision the user acknowledged, so a deliberately revised rules
   set can ask for acknowledgement again — without touching any
   earned progress, onboarding state or account data.

   ponytail: no second save system — acceptance rides on the normal
   store (update + flushSave), exactly like every other datum.
   ────────────────────────────────────────────────────────────── */
import { S, update, flushSave } from '../core/store.js';

/* Bump when the rules copy changes materially — every user must
   accept the new revision before the app opens again. */
export const HUNTER_CODE_VERSION = 1;

/* Bundled artwork (see assets/intro/CREDITS.md for the source and
   its rights status). Local file, never a runtime hotlink. */
export const HUNTER_CODE_ART = './assets/intro/hunters-code.png';

const ART_ALT = '';

/* The rules. Every mechanical claim here is verified against the
   real implementation — see rules.md §33. */
export const HUNTER_CODE_RULES = [
  {
    n: '01',
    code: 'ACTION HAS CONSEQUENCES',
    headline: 'Your actions shape your progression.',
    body: 'On a non-rest day, four or fewer daily quests done costs 100 XP, never a level. Keep moving.',
  },
  {
    n: '02',
    code: 'REST IS PART OF THE PLAN',
    headline: 'Recovery is not failure.',
    body: 'Sundays and your configured rest days are protected. Rest never triggers an inactivity penalty. Recover, then return.',
  },
  {
    n: '03',
    code: 'STREAK BOOST',
    headline: 'Consistency strengthens your progress.',
    body: 'Your activity XP grows with the Streak Boost. Choose the activities that count, then find the logic in Analytics \u2192 Gamification.',
  },
  {
    n: '04',
    code: 'FAILURE IS ACCEPTED. QUITTING IS NOT.',
    headline: 'Progress is built by returning.',
    body: 'You will miss goals. That is part of the process. Learn from setbacks, adjust, and come back \u2014 returning is what counts.',
  },
  {
    n: '05',
    code: 'YOUR JOURNEY IS YOURS',
    headline: 'Build a system that fits you.',
    body: 'Choose the habits, activities and routines that support your goals, and make the System work for your life.',
  },
];

/**
 * Pure gate — has the current rules revision been acknowledged?
 * (state, version) → boolean. Unit-tested in tests/hunters-code.test.mjs
 */
export function huntersCodeAccepted(state, version = HUNTER_CODE_VERSION) {
  const s = state || {};
  return s.hunterCodeAccepted === true && Number(s.hunterCodeVersion) >= Number(version);
}

/* ── Screen ────────────────────────────────────────────────── */

function rulesHTML() {
  return HUNTER_CODE_RULES.map((r) => `
    <li class="hc-rule">
      <span class="hc-num" aria-hidden="true">${r.n}</span>
      <div class="hc-rule-body">
        <h2 class="hc-rule-code"><span class="hc-sr">Rule ${r.n} \u2014 </span>${r.code}</h2>
        <p class="hc-rule-head">${r.headline}</p>
        <p class="hc-rule-text">${r.body}</p>
      </div>
    </li>`).join('');
}

function shellHTML(inner, actions) {
  return `
  <div class="hc-layer hc-art"><img src="${HUNTER_CODE_ART}" alt="${ART_ALT}" decoding="async" fetchpriority="high"></div>
  <div class="hc-layer hc-scrim" aria-hidden="true"></div>
  <div class="hc-layer hc-grain" aria-hidden="true"></div>
  <div class="hc-layer hc-scan" aria-hidden="true"></div>
  <div class="hc-beam" aria-hidden="true"></div>
  <div class="hc-hud" aria-hidden="true">
    <i class="hc-corner hc-tl"></i><i class="hc-corner hc-tr"></i>
    <i class="hc-corner hc-bl"></i><i class="hc-corner hc-br"></i>
    <i class="hc-hair hc-hair-l"></i><i class="hc-hair hc-hair-r"></i>
  </div>
  <div class="hc-frame">
    <header class="hc-hero">
      <div class="hc-kicker">SYSTEM INITIALIZATION // REQUIRED ACKNOWLEDGEMENT</div>
      <h1 class="hc-title" id="hc-title" data-text="THE HUNTER&#39;S CODE">THE HUNTER&#39;S CODE</h1>
      <p class="hc-intro">Before you enter the System, know the rules.</p>
      <div class="hc-meta" aria-hidden="true">
        <span>RULES REVISION <b>0${HUNTER_CODE_VERSION}</b></span>
        <span>SECTOR // HUNTER-CODE</span>
        <span>STATUS // <b class="hc-warn">UNACKNOWLEDGED</b></span>
      </div>
    </header>
    <ol class="hc-rules">${rulesHTML()}</ol>
  </div>
  <div class="hc-actions">${actions}</div>`;
}

/** Locked exit state — the user declined. Same skin, no way back in. */
function exitHTML() {
  return `
  <div class="hc-layer hc-art"><img src="${HUNTER_CODE_ART}" alt="${ART_ALT}" decoding="async"></div>
  <div class="hc-layer hc-scrim hc-scrim-deep" aria-hidden="true"></div>
  <div class="hc-layer hc-grain" aria-hidden="true"></div>
  <div class="hc-layer hc-scan" aria-hidden="true"></div>
  <div class="hc-hud" aria-hidden="true">
    <i class="hc-corner hc-tl"></i><i class="hc-corner hc-tr"></i>
    <i class="hc-corner hc-bl"></i><i class="hc-corner hc-br"></i>
  </div>
  <div class="hc-frame hc-frame-center">
    <header class="hc-hero">
      <div class="hc-kicker">ACCESS DECLINED // HUNTER-CODE</div>
      <h1 class="hc-title hc-title-sm" data-text="STAND DOWN">STAND DOWN</h1>
      <p class="hc-intro">You have declined the Hunter&#39;s Code, so the System stays sealed.</p>
    </header>
    <div class="hc-exit">
      <p>Nothing was changed or deleted — your data, progress and settings are exactly as you left them.</p>
      <p>You may close this window now.</p>
    </div>
  </div>`;
}

/* ── Artwork framing ─────────────────────────────────────────
   The focal subject is found in the artwork's own pixels (local
   contrast × brightness), then mapped onto the visible crop for
   whatever viewport the app runs in. Nothing is hardcoded per
   device — the same image is framed the same way on a phone, a
   tablet or a desktop, and the subject always lands in the free
   part of the composition (beside the text column when there is
   one, in the art band when the layout stacks).
   ────────────────────────────────────────────────────────────── */

function focalSubject(img) {
  const fallback = { fx: 0.5, fy: 0.12, x1: 0.38, x2: 0.62, y1: 0.02, y2: 0.24 };
  try {
    const W = 96;
    const H = Math.max(1, Math.round(W * img.naturalHeight / img.naturalWidth));
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    const lum = new Float32Array(W * H);
    let lmax = 0;
    for (let i = 0, p = 0; p < W * H; i += 4, p++) {
      lum[p] = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      if (lum[p] > lmax) lmax = lum[p];
    }
    /* local contrast — separates the subject from flat bright haze */
    const con = new Float32Array(W * H);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        con[i] = Math.abs(lum[i + 1] - lum[i - 1]) + Math.abs(lum[i + W] - lum[i - W]);
      }
    }
    /* the bright core: weighted centroid + bounding box */
    const cut = lmax * 0.74;
    let sx = 0, sy = 0, sw = 0, x1 = W, x2 = -1, y1 = H, y2 = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (lum[i] < cut) continue;
        const w = lum[i] * (0.6 + 0.4 * Math.min(1, con[i] * 3));
        sx += (x + 0.5) * w; sy += (y + 0.5) * w; sw += w;
        if (x < x1) x1 = x; if (x > x2) x2 = x;
        if (y < y1) y1 = y; if (y > y2) y2 = y;
      }
    }
    if (!sw || x2 < x1) return fallback;
    return {
      fx: sx / sw / W, fy: sy / sw / H,
      x1: x1 / W, x2: (x2 + 1) / W, y1: y1 / H, y2: (y2 + 1) / H,
    };
  } catch {
    return fallback;
  }
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function placeSubject(root) {
  const hero = root.querySelector('.hc-hero');
  /* the mobile panel starts at the vertical centre — it needs to know
     how tall the hero above it is */
  if (hero) root.style.setProperty('--hc-hero-h', `${hero.offsetHeight}px`);
  const img = root.querySelector('.hc-art img');
  if (!img || !img.naturalWidth) return;
  const vw = img.clientWidth, vh = img.clientHeight;
  if (!vw || !vh) return;
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const base = Math.max(vw / iw, vh / ih);
  const W = iw * base, H = ih * base;          /* the cover painting */
  const s = focalSubject(img);

  /* where the composition wants the subject: the free column when the
     text sits in one, the art band when the layout stacks (the CSS
     decides which — the frame fills the width when it stacks) */
  const frame = root.querySelector('.hc-frame');
  const f = frame.getBoundingClientRect();
  const gapL = f.left, gapR = vw - f.right;
  const stacked = f.width >= vw - 2;
  let tx = stacked ? vw / 2 : (gapL > gapR ? gapL / 2 : f.right + gapR / 2);
  let ty = stacked ? s.fy * H : 0.22 * vh;   /* stacked: keep the crop */

  /* the crop alone can only slide the subject so far — a zoom buys the
     rest. Solve each axis for the position and the zoom it needs. */
  const axis = (q, over, size, target) => {
    const lo = Math.max(0, q - over), hi = Math.min(size, q);
    if (target >= lo && target <= hi) return { e: target, z: 1 };
    const e = target < lo ? lo : hi;
    const z2 = size - e > 0 ? (size - target) / (size - e) : 0;
    return { e, z: Math.max(target / e, z2) };
  };
  let ax = { e: 0, z: 1 }, ay = { e: 0, z: 1 }, zoom = 1;
  for (let i = 0; i < 3; i++) {
    ax = axis(s.fx * W, W - vw, vw, tx);
    ay = axis(s.fy * H, H - vh, vh, ty);
    zoom = clamp(Math.max(ax.z, ay.z), 1, 3);
    /* never let the subject leave the screen, even when the target
       hugs an edge */
    const hw = (s.x2 - s.x1) * W * zoom / 2;
    const hh = (s.y2 - s.y1) * H * zoom / 2;
    tx = clamp(tx, hw, Math.max(hw, vw - hw));
    ty = clamp(ty, hh, Math.max(hh, vh - hh));
  }
  ax = axis(s.fx * W, W - vw, vw, tx);
  ay = axis(s.fy * H, H - vh, vh, ty);
  zoom = clamp(Math.max(ax.z, ay.z), 1, 3);
  const cropL = ax.e - s.fx * W, cropT = ay.e - s.fy * H;
  const px = W > vw ? clamp01(-cropL / (W - vw)) : 0;
  const py = H > vh ? clamp01(-cropT / (H - vh)) : 0;
  img.style.objectPosition = `${(px * 100).toFixed(2)}% ${(py * 100).toFixed(2)}%`;

  /* zoom the crop about the element origin, then slide it so the
     subject lands exactly on the target */
  const ox = tx - zoom * ax.e, oy = ty - zoom * ay.e;
  img.style.transformOrigin = '0 0';
  img.style.transform = `translate(${ox.toFixed(1)}px, ${oy.toFixed(1)}px) scale(${zoom.toFixed(3)})`;

  /* the subject's box on screen (after crop, zoom and slide) */
  const bx0 = tx + zoom * (cropL + s.x1 * W - ax.e);
  const bx1 = tx + zoom * (cropL + s.x2 * W - ax.e);
  const by0 = ty + zoom * (cropT + s.y1 * H - ay.e);
  const by1 = ty + zoom * (cropT + s.y2 * H - ay.e);
  const sx = tx, sy = ty;

  /* the scrim clears around the subject: the mask follows it */
  const pad = Math.min(vw, vh) * 0.11;
  root.style.setProperty('--hc-sx', `${(sx / vw * 100).toFixed(2)}%`);
  root.style.setProperty('--hc-sy', `${(sy / vh * 100).toFixed(2)}%`);
  root.style.setProperty('--hc-mw', `${((bx1 - bx0) / 2 + pad).toFixed(0)}px`);
  root.style.setProperty('--hc-mh', `${((by1 - by0) / 2 + pad).toFixed(0)}px`);
  root.dataset.hcSubject = `${(sx / vw).toFixed(3)},${(sy / vh).toFixed(3)}`;
  root.dataset.hcFocal = `${s.fx.toFixed(3)},${s.fy.toFixed(3)},${s.x1.toFixed(3)},${s.x2.toFixed(3)},${s.y1.toFixed(3)},${s.y2.toFixed(3)}`;
  root.dataset.hcZoom = zoom.toFixed(3);
  root.dataset.hcSubjectBox = [bx0, by0, bx1, by1].map((v) => Math.round(v)).join(',');
}

/* Re-frame on resize / rotation — the crop changes with the viewport. */
function watchSubject(root) {
  let raf = 0;
  const reflow = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => placeSubject(root));
  };
  window.addEventListener('resize', reflow);
  window.addEventListener('orientationchange', reflow);
  root.querySelector('.hc-art img')?.addEventListener('load', () => placeSubject(root), { once: true });
  reflow();
}

function mount(html) {
  const root = document.createElement('div');
  root.id = 'zf-hunters-code';
  root.className = 'hc-root';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = html;
  document.body.appendChild(root);
  document.body.classList.add('hc-locked');
  document.documentElement.classList.add('hc-locked');
  // The dashboard behind must not be reachable: no pointer, no focus.
  document.querySelector('.app')?.setAttribute('inert', '');
  document.getElementById('bottom-nav')?.setAttribute('inert', '');
  watchSubject(root);
  return root;
}

function unmount(root) {
  root?.remove();
  document.body.classList.remove('hc-locked');
  document.documentElement.classList.remove('hc-locked');
  document.querySelector('.app')?.removeAttribute('inert');
  document.getElementById('bottom-nav')?.removeAttribute('inert');
}

/** Tab cycles inside the screen; Escape never dismisses it. */
function trapFocus(root) {
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); return; }
    if (e.key !== 'Tab') return;
    const focusables = [...root.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

/* ── Public API ───────────────────────────────────────────── */

/**
 * Show the rules screen when the current revision is not acknowledged.
 * Resolves true when accepted, false when the user declined.
 */
export function maybeHuntersCode() {
  if (huntersCodeAccepted(S)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const actions = `
      <button class="btn hc-btn hc-btn-go" id="hc-accept" type="button">ACCEPT \u2014 ENTER THE SYSTEM</button>
      <button class="btn hc-btn hc-btn-stop" id="hc-reject" type="button">REJECT \u2014 EXIT</button>`;
    const root = mount(shellHTML('', actions));
    trapFocus(root);
    requestAnimationFrame(() => {
      root.classList.add('hc-booting');
      try { root.querySelector('#hc-accept')?.focus({ preventScroll: true }); } catch {}
    });

    root.querySelector('#hc-accept')?.addEventListener('click', () => {
      update((s) => {
        s.hunterCodeAccepted = true;
        s.hunterCodeVersion = HUNTER_CODE_VERSION;
      }, { silent: true });
      flushSave();               // acceptance survives an instant reload
      root.classList.add('hc-leaving');
      setTimeout(() => { unmount(root); resolve(true); }, 220);
    });

    root.querySelector('#hc-reject')?.addEventListener('click', () => {
      // The host may refuse to close a window it did not open. If the
      // close does not happen, seal the app behind a locked exit screen.
      // A closed window destroys this context — the timer below never
      // runs, so the exit screen only ever appears when the close failed.
      let gone = false;
      window.addEventListener('pagehide', () => { gone = true; }, { once: true });
      try { window.close(); } catch {}
      setTimeout(() => {
        if (gone) return;
        root.innerHTML = exitHTML();
        root.classList.remove('hc-booting');
        root.classList.add('hc-exited');
      }, 400);
    });
  });
}
