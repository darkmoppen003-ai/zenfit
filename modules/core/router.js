/* ── ZenFit V2 · core/router.js ────────────────────────────
   Registry-driven navigation. ADDING A SCREEN = 1 line:
     { id:'sleep', label:'Sleep', icon:'😴', render: renderSleep }
   in the SCREENS array below (+ import). Dashboard opens first —
   the V1 orb/home screen is intentionally gone (Step 7).
   Hash routing (#/nutrition) → deep-linkable. In-app moves use
   replaceState (no tab history): system back never walks tabs —
   first back arms exit, second back exits the app.
────────────────────────────────────────────────────────────── */
import { S } from './store.js';
import { sfx, ICONS, showNotif } from './ui.js';
import { animateScreenEnter } from './animations.js';
import { renderDashboard } from '../features/dashboard.js';
import { renderNutrition } from '../features/nutrition.js';
import { renderWater } from '../features/water.js';
import { renderWorkout } from '../features/workout.js';
import { renderHabits } from '../features/habits.js';
import { renderTasks } from '../features/tasks.js';
import { renderMind } from '../features/zen.js';
import { renderQuests } from '../features/quests.js';
import { renderAnalytics } from '../features/analytics.js';
import { renderLeaderboard } from '../features/leaderboard.js';
import { renderProfile } from '../features/profile.js';
import { renderCustomization } from '../features/customization.js';
import { renderAdmin } from '../features/admin.js';
import { renderAchievements } from '../features/achievements-screen.js';
import { renderInbox } from '../features/inbox.js';

export const SCREENS = [
  { id: 'dashboard', label: 'Dashboard', icon: '&#9783;', render: renderDashboard },
  { id: 'nutrition', label: 'Nutrition', icon: '&#127869;', render: renderNutrition },
  { id: 'water', label: 'Water', icon: '&#128167;', render: renderWater },
  { id: 'workout', label: 'Workout', icon: '&#127947;', render: renderWorkout },
  { id: 'habits', label: 'Habits', icon: '&#9745;', render: renderHabits },
  { id: 'tasks', label: 'Tasks', icon: '&#128203;', render: renderTasks },
  { id: 'mind', label: 'Mind', icon: '&#129496;', render: renderMind },
  { id: 'quests', label: 'Quests', icon: '&#11088;', render: renderQuests },
  { id: 'analytics', label: 'Analytics', icon: '&#128200;', render: renderAnalytics },
  { id: 'leaderboard', label: 'Leaderboard', icon: '&#127942;', render: renderLeaderboard },
  { id: 'profile', label: 'Profile', icon: '&#128100;', render: renderProfile },
  { id: 'customization', label: 'Customization', icon: '&#9881;', render: renderCustomization },
  // Admin + achievements + inbox are hidden: no nav entry.
  { id: 'admin', label: 'Admin', icon: '&#128737;', render: renderAdmin, hidden: true },
  { id: 'achievements', label: 'Achievements', icon: '&#127942;', render: renderAchievements, hidden: true },
  { id: 'inbox', label: 'Inbox', icon: ICONS.inbox, render: renderInbox, hidden: true },
];

/* Bottom-dock icons stay SVG line-art (V1 bottom dock parity) */
const DOCK_ICONS = {
  dashboard: ICONS.dashboard, nutrition: ICONS.nutrition, workout: ICONS.workout,
  habits: ICONS.habits, analytics: ICONS.analytics, water: ICONS.water,
  quests: ICONS.quests, tasks: ICONS.tasks, mind: ICONS.mind,
  leaderboard: ICONS.leaderboard, profile: ICONS.profile, customization: ICONS.customization,
  inbox: ICONS.inbox,
};

/* V1 bottom-dock defaults */
const DEFAULT_DOCK = ['dashboard', 'nutrition', 'workout', 'habits', 'analytics'];

export const screenById = (id) => SCREENS.find((s) => s.id === id) || SCREENS[0];

let currentScreen = 'dashboard';
let currentSub = null;
export const getCurrent = () => ({ screen: currentScreen, sub: currentSub });

/** Navigate. sub = per-screen tab.
 * dir: 'pop' for taps (default), 'left'/'right' for swipes. */
export function switchScreen(id, sub = null, dir = 'pop') {
  closeMorePopover();
  const target = screenById(id);
  if (target.id !== currentScreen) sfx('nav');
  currentScreen = target.id;
  currentSub = sub;
  if (location.hash !== `#/${target.id}`) history.replaceState(null, '', `#/${target.id}`);
  renderActive(dir);
}

/** Re-render current screen (called on state changes via store.subscribe). */
export function renderActive(dir = 'up') {
  const host = document.getElementById('screens');
  if (!host) return;
  host.innerHTML = '';
  const target = screenById(currentScreen);
  const d = document.createElement('div');
  d.className = 'screen active';
  d.id = `screen-${target.id}`;
  host.appendChild(d);
  try { target.render(d, currentSub); } catch (e) {
    console.warn('[ZenFit] render failed:', target.id, e);
    d.innerHTML = `<div class="card">Couldn't load ${target.id}. <button class="btn btn-sm" onclick="location.reload()">Retry</button></div>`;
  }
  // V1-exact per-screen header: icon + Syne title, injected first.
  if (target && !d.querySelector(':scope > .screen-header')) {
    const hdr = document.createElement('div');
    hdr.className = 'screen-header';
    hdr.innerHTML = `<span class="sh-icon">${target.icon}</span><div class="sh-title">${target.label}</div>`;
    d.insertBefore(hdr, d.firstChild);
  }
  renderBottomNav();
  animateScreenEnter(d, dir);
  // Keep wallpaper-per-screen in sync
  if (window.ZF?.applyBg) window.ZF.applyBg();
}

/* NOTE: V1 removed the top navigation bar — the bottom dock is the
   only navigation. renderTopNav intentionally does not exist. */

function visibleTabs() {
  const ids = S.customBottomNav?.length ? S.customBottomNav : DEFAULT_DOCK;
  return ids.map(screenById).filter((t) => t && !t.hidden);
}

function renderBottomNav() {
  let bar = document.getElementById('bottom-nav');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'bottom-nav'; bar.className = 'bottom-nav';
    document.body.appendChild(bar);
  }
  bar.style.display = 'flex';
  document.body.classList.toggle('nav-labels-off', S.navLabels === false);
  const tabs = visibleTabs();
  const overflow = SCREENS.filter((s) => !s.hidden && !tabs.some((t) => t.id === s.id));
  const overflowActive = overflow.some((s) => s.id === currentScreen);
  bar.innerHTML = tabs.map((t) =>
    `<div class="bottom-nav-item${currentScreen === t.id ? ' active' : ''}" data-bnav="${t.id}">
      <span class="bni-icon">${DOCK_ICONS[t.id] || t.icon}</span><span class="bni-label">${t.label}</span></div>`).join('') +
    `<div class="bottom-nav-item${overflowActive ? ' active' : ''}" data-bnav="__more" title="More" style="position:relative">
      <span class="bni-icon">${ICONS.more}</span><span class="bni-label">More</span>${(S.inboxUnread || 0) > 0 ? '<span class="nav-dot" style="position:absolute;top:4px;right:8px;width:9px;height:9px;border-radius:50%;background:var(--danger);border:2px solid var(--bg-base)"></span>' : ''}</div>`;
  bar.querySelectorAll('[data-bnav]').forEach((b) => {
    b.onclick = (e) => {
      if (b.dataset.bnav === '__more') { e.stopPropagation(); toggleMorePopover(); return; }
      closeMorePopover();
      switchScreen(b.dataset.bnav);
    };
  });
  let pop = document.getElementById('more-popover');
  if (!pop) { pop = document.createElement('div'); pop.id = 'more-popover'; pop.className = 'more-popover'; document.body.appendChild(pop); }
  pop.innerHTML = overflow.map((t) =>
    `<div class="mp-item${currentScreen === t.id ? ' active-mp' : ''}" data-mp="${t.id}">
      <span class="mp-icon">${DOCK_ICONS[t.id] || t.icon}</span><span>${t.label}</span></div>`).join('') +
    `<div class="mp-item${currentScreen === 'inbox' ? ' active-mp' : ''}" data-mp="inbox" style="position:relative">
      <span class="mp-icon">${ICONS.inbox}</span><span>Inbox${(S.inbox || []).length ? ` (${S.inbox.length})` : ''}</span>${(S.inboxUnread || 0) > 0 ? '<span style="position:absolute;top:8px;right:10px;width:9px;height:9px;border-radius:50%;background:var(--danger)"></span>' : ''}</div>` +
    `<div class="mp-item" data-mp="__navedit"><span class="mp-icon">${ICONS.customization}</span><span>Nav-Edit</span></div>`;
  pop.querySelectorAll('[data-mp]').forEach((m) => {
    m.onclick = () => {
      closeMorePopover();
      if (m.dataset.mp === '__navedit') openNavEditor();
      else switchScreen(m.dataset.mp);
    };
  });
}

/* ── Nav editor overlay (V1): pick up to 6 dock tabs ── */
export function openNavEditor() {
  const all = SCREENS.filter((s) => !s.hidden);
  const current = new Set(visibleTabs().map((t) => t.id));
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.id = 'nav-editor-ov';
  const paint = () => {
    const sel = [...ov.querySelectorAll('[data-navid]')].filter((e) => e.dataset.sel === '1').map((e) => e.dataset.navid);
    ov.querySelector('#nav-sel-count').textContent = `Selected: ${sel.length}/6`;
  };
  ov.innerHTML = `<div class="overlay-box" style="max-height:85vh;overflow-y:auto;text-align:left;max-width:420px;width:94%">
    <div style="font-size:14px;font-weight:700;margin-bottom:4px">Customize Navigation Bar</div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:14px">Select up to 6 tabs. Tap to toggle.</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">
      ${all.map((o) => {
        const sel = current.has(o.id);
        return `<div data-navid="${o.id}" data-sel="${sel ? '1' : '0'}" style="padding:10px 6px;border-radius:10px;border:2px solid ${sel ? 'var(--primary)' : 'var(--border-mid)'};background:${sel ? 'var(--primary-dim)' : 'var(--bg-raised)'};text-align:center;cursor:pointer">`
          + `<div class="bni-icon" style="width:20px;height:20px;margin:0 auto 4px">${DOCK_ICONS[o.id] || ''}</div>`
          + `<div style="font-size:9px;color:${sel ? 'var(--primary)' : 'var(--text-muted)'}">${o.label}</div></div>`;
      }).join('')}
    </div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px" id="nav-sel-count"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;border:1px solid var(--border-mid);border-radius:10px;background:var(--bg-overlay);margin-bottom:14px">
      <div><div style="font-size:13px;font-weight:600">Show Labels</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Show text labels below icons</div></div>
      <label style="position:relative;display:inline-block;width:42px;height:24px;flex-shrink:0">
      <input type="checkbox" id="navedit-labels" ${S.navLabels !== false ? 'checked' : ''} style="opacity:0;width:0;height:0">
      <span style="position:absolute;top:0;left:0;right:0;bottom:0;background:${S.navLabels !== false ? 'var(--primary-dark)' : 'var(--bg-overlay)'};border-radius:24px;border:1px solid var(--border-strong)">
      <span style="position:absolute;height:18px;width:18px;left:${S.navLabels !== false ? '20px' : '3px'};bottom:2px;background:#fff;border-radius:50%"></span></span></label>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary btn-sm" style="flex:1" id="navedit-save">Save</button>
      <button class="btn btn-sm" style="flex:1" id="navedit-reset">Reset Default</button>
      <button class="btn btn-sm" style="color:var(--danger)" id="navedit-cancel">Cancel</button>
    </div></div>`;
  document.body.appendChild(ov);
  paint();
  ov.querySelectorAll('[data-navid]').forEach((elm) => {
    elm.onclick = () => {
      const isSel = elm.dataset.sel === '1';
      if (!isSel) {
        const count = [...ov.querySelectorAll('[data-navid]')].filter((e) => e.dataset.sel === '1').length;
        if (count >= 6) { window.ZF.toast('Max 6 tabs allowed', '!'); return; }
        elm.dataset.sel = '1';
        elm.style.border = '2px solid var(--primary)';
        elm.style.background = 'var(--primary-dim)';
        elm.querySelector('div:last-child').style.color = 'var(--primary)';
      } else {
        if (elm.dataset.navid === 'dashboard') { window.ZF.toast('Dashboard stays on the bar', '!'); return; }
        elm.dataset.sel = '0';
        elm.style.border = '2px solid var(--border-mid)';
        elm.style.background = 'var(--bg-raised)';
        elm.querySelector('div:last-child').style.color = 'var(--text-muted)';
      }
      paint();
    };
  });
  ov.querySelector('#navedit-labels').onchange = (e) => {
    window.ZF.update((s) => { s.navLabels = e.target.checked; }, { silent: true });
    window.ZF.save();
    window.ZF.rerender();
  };
  ov.querySelector('#navedit-save').onclick = () => {
    const sel = [...ov.querySelectorAll('[data-navid]')].filter((e) => e.dataset.sel === '1').map((e) => e.dataset.navid);
    if (!sel.includes('dashboard')) sel.unshift('dashboard');
    window.ZF.update((s) => { s.customBottomNav = sel; }, { silent: true });
    window.ZF.save();
    ov.remove();
    window.ZF.rerender();
  };
  ov.querySelector('#navedit-reset').onclick = () => {
    window.ZF.update((s) => { s.customBottomNav = []; }, { silent: true });
    window.ZF.save();
    ov.remove();
    window.ZF.rerender();
  };
  ov.querySelector('#navedit-cancel').onclick = () => ov.remove();
}

function toggleMorePopover() {
  const pop = document.getElementById('more-popover');
  if (!pop) return;
  if (pop.classList.contains('show')) { closeMorePopover(); return; }
  const bar = document.getElementById('bottom-nav');
  const r = bar.getBoundingClientRect();
  pop.style.left = `${Math.min(r.right - 210, innerWidth - 210)}px`;
  pop.style.bottom = `${innerHeight - r.top + 8}px`;
  pop.classList.add('show');
  // Close on outside tap only — taps INSIDE the popover (or on the
  // More button) must reach their click handlers. Closing on every
  // pointerdown hides the popover mid-tap on touch screens, so the
  // tap falls through to whatever is underneath.
  setTimeout(() => document.addEventListener('pointerdown', outsidePopoverCloser), 0);
}
function outsidePopoverCloser(e) {
  if (e.target.closest('#more-popover') || e.target.closest('[data-bnav="__more"]')) return;
  closeMorePopover();
}
function closeMorePopover() {
  document.getElementById('more-popover')?.classList.remove('show');
  document.removeEventListener('pointerdown', outsidePopoverCloser);
}

/* ── Swipe between screens (left/right) + system-back-to-exit ──
   No in-app history entries: first system back arms exit with a toast,
   second back within 2s exits (PWA) instead of walking tabs. */
let exitArmedUntil = 0;
export function initRouter() {
  const fromHash = () => {
    const m = location.hash.match(/^#\/([a-z]+)/);
    currentScreen = m ? screenById(m[1]).id : 'dashboard';
  };
  fromHash();
  try { history.pushState({ zfTrap: 1 }, ''); } catch {}
  window.addEventListener('popstate', () => {
    if (Date.now() < exitArmedUntil) return;
    exitArmedUntil = Date.now() + 2000;
    try { showNotif('Press back again to exit', '!'); } catch {}
    try {
      history.pushState({ zfTrap: 1 }, '');
      history.replaceState(null, '', `#/${currentScreen}`);
    } catch {}
    renderActive();
  });

  let sx = null, sy = null;
  const host = document.getElementById('screens');
  host.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });
  host.addEventListener('touchend', (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    sx = sy = null;
    if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    // Never hijack gestures that belong to a control: sliders, tab bars,
    // inputs, buttons, wallpaper frame, canvases, or marked no-swipe zones.
    if (e.target.closest('canvas,.wp-frame,input,textarea,select,button,a,.chart-tab-bar,.an-sec-bar,[data-no-swipe],.overlay,.more-popover,.bottom-nav')) return;
    const order = SCREENS.filter((s) => !s.hidden).map((s) => s.id);
    let i = order.indexOf(currentScreen);
    // Swipe left → next screen (slides in from right); swipe right → previous
    const forward = dx < 0;
    i = forward ? Math.min(order.length - 1, i + 1) : Math.max(0, i - 1);
    switchScreen(order[i], null, forward ? 'left' : 'right');
  }, { passive: true });

  renderActive();
}
