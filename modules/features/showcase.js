/* ── ZenFit V2 · features/showcase.js ──────────────────────
   Flex/stage screen: showcases the user's theme, wallpaper,
   interface style + profile card. Reads live state only —
   never writes earned data. Prefs live in S.showcase (v20).
   PNG export uses a zero-dependency DOM-snapshot renderer
   (SVG foreignObject → canvas → PNG), lazy + offline-safe.
────────────────────────────────────────────────────────────── */
import { S, update, resolveBgSrc } from '../core/store.js';
import { escapeHtml, sanitizeEnum, sanitizeText } from '../core/sanitize.js';
import { showNotif, openOverlay, collapseHeader, wireCollapsibles, ICONS } from '../core/ui.js';
import { showcaseStats, habitStreak } from '../core/selectors.js';
import { animateNumbers, springIn } from '../core/animations.js';
import { xpForLevel } from '../core/utils.js';
import { ACHIEVEMENTS, earnedIds } from '../core/achievements.js';
import { LeaderboardAPI } from '../core/cloud.js';
import { THEMES } from '../core/themes.js';

/* Extensible card-style registry — add a third entry later, no refactor. */
export const CARD_STYLES = {
  default: { name: 'Default', icon: 'styleLiquid' },
  cyber: { name: 'Cyberpunk', icon: 'styleCyber' },
  spotlight: { name: 'Spotlight', icon: 'image' },
  idcard: { name: 'ID Card', icon: 'user' },
};

/* Card templates: design snapshots (style + representation + variant +
   backdrop). Built-ins ship one per mood; every theme maps to a default
   the user can modify; "Save current" stores user snapshots. */
export const CARD_TEMPLATES = {
  default: { name: 'Default', cardStyle: 'default', cellStyle: 'number', variant: 'long', cardBackdrop: 'wallpaper' },
  cyber: { name: 'Cyberpunk', cardStyle: 'cyber', cellStyle: 'ring', variant: 'long', cardBackdrop: 'theme' },
  spotlight: { name: 'Spotlight', cardStyle: 'spotlight', cellStyle: 'bar', variant: 'long', cardBackdrop: 'wallpaper' },
  idcard: { name: 'ID Card', cardStyle: 'idcard', cellStyle: 'number', variant: 'short', cardBackdrop: 'theme' },
};
export const THEME_TEMPLATES = {
  cyberpunk: 'cyber', amoled: 'cyber', midnight: 'default',
  frost: 'default', light: 'default', brutalist: 'spotlight',
};
export function themeTemplate() {
  const key = String(S.theme || 'midnight').replace(/^custom:/, '');
  const id = THEME_TEMPLATES[key] || 'default';
  return { id, ...(CARD_TEMPLATES[id] || CARD_TEMPLATES.default) };
}
function customTemplates() {
  const arr = sc().templates;
  return Array.isArray(arr) ? arr.filter((t) => t && t.id && t.snap) : [];
}
function applyTemplateSnap(snap) {
  set({
    cardStyle: sanitizeEnum(snap.cardStyle, ['default', 'cyber', 'spotlight', 'idcard'], 'default'),
    cellStyle: sanitizeEnum(snap.cellStyle, ['number', 'bar', 'ring'], 'number'),
    variant: sanitizeEnum(snap.variant, ['short', 'long'], 'long'),
    cardBackdrop: sanitizeEnum(snap.cardBackdrop, ['wallpaper', 'theme'], 'wallpaper'),
  });
  window.ZF.save();
}

let __globalRank = null;
let __globalRankTried = false;
let __cleanup = null;
/* Studio sheet state survives rerenders (toggles rebuild the screen). */
let sheetOpen = false;
function outsideSheetCloser(e) {
  if (e.target.closest?.('#sc-sheet') || e.target.closest?.('#sc-gear')) return;
  setSheet(false);
}
function consumeSheetBack() {
  const el = document.getElementById('sc-sheet');
  if (!el || !el.isConnected || el.style.display !== 'block') {
    if (window.ZF?.consumeBack === consumeSheetBack) window.ZF.consumeBack = null;
    return false;
  }
  setSheet(false);
  return true;
}
/* Sheet closes ONLY via: close button, outside tap, or back press. */
function setSheet(open) {
  sheetOpen = open;
  const el = document.getElementById('sc-sheet');
  if (el) el.style.display = open ? 'block' : 'none';
  const gear = document.getElementById('sc-gear');
  if (open) {
    // ponytail: gear yields while the sheet is up — no overlap fight at any size
    if (gear) { gear.style.opacity = '0'; gear.style.pointerEvents = 'none'; }
    try { history.pushState({ scSheet: 1 }, ''); } catch {}
    try { if (window.ZF) window.ZF.consumeBack = consumeSheetBack; } catch {}
    document.addEventListener('pointerdown', outsideSheetCloser);
  } else {
    if (window.ZF?.consumeBack === consumeSheetBack) window.ZF.consumeBack = null;
    document.removeEventListener('pointerdown', outsideSheetCloser);
    if (gear && gear.isConnected) {
      gear.style.opacity = '1';
      gear.style.pointerEvents = 'auto';
      gear.style.transform = 'scale(1)';
    }
  }
}
/* Gear floats above the nav pill on any device: phones get bottom-above-pill,
   desktop right-dock gets left-of-dock. Measured live, never hardcoded. */
function positionGear() {
  try {
    const gear = document.getElementById('sc-gear');
    const bar = document.getElementById('bottom-nav');
    if (!gear || !bar || !gear.isConnected) return;
    const r = bar.getBoundingClientRect();
    if (!r.width && !r.height) return;
    if (bar.classList.contains('dock-all')) {
      gear.style.bottom = 'auto';
      gear.style.top = `${Math.max(12, Math.round(r.top + r.height / 2 - 24))}px`;
      gear.style.right = `${Math.max(12, Math.round(innerWidth - r.left + 12))}px`;
    } else {
      gear.style.top = 'auto';
      gear.style.right = '16px';
      gear.style.bottom = `${Math.max(12, Math.round(innerHeight - r.top + 12))}px`;
    }
  } catch {}
}

function sc() {
  const d = (S.showcase && typeof S.showcase === 'object') ? S.showcase : {};
  const dv = { showHeader: true, showCard: true, variant: 'long', showWallpaper: true, cardStyle: 'default', cardBackdrop: 'wallpaper', cellStyle: 'number', order: null, bio: '', visible: {} };
  const visD = { streak: true, level: true, rank: true, globalRank: true, xp: true, strength: true, endurance: true, discipline: true, health: true, wisdom: true, achCount: true, workouts: true, steps: true, study: true, water: true, habits: true, habitStreak: true, consistency: true, bio: true };
  return { ...dv, ...d, visible: { ...visD, ...((d.visible) || {}) } };
}
function set(patch) {
  update((s) => { s.showcase = { ...sc(), ...patch, visible: { ...sc().visible, ...((patch.visible) || {}) } }; });
}
function setVis(key, val) {
  update((s) => {
    const cur = sc();
    s.showcase = { ...cur, visible: { ...cur.visible, [key]: val } };
  });
}

const RANK_COLORS = { E: '#888', D: '#4cdb8a', C: '#4a9eff', B: '#c084fc', A: '#f5a623', S: '#ff5a5a' };
const STAT_DEFS = [
  { key: 'strength', icon: 'swords', label: 'Strength' },
  { key: 'endurance', icon: 'steps', label: 'Endurance' },
  { key: 'discipline', icon: 'mindCyber', label: 'Discipline' },
  { key: 'health', icon: 'heart', label: 'Health' },
  { key: 'wisdom', icon: 'book', label: 'Wisdom' },
];
const VIS_DEFS = [
  ['streak', 'Streak'], ['level', 'Level'], ['rank', 'Rank'], ['globalRank', 'Global rank'],
  ['xp', 'XP'], ['strength', 'Strength'], ['endurance', 'Endurance'], ['discipline', 'Discipline'],
  ['health', 'Health'], ['wisdom', 'Wisdom'], ['achCount', 'Achievements'],
  ['workouts', 'Workouts'], ['steps', 'Steps'], ['study', 'Study'], ['water', 'Water'],
  ['habits', 'Habits done'], ['habitStreak', 'Habit streak'], ['consistency', 'Consistency'],
  ['bio', 'Bio / quote'],
];
/* Canonical cell order for the card grid (DOM + export share it). Users
   reorder via cfg.order; movers clamp so cells never leave the grid. */
const GRID_KEYS = ['streak', 'globalRank', 'achCount', 'strength', 'endurance', 'discipline', 'health', 'wisdom', 'workouts', 'steps', 'study', 'water', 'habits', 'habitStreak', 'consistency'];
const MORE_DEFS = [
  { key: 'workouts', icon: 'dumbbell', label: 'Workouts', pct: null },
  { key: 'steps', icon: 'footprintFill', label: 'Steps', pct: null },
  { key: 'study', icon: 'bookStack', label: 'Study', pct: null, fmt: (v) => `${v}m` },
  { key: 'water', icon: 'drop', label: 'Water', pct: (st) => st.water, fmt: (v) => `${v}%` },
  { key: 'habits', icon: 'checkSquare', label: 'Habits', pct: (st) => st.habitsTotal ? Math.round((st.habitsDone / st.habitsTotal) * 100) : null, fmt: (v, st) => `${st.habitsDone || 0}/${st.habitsTotal || 0}` },
  { key: 'habitStreak', icon: 'flame', label: 'Habit streak', pct: null, fmt: (v) => `${v}d` },
  { key: 'consistency', icon: 'target', label: 'Consistency', pct: (st) => st.consistency, fmt: (v) => `${v}%` },
];
function gridOrder(cfg) {
  const base = GRID_KEYS.slice();
  const cur = Array.isArray(cfg.order) ? cfg.order.filter((x) => base.includes(x)) : [];
  base.forEach((x) => { if (!cur.includes(x)) cur.push(x); });
  return cur;
}
/* One descriptor per visible grid cell, in user order. */
function gridCells(st, v, cfg, grank, achN, achPct) {
  const out = [];
  for (const key of gridOrder(cfg)) {
    if (!v[key]) continue;
    if (key === 'streak') out.push({ key, icon: 'flame', label: 'Streak', val: String(bestStreak()), pct: null });
    else if (key === 'globalRank') out.push({ key, icon: 'globe', label: 'Global', val: grank, pct: null, custom: true });
    else if (key === 'achCount') out.push({ key, icon: 'medal', label: `${achN}/${ACHIEVEMENTS.length}`, val: String(achN), pct: achPct });
    else if (STAT_DEFS.some((d) => d.key === key)) {
      const d = STAT_DEFS.find((x) => x.key === key);
      const raw = st[key] ?? 10;
      out.push({ key, icon: d.icon, label: d.label, val: String(raw), pct: Math.min(100, Math.max(0, Math.round(raw))) });
    } else {
      const d = MORE_DEFS.find((x) => x.key === key);
      if (!d) continue;
      const raw = st[key] ?? 0;
      out.push({ key, icon: d.icon, label: d.label, val: d.fmt ? d.fmt(raw, st) : String(raw), pct: d.pct ? d.pct(st) : null });
    }
  }
  return out;
}

function bestStreak() {
  try {
    return (S.habits || []).reduce((a, h) => Math.max(a, h.streak || habitStreak(h) || 0), 0);
  } catch { return 0; }
}

/* Bio/quote line: shown only when the user wrote one (and left it enabled).
   Stored sanitized (maxlength 140); rendered escaped; canvas fillText is
   code-inert by construction. */
function bioText(cfg) {
  const t = String(cfg.bio || '').trim();
  if (!t || cfg.visible?.bio === false) return '';
  return t.slice(0, 140);
}

function avatarHTML(size = 64) {
  const name = S.profile?.name || S.player?.name || 'Hunter';
  const init = escapeHtml(((name[0] || 'H').toUpperCase()));
  if (S.profilePic) return `<img src="${S.profilePic}" alt="" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:2px solid var(--primary);flex-shrink:0">`;
  return `<span style="width:${size}px;height:${size}px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:${Math.round(size * 0.4)}px;font-family:var(--font-display);background:var(--primary-dim);color:var(--primary);border:2px solid var(--primary)">${init}</span>`;
}

function statCell(iconName, label, value, pct, style) {
  const glyph = `<div style="width:20px;height:20px;margin:0 auto 4px;color:var(--primary)">${ICONS[iconName] || ''}</div>`;
  const num = `<div class="sc-num" data-count="${value}" style="font-size:18px;font-weight:800;font-family:var(--font-display)">0</div>`;
  let extra = '';
  if (style === 'bar' && pct != null) {
    extra = `<div class="xp-bar-wrap mt8" style="height:6px"><div class="xp-bar" data-w="${Math.round(pct)}" style="width:0%"></div></div>`;
  } else if (style === 'ring' && pct != null) {
    const r = 13, c = 2 * Math.PI * r, t = c * Math.min(1, Math.max(0, pct / 100));
    return `<div class="card-sm sc-stat" style="text-align:center;padding:10px 6px">${glyph}`
      + `<svg width="44" height="44" viewBox="0 0 32 32" style="transform:rotate(-90deg);display:block;margin:0 auto">`
      + `<circle cx="16" cy="16" r="${r}" fill="none" stroke="var(--bg-overlay)" stroke-width="4"/>`
      + `<circle cx="16" cy="16" r="${r}" fill="none" stroke="var(--primary)" stroke-width="4" stroke-linecap="round" stroke-dasharray="0 ${c.toFixed(1)}" data-ring="${t.toFixed(1)} ${c.toFixed(1)}"/></svg>`
      + `<div class="sc-num" data-count="${value}" style="font-size:13px;font-weight:800;font-family:var(--font-display)">0</div>`
      + `<div style="font-size:10px;color:var(--text-muted)">${label}</div></div>`;
  }
  return `<div class="card-sm sc-stat" style="text-align:center;padding:10px 6px">${glyph}${num}`
    + `<div style="font-size:10px;color:var(--text-muted)">${label}</div>${extra}</div>`;
}

/* PNG renderer: hand-drawn canvas (no new deps). The SVG-foreignObject
   snapshot approach was dropped — it renders without page CSS, so the
   export came out as bare text. Canvas draws the real card: theme
   colors, avatar, XP bar, stat grid, wallpaper backdrop. Remote-https
   artwork is skipped (canvas taint) with a theme-wash fallback. */
function cssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch { return fallback; }
}
function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function loadImg(src) {
  return new Promise((resolve) => {
    if (!src || (/^https?:/i.test(src) && !src.startsWith(location.origin))) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
function drawCover(g, img, x, y, w, h) {
  const ir = img.naturalWidth / Math.max(1, img.naturalHeight);
  const r = w / h;
  let sw, sh, sx, sy;
  if (ir > r) { sh = img.naturalHeight; sw = sh * r; sx = (img.naturalWidth - sw) / 2; sy = 0; }
  else { sw = img.naturalWidth; sh = sw / r; sx = 0; sy = (img.naturalHeight - sh) / 2; }
  g.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}
const DISP = `'Syne','Inter',system-ui,sans-serif`;

/* Card chrome, single-sourced from the skin tokens (mirrors css/skins/* +
   --radius-*: liquid 14 / brutalist 4 / hud 3 + 12px cuts / neomorph 20,
   cells liquid 12 / brutalist 4, cyber cuts 18). Export measures the live
   preview card width and scales these DOM px into canvas units, so preview
   and export cannot drift apart. */
const SKIN_PX = {
  liquid: { r: 14, cell: 12, clip: 0 },
  brutalist: { r: 4, cell: 4, clip: 0 },
  hud: { r: 3, cell: 8, clip: 12 },
  neomorph: { r: 20, cell: 12, clip: 0 },
};
let __pxk = 2;
function skinK() {
  try {
    const w = document.querySelector('#sc-export-short')?.getBoundingClientRect().width || 0;
    if (w > 50) __pxk = 720 / w;
  } catch {}
  return __pxk;
}
function cardPath(g, dx, dy, W, H, style, cyberClip) {
  const px = SKIN_PX[style] || SKIN_PX.liquid;
  const cut = (cyberClip ? 18 : px.clip) * __pxk;
  if (cut > 0) {
    g.beginPath();
    g.moveTo(dx + cut, dy);
    g.lineTo(dx + W, dy);
    g.lineTo(dx + W, dy + H - cut);
    g.lineTo(dx + W - cut, dy + H);
    g.lineTo(dx, dy + H);
    g.lineTo(dx, dy + cut);
    g.closePath();
    return 0;
  }
  const r = px.r * __pxk;
  rr(g, dx, dy, W, H, r);
  return r;
}
/* Paints the profile card at (dx,dy) width W. Returns painted height. */
async function paintCard(g, dx, dy, W, cfg, st, v, grank) {
  const cyber = cfg.cardStyle === 'cyber';
  const style = S.uiStyle || 'liquid';
  const k = skinK();
  const px = SKIN_PX[style] || SKIN_PX.liquid;
  const glass = !!S.glassMode;
  const galpha = Math.min(0.95, Math.max(0.1, S.glassAlpha ?? 0.55));
  const surf = cssVar('--bg-surface', '#0f1118');
  const raised = cssVar('--bg-raised', '#171b28');
  const overlayC = cssVar('--bg-overlay', 'rgba(255,255,255,0.08)');
  const prim = cssVar('--primary', '#7b5eff');
  const primDim = cssVar('--primary-dim', '#3a2099');
  const succ = cssVar('--success', '#22d98a');
  const tPri = cssVar('--text-primary', '#ffffff');
  const tSec = cssVar('--text-secondary', '#c9cede');
  const tMut = cssVar('--text-muted', 'rgba(255,255,255,0.45)');
  const bMid = cssVar('--border-mid', '#2a3050');
  const rankC = RANK_COLORS[st.rank] || '#888';
  const pad = 36;
  const cw = W - pad * 2;
  let y = dy + pad;

  // Backdrop: wallpaper bitmap (same-origin only) or theme wash.
  let wpImg = null;
  if (cfg.cardBackdrop === 'wallpaper' && S.bgImage) {
    try { wpImg = await loadImg(await resolveBgSrc(S.bgImage)); } catch { wpImg = null; }
  }
  // Measure first: fixed layout, so paint bg in a second pass.
  const av = 116;
  const isSpot = cfg.cardStyle === 'spotlight';
  const isID = cfg.cardStyle === 'idcard';
  // Primary image (user pic, front/focused) vs secondary (wallpaper back).
  // Spotlight: full-bleed hero art; ID: framed photo box + data rows + stamp.
  const topH = isSpot ? 300 : isID ? 236 : av + 8;
  const barH = 16;
  const cells = [];
  const achN = earnedIds().size;
  const achPct = Math.round((achN / ACHIEVEMENTS.length) * 100);
  if (cfg.variant === 'long') {
    for (const c of gridCells(st, v, cfg, grank, achN, achPct)) {
      cells.push({ label: c.label, val: c.val, pct: c.pct });
    }
  }
  const gap = 16;
  const cols = 3;
  const cellW = (cw - gap * (cols - 1)) / cols;
  const cellH = cfg.cellStyle === 'ring' ? 168 : 118;
  const rows = Math.ceil(cells.length / cols);
  const gridH = rows ? rows * cellH + (rows - 1) * gap + 16 : 0;
  const headH = cfg.showHeader ? 128 : 0;
  const bio = cfg.variant === 'long' ? bioText(cfg) : '';
  const bioH = bio ? 36 : 0;
  const footH = cfg.variant === 'long' ? 40 : (bioText(cfg) ? 78 : 44);
  const cardH = pad + headH + topH + bioH + 18 + barH + 16 + gridH + footH + pad;
  const cellR = (px.cell) * k;

  g.save();
  // Brutalist hard offset shadow sits behind the card (pre-clip).
  if (style === 'brutalist') {
    g.fillStyle = '#000';
    cardPath(g, dx + 4 * k, dy + 4 * k, W, cardH, style, cyber);
    g.fill();
  }
  // Neomorph soft depth behind the card (pre-clip).
  if (style === 'neomorph') {
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 34; g.shadowOffsetY = 10;
    g.fillStyle = surf;
    cardPath(g, dx, dy, W, cardH, style, cyber);
    g.fill();
    g.restore();
  }
  cardPath(g, dx, dy, W, cardH, style, cyber);
  g.clip();
  if (glass && wpImg) {
    drawCover(g, wpImg, dx, dy, W, cardH);
    g.globalAlpha = galpha;
    g.fillStyle = surf;
    g.fillRect(dx, dy, W, cardH);
    g.globalAlpha = 1;
  } else {
    g.fillStyle = surf;
    g.fillRect(dx, dy, W, cardH);
  }
  if (wpImg && !glass) {
    drawCover(g, wpImg, dx, dy, W, cardH);
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(dx, dy, W, cardH);
  } else if (cyber && !wpImg) {
    g.fillStyle = 'rgba(255,255,255,0.03)';
    for (let i = -cardH; i < W; i += 28) {
      g.beginPath(); g.moveTo(dx + i, dy + cardH); g.lineTo(dx + i + cardH, dy); g.lineTo(dx + i + cardH + 10, dy); g.lineTo(dx + i + 10, dy + cardH); g.closePath(); g.fill();
    }
  }
  // In-card header (part of the card, not a separate block).
  if (cfg.showHeader) {
    const themeName = THEMES[S.theme]?.name || 'Custom';
    const wpName = !S.bgImage ? 'Solid' : String(S.bgImage).startsWith('preset:') ? String(S.bgImage).slice(7) : 'Custom';
    g.textAlign = 'center';
    g.fillStyle = tPri;
    g.font = `800 52px ${DISP}`;
    try { g.letterSpacing = '6px'; } catch {}
    g.fillText('ZENFIT', dx + W / 2, y + 52);
    try { g.letterSpacing = '0px'; } catch {}
    g.fillStyle = tMut;
    g.font = `500 21px ${DISP}`;
    g.fillText(`${themeName} · ${cfg.cardStyle === 'cyber' ? 'Cyberpunk HUD' : (S.uiStyle || 'liquid')} · ${wpName}`, dx + W / 2, y + 86);
    g.textAlign = 'left';
    y += headH;
  }
  // Identity block: spotlight hero art / ID photo rows / classic avatar row.
  // Primary = user image (front, focused); secondary = wallpaper (back, dimmed).
  const pic = await loadImg(S.profilePic);
  const ax = dx + pad;
  if (isSpot) {
    const hh = 300, hx = dx + pad, hw = cw;
    if (pic) drawCover(g, pic, hx, y, hw, hh);
    else {
      g.fillStyle = primDim;
      rr(g, hx, y, hw, hh, 14); g.fill();
      g.fillStyle = prim;
      g.font = `800 120px ${DISP}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText((st.name[0] || 'H').toUpperCase(), hx + hw / 2, y + hh / 2);
      g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    }
    const grd = g.createLinearGradient(0, y + hh - 140, 0, y + hh);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.72)');
    g.fillStyle = grd;
    g.fillRect(hx, y + hh - 140, hw, 140);
    const badge = `Lv ${st.level}`;
    g.font = `700 24px ${DISP}`;
    const bw = g.measureText(badge).width + 36;
    g.fillStyle = primDim;
    rr(g, dx + W - pad - bw, y + 20, bw, 44, 22);
    g.fill();
    g.fillStyle = prim; g.textAlign = 'center';
    g.fillText(badge, dx + W - pad - bw / 2, y + 51);
    g.textAlign = 'left';
    g.fillStyle = '#fff';
    g.font = `800 44px ${DISP}`;
    const nm = st.name.length > 14 ? `${st.name.slice(0, 13)}…` : st.name;
    g.fillText(nm, hx + 20, y + hh - 52);
    g.fillStyle = 'rgba(255,255,255,0.88)';
    g.font = `500 23px ${DISP}`;
    let sx = hx + 20;
    const sseg = (txt, color) => { g.fillStyle = color; g.fillText(txt, sx, y + hh - 18); sx += g.measureText(txt).width; };
    sseg(`Lv ${v.level ? st.level : '—'}   `, 'rgba(255,255,255,0.88)');
    sseg(v.rank ? `RANK ${st.rank}` : '—', v.rank ? rankC : 'rgba(255,255,255,0.88)');
    sseg(`   ${v.xp ? `${st.xp} XP` : ''}`, 'rgba(255,255,255,0.88)');
    y += topH;
    if (bio) {
      g.fillStyle = tSec;
      g.font = `italic 500 22px ${DISP}`;
      const maxW = cw;
      let bl = bio;
      while (bl.length > 1 && g.measureText(`“${bl}”`).width > maxW) bl = bl.slice(0, -1);
      if (bl.length < bio.length) bl = `${bl.slice(0, -1)}…`;
      g.fillText(`“${bl}”`, ax, y + 26);
      y += 34;
    }
  } else if (isID) {
    const pw = 190, ph = 220;
    if (pic) drawCover(g, pic, ax, y, pw, ph);
    else {
      g.fillStyle = primDim;
      rr(g, ax, y, pw, ph, 10); g.fill();
      g.fillStyle = prim;
      g.font = `800 72px ${DISP}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText((st.name[0] || 'H').toUpperCase(), ax + pw / 2, y + ph / 2);
      g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    }
    g.lineWidth = Math.max(2, Math.round(k)); g.strokeStyle = prim;
    rr(g, ax, y, pw, ph, 10); g.stroke();
    const ix = ax + pw + 24;
    g.textAlign = 'left';
    const idRow = (cap, val, yy) => {
      g.fillStyle = tMut;
      g.font = `500 17px ${DISP}`;
      g.fillText(cap, ix, yy);
      g.fillStyle = tPri;
      g.font = `800 30px ${DISP}`;
      const vv = String(val).length > 14 ? `${String(val).slice(0, 13)}…` : String(val);
      g.fillText(vv, ix, yy + 38);
    };
    idRow('CALL SIGN', st.name, y + 24);
    idRow('RANK', v.rank ? st.rank : '—', y + 100);
    idRow('LEVEL', v.level ? st.level : '—', y + 176);
    y += 236;
    g.fillStyle = raised;
    rr(g, ax, y, cw, 56, 10); g.fill();
    g.fillStyle = tMut;
    g.font = `500 17px ${DISP}`; g.textAlign = 'left';
    g.fillText('HUNTER ID', ax + 20, y + 36);
    g.fillStyle = prim;
    g.font = `800 34px ${DISP}`; g.textAlign = 'right';
    g.fillText(v.rank ? st.rank : '—', ax + cw - 20, y + 40);
    g.textAlign = 'left';
    y += 72;
    if (bio) {
      g.fillStyle = tSec;
      g.font = `italic 500 22px ${DISP}`;
      const maxW = cw;
      let bl = bio;
      while (bl.length > 1 && g.measureText(`“${bl}”`).width > maxW) bl = bl.slice(0, -1);
      if (bl.length < bio.length) bl = `${bl.slice(0, -1)}…`;
      g.fillText(`“${bl}”`, ax, y + 24);
      y += 32;
    }
  } else {
  // Avatar
  g.save();
  g.beginPath(); g.arc(ax + av / 2, y + av / 2, av / 2, 0, 7); g.clip();
  if (pic) drawCover(g, pic, ax, y, av, av);
  else {
    g.fillStyle = cssVar('--primary-dim', '#3a2099');
    g.fillRect(ax, y, av, av);
    g.fillStyle = prim;
    g.font = `800 ${Math.round(av * 0.42)}px ${DISP}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText((st.name[0] || 'H').toUpperCase(), ax + av / 2, y + av / 2 + 2);
  }
  g.restore();
  g.lineWidth = 4; g.strokeStyle = prim;
  g.beginPath(); g.arc(ax + av / 2, y + av / 2, av / 2 - 2, 0, 7); g.stroke();
  // Name + sub (rank keeps its V1 rank color, like the DOM badge text)
  const tx = ax + av + 24;
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillStyle = tPri;
  g.font = `800 40px ${DISP}`;
  const nm = st.name.length > 16 ? `${st.name.slice(0, 15)}…` : st.name;
  g.fillText(nm, tx, y + 48);
  g.font = `500 24px ${DISP}`;
  let sx = tx;
  const seg = (txt, color) => { g.fillStyle = color; g.fillText(txt, sx, y + 88); sx += g.measureText(txt).width; };
  seg(`Lv ${v.level ? st.level : '—'}   `, tSec);
  seg(v.rank ? `RANK ${st.rank}` : '—', v.rank ? rankC : tSec);
  seg(`   ${v.xp ? `${st.xp} XP` : ''}`, tSec);
  // Level badge (mirrors .badge-purple: dim bg, primary text)
  const badge = `Lv ${st.level}`;
  g.font = `700 24px ${DISP}`;
  const bw = g.measureText(badge).width + 36;
  g.fillStyle = primDim;
  rr(g, dx + W - pad - bw, y + 8, bw, 44, 22);
  g.fill();
  g.fillStyle = prim; g.textAlign = 'center';
  g.fillText(badge, dx + W - pad - bw / 2, y + 39);
  g.textAlign = 'left';
  // Bio line (stored sanitized; canvas text cannot execute code).
  if (bio) {
    g.fillStyle = tSec;
    g.font = `italic 500 22px ${DISP}`;
    const maxW = dx + W - pad - tx;
    let bl = bio;
    while (bl.length > 1 && g.measureText(`“${bl}”`).width > maxW) bl = bl.slice(0, -1);
    if (bl.length < bio.length) bl = `${bl.slice(0, -1)}…`;
    g.fillText(`“${bl}”`, tx, y + 114);
  }
  } // end classic identity branch
  y += topH + 18;
  // XP bar
  const xpNeed = xpForLevel(st.level);
  const pct = Math.min(1, st.xp / Math.max(1, xpNeed));
  g.fillStyle = overlayC;
  rr(g, dx + pad, y, cw, barH, 8); g.fill();
  if (pct > 0) {
    const grad = g.createLinearGradient(dx + pad, 0, dx + pad + cw, 0);
    grad.addColorStop(0, prim); grad.addColorStop(1, succ);
    g.fillStyle = grad;
    rr(g, dx + pad, y, Math.max(barH, cw * pct), barH, 8); g.fill();
  }
  y += barH + 16;
  // Stat grid (mirrors the DOM cells: number / bar / ring).
  cells.forEach((cell, i) => {
    const cx = dx + pad + (i % cols) * (cellW + gap);
    const cy = y + Math.floor(i / cols) * (cellH + gap);
    g.fillStyle = raised;
    rr(g, cx, cy, cellW, cellH, cellR); g.fill();
    const vy = cfg.cellStyle === 'ring' && cell.pct != null ? cy + 40 : cy + 62;
    g.fillStyle = tPri;
    g.font = `800 ${cfg.cellStyle === 'ring' && cell.pct != null ? 30 : 40}px ${DISP}`;
    g.textAlign = 'center';
    g.fillText(cell.val, cx + cellW / 2, vy);
    if (cfg.cellStyle === 'bar' && cell.pct != null) {
      const bw = cellW - 44, bx = cx + 22, by = cy + 74;
      g.fillStyle = overlayC;
      rr(g, bx, by, bw, 10, 5); g.fill();
      g.fillStyle = prim;
      if (cell.pct > 0) { rr(g, bx, by, Math.max(10, (bw * cell.pct) / 100), 10, 5); g.fill(); }
    } else if (cfg.cellStyle === 'ring' && cell.pct != null) {
      const rx = cx + cellW / 2, ry = cy + 96, rr2 = 24;
      g.lineWidth = 7; g.strokeStyle = overlayC;
      g.beginPath(); g.arc(rx, ry, rr2, 0, 7); g.stroke();
      g.strokeStyle = prim; g.lineCap = 'round';
      g.beginPath(); g.arc(rx, ry, rr2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, cell.pct / 100)); g.stroke();
      g.lineCap = 'butt';
    }
    g.fillStyle = tMut;
    g.font = `500 20px ${DISP}`;
    const isBar = cfg.cellStyle === 'bar' && cell.pct != null;
    const isRing = cfg.cellStyle === 'ring' && cell.pct != null;
    g.fillText(cell.label, cx + cellW / 2, cy + (isRing ? 142 : isBar ? 106 : 94));
    g.textAlign = 'left';
  });
  y += gridH;
  // Footer
  const themeName = THEMES[S.theme]?.name || 'Custom';
  g.fillStyle = tMut;
  g.font = `500 21px ${DISP}`;
  if (cfg.variant === 'long') {
    const pct2 = Math.round((earnedIds().size / ACHIEVEMENTS.length) * 100);
    g.fillText(`Achievements ${pct2}% · ${themeName} theme`, dx + pad, y + 28);
  } else {
    g.fillText(`Hunter card · ${v.streak ? `Streak ${bestStreak()}d` : ''} ${v.achCount ? `· ${earnedIds().size}/${ACHIEVEMENTS.length}` : ''}`, dx + pad, y + 28);
    const bioShort = bioText(cfg);
    if (bioShort) {
      g.fillStyle = tSec;
      g.font = `italic 500 21px ${DISP}`;
      let bl = bioShort;
      const maxW = W - pad * 2;
      while (bl.length > 1 && g.measureText(`“${bl}”`).width > maxW) bl = bl.slice(0, -1);
      if (bl.length < bioShort.length) bl = `${bl.slice(0, -1)}…`;
      g.fillText(`“${bl}”`, dx + pad, y + 56);
    }
  }
  // Style frame (mirrors the skins; cyber texture stays opt-in via cardStyle)
  if (cyber) {
    g.save();
    g.lineWidth = Math.max(3, Math.round(2 * k)); g.strokeStyle = prim;
    cardPath(g, dx + 2, dy + 2, W - 4, cardH - 4, style, true);
    g.stroke();
    g.restore();
  } else if (style === 'hud') {
    g.save();
    g.lineWidth = Math.max(2, Math.round(k)); g.strokeStyle = prim;
    g.shadowColor = prim; g.shadowBlur = 18;
    cardPath(g, dx + 2, dy + 2, W - 4, cardH - 4, 'hud', cyber);
    g.stroke();
    g.restore();
  } else if (style === 'brutalist') {
    g.save();
    g.lineWidth = Math.max(2, Math.round(2 * k)); g.strokeStyle = '#0a0a0a';
    cardPath(g, dx + 1.5, dy + 1.5, W - 3, cardH - 3, style, cyber);
    g.stroke();
    g.restore();
  } else if (style === 'neomorph') {
    g.save();
    g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = Math.max(2, Math.round(k));
    g.beginPath(); g.moveTo(dx + 26, dy + 3); g.lineTo(dx + W - 26, dy + 3); g.stroke();
    g.restore();
  }
  // Glass hairline (mirrors the glass-mode card border).
  if (glass) {
    g.save();
    g.lineWidth = Math.max(2, Math.round(k)); g.strokeStyle = 'rgba(255,255,255,0.07)';
    cardPath(g, dx + 1, dy + 1, W - 2, cardH - 2, style, cyber);
    g.stroke();
    g.restore();
  }
  g.restore();
  return cardH;
}

async function exportPNG(kind) {
  const cfg = sc();
  if (!cfg.showCard && kind === 'short') { showNotif('Card block is hidden — show it first', '!'); return; }
  showNotif(kind === 'long' ? 'Rendering full stage…' : 'Rendering greeting card…', 'OK');
  try {
    const st = showcaseStats();
    const v = cfg.visible;
    const grank = __globalRank || '—';
    const scale = 2;
    const W = 720;
    let cv;
    if (kind === 'short') {
      // Measure via offscreen paint? Layout is fixed — paint directly.
      cv = document.createElement('canvas');
      cv.width = W * scale; cv.height = 900 * scale;
      const g = cv.getContext('2d');
      g.scale(scale, scale);
      const h = await paintCard(g, 0, 0, W, { ...cfg, variant: 'short' }, st, v, grank);
      const out = document.createElement('canvas');
      out.width = W * scale; out.height = Math.ceil(h) * scale;
      out.getContext('2d').drawImage(cv, 0, 0, W * scale, Math.ceil(h) * scale, 0, 0, W * scale, Math.ceil(h) * scale);
      cv = out;
    } else {
      const tPri = cssVar('--text-primary', '#ffffff');
      const tMut = cssVar('--text-muted', 'rgba(255,255,255,0.45)');
      const base = cssVar('--bg-base', '#080a10');
      // Stage honors the live backdrop: wallpaper cover + dim when set,
      // theme base otherwise. Same-origin only (remote → base fallback).
      let stageWp = null;
      if (cfg.showWallpaper && S.bgImage) {
        try { stageWp = await loadImg(await resolveBgSrc(S.bgImage)); } catch { stageWp = null; }
      }
      // Measure via offscreen paint? Layout is fixed — paint directly.
      const tmp = document.createElement('canvas');
      tmp.width = W; tmp.height = 1600;
      const tg = tmp.getContext('2d');
      const cardH = await paintCard(tg, 0, 0, W, cfg, st, v, grank);
      // Header lives inside the card — the stage starts at the card.
      const footH = 54;
      const H = cardH + 24 + footH;
      cv = document.createElement('canvas');
      cv.width = W * scale; cv.height = Math.ceil(H) * scale;
      const g = cv.getContext('2d');
      g.scale(scale, scale);
      if (stageWp) {
        drawCover(g, stageWp, 0, 0, W, H);
        g.fillStyle = `rgba(0,0,0,${Math.min(0.85, Math.max(0, (S.bgDim ?? 40) / 100))})`;
        g.fillRect(0, 0, W, H);
      } else {
        g.fillStyle = base;
        g.fillRect(0, 0, W, H);
      }
      // Live particle sprinkle (same hue family, cheap static dots).
      if (S.particlesEnabled) {
        const hue = Number(S.particleHue ?? 250) || 250;
        let seed = 7;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        for (let i = 0; i < 46; i++) {
          g.fillStyle = `hsla(${hue},85%,72%,${(0.25 + rnd() * 0.45).toFixed(2)})`;
          g.beginPath();
          g.arc(rnd() * W, rnd() * H, 1 + rnd() * 2.4, 0, 7);
          g.fill();
        }
      }
      let y = 0;
      g.drawImage(tmp, 0, 0, W, cardH, 0, y, W, cardH);
      y += cardH + 24;
      g.fillStyle = tMut;
      g.font = `500 20px ${DISP}`;
      g.textAlign = 'center';
      g.fillText(`Wallpaper: ${S.bgImage ? 'on' : 'solid'} · particles ${S.particlesEnabled ? 'on' : 'off'}`, W / 2, y + 24);
      g.textAlign = 'left';
    }
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    if (!blob) throw new Error('empty');
    const name = `zenfit-showcase-${kind}.png`;
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], name, { type: 'image/png' })] })) {
      try { await navigator.share({ files: [new File([blob], name, { type: 'image/png' })], title: 'ZenFit Showcase' }); return; } catch { /* user cancelled — fall through to download */ }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    showNotif('Card exported as PNG', 'OK');
  } catch {
    showNotif('Export failed — try again', '!');
  }
}

export function renderShowcase(host) {
  try { __cleanup?.(); } catch {}
  __cleanup = null;
  // ponytail: test hook only — lets headless verification assert real pixels
  try { if (window.ZF) window.ZF.showcaseExport = exportPNG; } catch {}
  const cfg = sc();
  const st = showcaseStats();
  const earned = earnedIds();
  const achPct = Math.round((earned.size / ACHIEVEMENTS.length) * 100);
  const xpNeed = xpForLevel(st.level);
  const rc = RANK_COLORS[st.rank] || '#888';
  const themeName = THEMES[S.theme]?.name || (String(S.theme).startsWith('custom:') ? 'Custom' : S.theme);
  const wpName = !S.bgImage ? 'Solid' : String(S.bgImage).startsWith('preset:') ? String(S.bgImage).slice(7) : /^https?:/i.test(String(S.bgImage)) ? 'Remote' : 'Uploaded';
  const v = cfg.visible;

  host.innerHTML = `
  <div id="sc-stage" class="sc-stage">
    <div id="sc-export-long" class="sc-export">
      ${cfg.showCard ? `
      <div id="sc-export-short" class="card mb12 sc-card sc-${cfg.cardStyle === 'cyber' ? 'cyber' : 'default'}">
        ${cfg.showHeader ? `
        <div style="text-align:center;margin-bottom:12px">
          <div style="font-size:24px;font-weight:800;font-family:var(--font-display);letter-spacing:3px">ZENFIT</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${escapeHtml(themeName)} · ${escapeHtml(cfg.cardStyle === 'cyber' ? 'Cyberpunk HUD' : (S.uiStyle || 'liquid'))} · ${escapeHtml(wpName)}</div>
        </div>` : ''}
        ${cfg.cardStyle === 'spotlight' ? `
        <div class="sc-hero-art" style="position:relative;height:240px;border-radius:12px;overflow:hidden;margin-bottom:12px;background:var(--primary-dim)">
          ${S.profilePic
            ? `<img src="${S.profilePic}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">`
            : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:90px;font-weight:800;font-family:var(--font-display);color:var(--primary)">${escapeHtml(((st.name || 'H')[0] || 'H').toUpperCase())}</div>`}
          <div style="position:absolute;inset:auto 0 0 0;padding:36px 14px 12px;background:linear-gradient(transparent,rgba(0,0,0,.72));display:flex;align-items:flex-end;justify-content:space-between;gap:8px">
            <div style="min-width:0"><div class="sc-name" style="font-size:22px;font-weight:800;font-family:var(--font-display);color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(st.name)}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.85)">Lv ${v.level ? st.level : '—'} · <span style="font-weight:700">${v.rank ? `RANK ${escapeHtml(st.rank)}` : '—'}</span>${v.xp ? ` · ${st.xp} XP` : ''}</div></div>
            <span class="badge badge-purple">Lv ${st.level}</span>
          </div>
        </div>`
        : cfg.cardStyle === 'idcard' ? `
        <div class="sc-idrow" style="display:flex;gap:12px;align-items:stretch;margin-bottom:12px">
          <div style="width:96px;flex-shrink:0;border:2px solid var(--primary);border-radius:10px;overflow:hidden;background:var(--primary-dim)">
            ${S.profilePic
              ? `<img src="${S.profilePic}" alt="" style="width:100%;height:100%;min-height:118px;object-fit:cover;display:block">`
              : `<div style="width:100%;height:118px;display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:800;font-family:var(--font-display);color:var(--primary)">${escapeHtml(((st.name || 'H')[0] || 'H').toUpperCase())}</div>`}
          </div>
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:5px">
            <div><div style="font-size:9px;color:var(--text-muted);letter-spacing:1px">CALL SIGN</div><div class="sc-name" style="font-size:17px;font-weight:800;font-family:var(--font-display);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(st.name)}</div></div>
            <div style="display:flex;gap:12px"><div><div style="font-size:9px;color:var(--text-muted);letter-spacing:1px">RANK</div><div style="font-size:13px;font-weight:700">${v.rank ? escapeHtml(st.rank) : '—'}</div></div>
            <div><div style="font-size:9px;color:var(--text-muted);letter-spacing:1px">LEVEL</div><div style="font-size:13px;font-weight:700">${v.level ? st.level : '—'}</div></div></div>
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;border:1px solid var(--border-mid);border-radius:10px;padding:6px 12px;margin-bottom:12px;background:var(--bg-raised)">
          <span style="font-size:10px;color:var(--text-muted);letter-spacing:2px">HUNTER ID</span>
          <span style="font-size:26px;font-weight:800;font-family:var(--font-display);color:var(--primary)">${v.rank ? escapeHtml(st.rank) : '—'}</span>
        </div>`
        : `
        <div class="sc-card-top" style="display:flex;align-items:center;gap:12px">
          ${avatarHTML(64)}
          <div style="flex:1;min-width:0">
            <div class="sc-name" style="font-size:19px;font-weight:800;font-family:var(--font-display);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(st.name)}</div>
            <div style="font-size:11px;color:var(--text-muted)">Lv ${v.level ? st.level : '—'} · <span style="color:${rc};font-weight:700">${v.rank ? `RANK ${escapeHtml(st.rank)}` : '—'}</span> · ${v.xp ? `${st.xp} XP` : ''}</div>
          </div>
          <span class="badge badge-purple">Lv ${st.level}</span>
        </div>`}
        ${cfg.variant === 'long' && bioText(cfg) ? `<div style="font-size:12px;color:var(--text-secondary);font-style:italic;margin-top:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">“${escapeHtml(bioText(cfg))}”</div>` : ''}
        <div class="xp-bar-wrap mt8"><div class="xp-bar sc-xpfill" data-w="${Math.min(100, Math.round((st.xp / Math.max(1, xpNeed)) * 100))}" style="width:0%"></div></div>
        ${cfg.variant === 'long' ? `
        <div class="grid3 mt8" style="gap:8px">
          ${gridCells(st, v, cfg, __globalRank || '…', earned.size, achPct).map((c) => c.custom
            ? `<div class="card-sm sc-stat" style="text-align:center;padding:10px 6px"><div style="width:20px;height:20px;margin:0 auto 4px;color:var(--primary)">${ICONS.globe}</div><div class="sc-num" id="sc-grank" style="font-size:16px;font-weight:800;font-family:var(--font-display)">${__globalRank || '…'}</div><div style="font-size:10px;color:var(--text-muted)">Global</div></div>`
            : statCell(c.icon, c.label, c.val, c.pct, cfg.cellStyle)).join('')}
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:6px">Achievements ${achPct}% · ${escapeHtml(themeName)} theme</div>
        ` : `
        <div style="font-size:12px;color:var(--text-secondary);margin-top:8px">Hunter card · ${v.streak ? `🔥 ${bestStreak()}d streak` : ''} ${v.achCount ? `· ${earned.size}/${ACHIEVEMENTS.length} achievements` : ''}</div>
        ${bioText(cfg) ? `<div style="font-size:12px;color:var(--text-secondary);font-style:italic;margin-top:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">“${escapeHtml(bioText(cfg))}”</div>` : ''}`}
      </div>` : `<div class="card mb12" style="text-align:center;color:var(--text-muted);font-size:12px">Card hidden — open the gear to show it.</div>`}
      ${cfg.showWallpaper ? `<div style="font-size:10px;color:var(--text-muted);text-align:center">Wallpaper: ${escapeHtml(wpName)} · particles ${S.particlesEnabled ? 'on' : 'off'}</div>`
        : `<div style="font-size:10px;color:var(--text-muted);text-align:center">Wallpaper hidden in this flex</div>`}
    </div>
  </div>
  <button id="sc-gear" class="sc-gear" aria-label="Showcase options" style="width:48px;height:48px;border-radius:50%;background:var(--primary);border:none;color:#fff;font-size:20px;position:fixed;right:16px;bottom:108px;z-index:10000;display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow-lg);cursor:pointer;transition:opacity .25s,transform .25s"><span style="width:22px;height:22px;display:block">${ICONS.gear}</span></button>
  <div id="sc-sheet" class="sc-sheet" style="display:${sheetOpen ? 'block' : 'none'}">
    <div class="card" style="padding:14px">
      <div class="flex-between mb8"><div style="font-size:13px;font-weight:700">Showcase Studio</div><button class="btn btn-sm btn-ghost" id="sc-close">Close</button></div>
      ${collapseHeader('sc-g-content', 'Content', `<span class="collapse-ic">${ICONS.clipboard}</span>`, 'Blocks, bio, header', 'default-open')}
      <div class="collapsible-body${S.collapsedSections?.['sc-g-content'] ? ' collapsed' : ''}" id="sc-g-content">
      <div class="grid2" style="gap:8px;margin-bottom:10px">
        ${[['showHeader', 'Header ZENFIT'], ['showCard', 'Card block'], ['showWallpaper', 'Wallpaper']].map(([k, l]) => `
          <label style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;background:var(--bg-raised);border:1px solid var(--border-mid);border-radius:10px;padding:8px 10px;cursor:pointer">${l}
          <input type="checkbox" data-sc="${k}" ${cfg[k] ? 'checked' : ''} style="width:18px;height:18px"></label>`).join('')}
      </div>
      <div style="font-size:12px;font-weight:600;margin-bottom:6px">Bio / quote (long + short card)</div>
      <div class="mb8">
        <input type="text" id="sc-bio" placeholder="A line about your hunter…" maxlength="140" value="${escapeHtml(String(cfg.bio || ''))}" style="font-size:12px">
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px">Shown when non-empty · sanitized, 140 chars max.</div>
      </div>
      </div>
      ${collapseHeader('sc-g-design', 'Design', `<span class="collapse-ic">${ICONS.sliders}</span>`, 'Version, style, template, cells', 'default-collapsed')}
      <div class="collapsible-body${S.collapsedSections?.['sc-g-design'] !== false ? ' collapsed' : ''}" id="sc-g-design">
      <div style="font-size:12px;font-weight:600;margin-bottom:6px">Version</div>
      <div class="flex gap8 mb8">
        ${['short', 'long'].map((x) => `<button class="btn btn-sm${cfg.variant === x ? ' btn-primary' : ''}" data-scvar="${x}" style="flex:1">${x}</button>`).join('')}
      </div>
      <div style="font-size:12px;font-weight:600;margin-bottom:6px">Card style</div>
      <div class="flex gap8 mb8">
        ${Object.entries(CARD_STYLES).map(([id, m]) => `<button class="btn btn-sm${cfg.cardStyle === id ? ' btn-primary' : ''}" data-scstyle="${id}" style="flex:1">${m.name}</button>`).join('')}
      </div>
      <div style="font-size:12px;font-weight:600;margin-bottom:6px">Template</div>
      <div class="flex gap8 mb8" style="flex-wrap:wrap">
        ${(() => { const td = themeTemplate(); return `<button class="btn btn-sm" data-sctemplate="__theme" style="flex:1">Theme default: ${escapeHtml(td.name)}</button>`; })()}
        ${Object.entries(CARD_TEMPLATES).map(([id, t]) => `<button class="btn btn-sm" data-sctemplate="${id}" style="flex:1">${escapeHtml(t.name)}</button>`).join('')}
      </div>
      ${customTemplates().length ? `<div class="flex gap8 mb8" style="flex-wrap:wrap">`
        + customTemplates().map((t) => `<span style="display:inline-flex;gap:4px;align-items:center;background:var(--bg-raised);border:1px solid var(--border-mid);border-radius:8px;padding:2px 2px 2px 8px;font-size:11px"><button class="btn btn-sm btn-ghost" data-sctemplate="${escapeHtml(t.id)}" style="border:none;padding:2px 4px">${escapeHtml(t.name)}</button><button class="btn btn-sm btn-ghost" data-sctdel="${escapeHtml(t.id)}" aria-label="Delete template" style="padding:2px 6px;color:var(--danger)">×</button></span>`).join('')
        + `</div>` : ''}
      <div class="flex gap8 mb8">
        <button class="btn btn-sm" id="sc-tplsave" style="flex:1">Save current as template</button>
      </div>
      <div style="font-size:12px;font-weight:600;margin-bottom:6px">Cell style</div>
      <div class="flex gap8 mb8">
        ${[['number', 'Number'], ['bar', 'Bar'], ['ring', 'Ring']].map(([x, l]) => `<button class="btn btn-sm${cfg.cellStyle === x ? ' btn-primary' : ''}" data-sccell="${x}" style="flex:1">${l}</button>`).join('')}
      </div>
      <div style="font-size:12px;font-weight:600;margin-bottom:6px">Card backdrop</div>
      <div class="flex gap8 mb8">
        ${[['wallpaper', 'Wallpaper'], ['theme', 'Theme']].map(([x, l]) => `<button class="btn btn-sm${cfg.cardBackdrop === x ? ' btn-primary' : ''}" data-scbdrop="${x}" style="flex:1">${l}</button>`).join('')}
      </div>
      </div>
      ${collapseHeader('sc-g-cells', 'Cells', `<span class="collapse-ic">${ICONS.dashboard}</span>`, 'Info toggles + order', 'default-collapsed')}
      <div class="collapsible-body${S.collapsedSections?.['sc-g-cells'] !== false ? ' collapsed' : ''}" id="sc-g-cells">
      <div style="font-size:12px;font-weight:600;margin-bottom:6px">Show info</div>
      <div class="grid2" style="gap:6px;margin-bottom:10px">
        ${VIS_DEFS.map(([k, l]) => `<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-secondary)"><input type="checkbox" data-scvis="${k}" ${v[k] ? 'checked' : ''} style="width:16px;height:16px">${l}</label>`).join('')}
      </div>
      <div style="font-size:12px;font-weight:600;margin-bottom:6px">Arrange cells</div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:10px;max-height:180px;overflow-y:auto">
        ${gridOrder(cfg).map((k) => {
          const l = (VIS_DEFS.find(([x]) => x === k) || [k, k])[1];
          return `<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-secondary);background:var(--bg-raised);border:1px solid var(--border-mid);border-radius:8px;padding:4px 8px;${v[k] ? '' : 'opacity:.45'}"><span style="flex:1">${l}</span>`
            + `<button class="btn btn-sm" data-scmv="-1" data-sckey="${k}" aria-label="Move up" style="padding:8px 12px;min-height:40px">↑</button>`
            + `<button class="btn btn-sm" data-scmv="1" data-sckey="${k}" aria-label="Move down" style="padding:8px 12px;min-height:40px">↓</button></div>`;
        }).join('')}
      </div>
      </div>
      <div class="flex gap8">
        <button class="btn btn-sm btn-primary" id="sc-share-long" style="flex:1"><span style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin-right:4px">${ICONS.share}</span>Share long</button>
        <button class="btn btn-sm" id="sc-share-short" style="flex:1">Share short</button>
      </div>
    </div>
  </div>`;

  const cardElm = host.querySelector('.sc-card');
  if (cardElm) {
    if (cfg.cardBackdrop === 'wallpaper' && S.bgImage) {
      resolveBgSrc(S.bgImage).then((url) => {
        if (url && cardElm.isConnected) {
          cardElm.style.background = `linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,.55)),url("${url}") center/cover`;
        }
      }).catch(() => {});
    }
  }

  try {
    if (window.anime && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      window.anime({ targets: host.querySelectorAll('.sc-card'), opacity: [0, 1], translateY: [16, 0], duration: 420, delay: window.anime.stagger(90), easing: 'easeOutBack(1.3)' });
    }
  } catch {}
  // Fresh navigation animates, state rerenders paint finals instantly.
  try { animateNumbers(host, !host.dataset.fresh); } catch {}

  const grankElm = host.querySelector('#sc-grank');
  if (grankElm) {
    if (__globalRank) grankElm.textContent = __globalRank;
    else if (!__globalRankTried) {
      grankElm.textContent = '…';
      __globalRankTried = true;
      LeaderboardAPI.fetch(50).then((rows) => {
        const myName = (S.profile?.name || S.player?.name || '').trim().toLowerCase();
        let ix = (rows || []).findIndex((u) => u.device_id && u.device_id === S.deviceId);
        if (ix < 0 && myName) ix = (rows || []).findIndex((u) => (u.name || '').trim().toLowerCase() === myName);
        __globalRank = ix >= 0 ? `#${ix + 1}` : 'Top 50↗';
        const live = host.querySelector('#sc-grank');
        if (live) live.textContent = __globalRank;
      }).catch(() => {
        __globalRank = `Lv ${st.level}`;
        const live = host.querySelector('#sc-grank');
        if (live) live.textContent = __globalRank;
      });
    } else grankElm.textContent = __globalRank || `Lv ${st.level}`;
  }

  const gear = host.querySelector('#sc-gear');
  const sheet = host.querySelector('#sc-sheet');
  let idleT = 0;
  const poke = () => {
    if (!gear.isConnected) return;
    // Sheet up: gear stays parked (any pointer activity would un-hide it).
    try {
      const live = document.getElementById('sc-sheet');
      if (live && live.style.display === 'block') return;
    } catch {}
    gear.style.opacity = '1';
    gear.style.pointerEvents = 'auto';
    gear.style.transform = 'scale(1)';
    clearTimeout(idleT);
    idleT = setTimeout(() => {
      const live = document.getElementById('sc-sheet');
      if (live && live.style.display === 'block') return;
      gear.style.opacity = '0';
      gear.style.pointerEvents = 'none';
      gear.style.transform = 'scale(.7)';
    }, 1000);
  };
  const onAct = () => poke();
  const wake = () => { if (gear.style.opacity === '0') poke(); };
  const onResize = () => positionGear();
  document.addEventListener('pointermove', onAct, { passive: true });
  document.addEventListener('pointerdown', onAct, { passive: true });
  document.addEventListener('keydown', onAct);
  host.addEventListener('pointerdown', wake);
  window.addEventListener('resize', onResize);
  poke();
  positionGear();
  __cleanup = () => {
    clearTimeout(idleT);
    document.removeEventListener('pointermove', onAct);
    document.removeEventListener('pointerdown', onAct);
    document.removeEventListener('keydown', onAct);
    document.removeEventListener('pointerdown', outsideSheetCloser);
    window.removeEventListener('resize', onResize);
    if (window.ZF?.consumeBack === consumeSheetBack) window.ZF.consumeBack = null;
  };

  gear.onclick = (e) => {
    e.stopPropagation();
    setSheet(!sheetOpen);
    // ponytail: no poke() on open — setSheet hides the gear while the
    // sheet is up, and poke() would immediately un-hide it
    if (sheetOpen) {
      try { springIn(document.getElementById('sc-sheet')?.firstElementChild); } catch {}
    } else poke();
  };
  host.querySelector('#sc-close').onclick = () => setSheet(false);

  host.querySelectorAll('[data-sc]').forEach((c) => {
    c.onchange = () => { set({ [c.dataset.sc]: c.checked }); window.ZF.save(); window.ZF.rerender(); };
  });
  host.querySelectorAll('[data-scvar]').forEach((b) => {
    b.onclick = () => { set({ variant: sanitizeEnum(b.dataset.scvar, ['short', 'long'], 'long') }); window.ZF.save(); window.ZF.rerender(); };
  });
  host.querySelectorAll('[data-scstyle]').forEach((b) => {
    b.onclick = () => { set({ cardStyle: sanitizeEnum(b.dataset.scstyle, ['default', 'cyber', 'spotlight', 'idcard'], 'default') }); window.ZF.save(); showNotif(`Card style: ${CARD_STYLES[b.dataset.scstyle]?.name || b.dataset.scstyle}`, 'OK'); window.ZF.rerender(); };
  });
  host.querySelectorAll('[data-scbdrop]').forEach((b) => {
    b.onclick = () => { set({ cardBackdrop: sanitizeEnum(b.dataset.scbdrop, ['wallpaper', 'theme'], 'wallpaper') }); window.ZF.save(); window.ZF.rerender(); };
  });
  host.querySelectorAll('[data-sccell]').forEach((b) => {
    b.onclick = () => { set({ cellStyle: sanitizeEnum(b.dataset.sccell, ['number', 'bar', 'ring'], 'number') }); window.ZF.save(); showNotif('Cell style: ' + b.dataset.sccell, 'OK'); window.ZF.rerender(); };
  });
  host.querySelectorAll('[data-scvis]').forEach((c) => {
    c.onchange = () => { setVis(c.dataset.scvis, c.checked); window.ZF.save(); window.ZF.rerender(); };
  });
  // Bio/quote: sanitize on commit (maxlength 140, tags/protocols/handlers stripped).
  host.querySelector('#sc-bio').onchange = (e) => {
    set({ bio: sanitizeText(e.target.value, 140) });
    window.ZF.save();
    showNotif('Bio updated', 'OK');
    window.ZF.rerender();
  };
  host.querySelectorAll('[data-scmv]').forEach((b) => {    b.onclick = () => {
      const cur = gridOrder(cfg);
      const i = cur.indexOf(b.dataset.sckey);
      if (i < 0) return;
      const j = Math.min(cur.length - 1, Math.max(0, i + Number(b.dataset.scmv)));
      if (j === i) return;
      const [x] = cur.splice(i, 1);
      cur.splice(j, 0, x);
      set({ order: cur });
      window.ZF.save();
      window.ZF.rerender();
    };
  });
  host.querySelectorAll('[data-sctemplate]').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.sctemplate;
      if (id === '__theme') {
        const td = themeTemplate();
        applyTemplateSnap(td);
        showNotif(`Theme default: ${td.name}`, 'OK');
      } else if (CARD_TEMPLATES[id]) {
        applyTemplateSnap(CARD_TEMPLATES[id]);
        showNotif(`Template: ${CARD_TEMPLATES[id].name}`, 'OK');
      } else {
        const t = customTemplates().find((x) => x.id === id);
        if (!t) { showNotif('Template gone', '!'); return; }
        applyTemplateSnap(t.snap);
        showNotif(`Template: ${t.name}`, 'OK');
      }
      window.ZF.rerender();
    };
  });
  host.querySelectorAll('[data-sctdel]').forEach((b) => {
    b.onclick = () => {
      const cur = sc();
      const left = customTemplates().filter((x) => x.id !== b.dataset.sctdel);
      set({ templates: left });
      window.ZF.save();
      showNotif('Template deleted', 'OK');
      window.ZF.rerender();
    };
  });
  host.querySelector('#sc-tplsave').onclick = () => {
    openOverlay(`<div style="font-size:15px;font-weight:700;margin-bottom:4px">Save template</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">Snapshots the current design: card + cell style, attributes, version, backdrop.</div>
      <input type="text" id="sc-tplname" placeholder="Template name" maxlength="30" style="font-size:13px;margin-bottom:10px">
      <div class="flex gap8"><button class="btn btn-primary btn-sm" id="sc-tplgo" style="flex:1">Save</button>
      <button class="btn btn-ghost btn-sm" id="sc-tplx">Cancel</button></div>`);
    document.getElementById('sc-tplx').onclick = () => document.getElementById('zf-overlay')?.remove();
    const go = () => {
      const name = sanitizeText(document.getElementById('sc-tplname')?.value || '', 30) || 'My template';
      const c = sc();
      const snap = { cardStyle: c.cardStyle, cellStyle: c.cellStyle, variant: c.variant, cardBackdrop: c.cardBackdrop };
      const id = `u${Date.now().toString(36)}`;
      set({ templates: [...customTemplates(), { id, name, snap }] });
      window.ZF.save();
      document.getElementById('zf-overlay')?.remove();
      showNotif(`Template saved: ${name}`, 'OK');
      window.ZF.rerender();
    };
    document.getElementById('sc-tplgo').onclick = go;
    document.getElementById('sc-tplname').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  };
  host.querySelector('#sc-share-long').onclick = () => exportPNG('long');
  host.querySelector('#sc-share-short').onclick = () => exportPNG('short');
  try { wireCollapsibles(host); } catch {}
}
