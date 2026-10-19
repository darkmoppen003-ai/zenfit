/* ── ZenFit V2 · features/showcase.js ──────────────────────
   Flex/stage screen: showcases the user's theme, wallpaper,
   interface style + profile card. Reads live state only —
   never writes earned data. Prefs live in S.showcase (v20).
   PNG export uses a zero-dependency DOM-snapshot renderer
   (SVG foreignObject → canvas → PNG), lazy + offline-safe.
────────────────────────────────────────────────────────────── */
import { S, update, resolveBgSrc } from '../core/store.js';
import { escapeHtml, sanitizeEnum, sanitizeText } from '../core/sanitize.js';
import { showNotif, openOverlay, collapseHeader, wireCollapsibles, ICONS, bgOrient } from '../core/ui.js';
import { showcaseStats, habitStreak, questsToday } from '../core/selectors.js';
import { animateNumbers, springIn } from '../core/animations.js';
import { xpForLevel } from '../core/utils.js';
import { ACHIEVEMENTS, earnedIds } from '../core/achievements.js';
import { LeaderboardAPI } from '../core/cloud.js';
import { THEMES } from '../core/themes.js';

/* Extensible card-style registry — add a third entry later, no refactor. */
export const CARD_STYLES = {
  default: { name: 'Default', icon: 'styleLiquid' },
  spotlight: { name: 'Spotlight', icon: 'image' },
  idcard: { name: 'ID Card', icon: 'user' },
  onisea: { name: 'ONISEA ID', icon: 'shieldRank' },
  anime: { name: 'Collectible', icon: 'sparkle' },
  poster: { name: 'Poster', icon: 'camera' },
  operator: { name: 'Operator ID', icon: 'shieldCheck' },
  system: { name: 'System Panel', icon: 'styleCyber' },
};
/* Designed treatments own their full composition at a fixed canvas width
   (the DOM preview mirrors the same composition). [width, short height] */
const CARD_DIMS = { onisea: [1080, 720], anime: [720, 1080], poster: [760, 1060], operator: [1040, 680], system: [760, 1140] };
const isDesignedStyle = (s) => Object.prototype.hasOwnProperty.call(CARD_DIMS, s);
/* ── Templates: user-saved designs only (no bundled gallery). ────────────
   v1 snapshots stored 4 design keys; v2 stores the full reusable config
   (layout, treatment, output format, backdrop, header/footer switches,
   field visibility + order, schemaVersion). Personal content (name,
   avatar, bio) is deliberately NOT part of a template. Old `{id,name,snap}`
   entries keep working — applyTemplateSnap backfills what they omit. */
function templateSnap(t) {
  if (!t || typeof t !== 'object') return null;
  if (t.snapFull && typeof t.snapFull === 'object') return t.snapFull;
  if (t.snap && typeof t.snap === 'object') return t.snap;
  return null;
}
function customTemplates() {
  const arr = sc().templates;
  return Array.isArray(arr) ? arr.filter((t) => t && t.id && templateSnap(t)) : [];
}
/* Apply a v1 or v2 snapshot. Every value is enum-checked or type-checked;
   anything missing keeps the user's current setting (v1 templates). */
function applyTemplateSnap(snap) {
  if (!snap || typeof snap !== 'object') return;
  const cur = sc();
  const patch = {};
  if ('cardStyle' in snap) patch.cardStyle = sanitizeEnum(snap.cardStyle, Object.keys(CARD_STYLES), cur.cardStyle);
  if ('cellStyle' in snap) patch.cellStyle = sanitizeEnum(snap.cellStyle, ['number', 'bar', 'ring'], cur.cellStyle);
  if ('variant' in snap) patch.variant = sanitizeEnum(snap.variant, ['short', 'long'], cur.variant);
  if ('cardBackdrop' in snap) patch.cardBackdrop = sanitizeEnum(snap.cardBackdrop, ['wallpaper', 'theme'], cur.cardBackdrop);

  if (typeof snap.posterDots === 'boolean') patch.posterDots = snap.posterDots;
  if (typeof snap.showHeader === 'boolean') patch.showHeader = snap.showHeader;
  if (typeof snap.showCard === 'boolean') patch.showCard = snap.showCard;
  if (snap.visible && typeof snap.visible === 'object') {
    const vis = {};
    for (const a of SHOWCASE_ATTRIBUTES) if (a.key in snap.visible) vis[a.key] = !!snap.visible[a.key];
    patch.visible = vis;
  }
  if (Array.isArray(snap.order)) patch.order = gridOrder({ order: snap.order });
  if (snap.cellViz && typeof snap.cellViz === 'object') {
    const cv = {};
    for (const k of Object.keys(snap.cellViz)) if ((GRID_KEYS.includes(k) || ATTR_KEYS.includes(k)) && CELL_VIZ.includes(snap.cellViz[k])) cv[k] = snap.cellViz[k];
    patch.cellViz = cv;
  }
  if ('accent' in snap) patch.accent = ACCENT_RE.test(String(snap.accent || '')) ? snap.accent : '';
  set(patch);
}

let __globalRank = null;
let __globalRankTried = false;
/* The cached rank is only valid for the identity + opt-in state it was
   fetched under (device switch or opt-out must not leak an old rank). */
let __globalRankKey = '';
const rankCacheKey = () => `${S.deviceId || ''}|${S.globalLeaderboardOptIn === true ? 1 : 0}`;
let __cleanup = null;
/* Studio sheet state survives rerenders (toggles rebuild the screen). */
let sheetOpen = false;
/* Scroll offset survives the router's pre-render wipe via a passive
   listener; a toggle deep in the settings list must not jump to the top. */
let __sheetScrollTop = 0;
function outsideSheetCloser(e) {
  if (e.target.closest?.('#sc-sheet')) return;
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
/* Escape is part of the dialog contract, in addition to: close button,
   outside tap, and back press. */
function escSheetCloser(e) {
  if (e.key === 'Escape' && sheetOpen) { e.preventDefault(); setSheet(false); }
}
/* Sheet closes ONLY via: close button, outside tap, back press, Escape. */
function setSheet(open) {
  sheetOpen = open;
  if (!open) __sheetScrollTop = 0; // next open starts at the top
  const el = document.getElementById('sc-sheet');
  if (el) el.style.display = open ? 'block' : 'none';
  if (!open && el && el.contains(document.activeElement)) { try { document.getElementById('sc-open-sheet')?.focus(); } catch {} }
  if (open) {
    try { history.pushState({ scSheet: 1 }, ''); } catch {}
    try { if (window.ZF) window.ZF.consumeBack = consumeSheetBack; } catch {}
    document.addEventListener('pointerdown', outsideSheetCloser);
    document.addEventListener('keydown', escSheetCloser);
  } else {
    if (window.ZF?.consumeBack === consumeSheetBack) window.ZF.consumeBack = null;
    document.removeEventListener('pointerdown', outsideSheetCloser);
    document.removeEventListener('keydown', escSheetCloser);
  }
}
function safePic(p){if(!p)return'';const s=String(p);if(s.startsWith('data:image/')&&s.includes(';base64,'))return s;if(s.startsWith('blob:'))return s;return''}

function sc() {
  const d = (S.showcase && typeof S.showcase === 'object') ? S.showcase : {};
  const dv = { showHeader: true, showCard: true, variant: 'long', showWallpaper: true, cardStyle: 'default', cardBackdrop: 'wallpaper', posterDots: true, cellStyle: 'number', cellViz: {}, accent: '', order: null, bio: '', visible: {} };
  const visD = { streak: true, level: true, rank: true, globalRank: true, xp: true, strength: true, endurance: true, discipline: true, health: true, wisdom: true, achCount: true, workouts: true, steps: true, study: true, water: true, habits: true, habitStreak: true, consistency: true, bio: true };
  // Read-side sanitize: only known grid keys with known viz values survive;
  // accent must be a plain 6-digit hex (canvas + inline styles both take it).
  const cv = {};
  if (d.cellViz && typeof d.cellViz === 'object') {
    for (const k of Object.keys(d.cellViz)) if ((GRID_KEYS.includes(k) || ATTR_KEYS.includes(k)) && CELL_VIZ.includes(d.cellViz[k])) cv[k] = d.cellViz[k];
  }
  return { ...dv, ...d, visible: { ...visD, ...((d.visible) || {}) }, cellViz: cv, accent: ACCENT_RE.test(String(d.accent || '')) ? d.accent : '' };
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
const clampPct = (v) => Math.min(100, Math.max(0, Math.round(v)));
/* ── Attribute registry: the single source for every card field. ──────────
   One entry per attribute drives the settings list, the cell grid, the DOM
   preview and the canvas export (label, value, unit, progress). To add a
   field: add one entry here (+ its icon in core/icons.js if it is a grid
   cell). `desc` is the settings help text and pins the metric's exact time
   window, so no number is ambiguous on the card. Grid positions define the
   canonical cell order (users reorder via cfg.order). */
const SHOWCASE_ATTRIBUTES = [
  { key: 'streak', label: 'Streak', desc: 'Current habit streak — consecutive days, recalculated', category: 'Habits & consistency', scope: 'grid', grid: 1, icon: 'flame',
    value: () => currentStreak(), fmt: (v) => `${v}d`, pct: null },
  { key: 'level', label: 'Level', desc: 'Hunter level', category: 'Identity & progression', scope: 'header',
    value: (st) => st.level, fmt: (v) => String(v ?? '—'), pct: null },
  { key: 'rank', label: 'Rank', desc: 'Rank letter (E–S)', category: 'Identity & progression', scope: 'header',
    value: (st) => st.rank, fmt: (v) => String(v ?? '—'), pct: null },
  { key: 'globalRank', label: 'Global', desc: 'Leaderboard position — top 50 only, matched by device ID, never by name', category: 'Identity & progression', scope: 'grid', grid: 2, icon: 'globe',
    value: (st, cx) => cx.grank, fmt: (v) => String(v ?? '—'), pct: null, custom: true },
  { key: 'xp', label: 'XP', desc: 'Total XP earned', category: 'Identity & progression', scope: 'header',
    value: (st) => st.xp, fmt: (v) => `${v ?? 0} XP`, pct: null },
  { key: 'strength', label: 'Strength', desc: 'Player stat (0–100)', category: 'Player stats', scope: 'grid', grid: 4, icon: 'swords',
    value: (st) => st.strength ?? 10, fmt: (v) => String(v), pct: (st) => clampPct(st.strength ?? 10) },
  { key: 'endurance', label: 'Endurance', desc: 'Player stat (0–100)', category: 'Player stats', scope: 'grid', grid: 5, icon: 'steps',
    value: (st) => st.endurance ?? 10, fmt: (v) => String(v), pct: (st) => clampPct(st.endurance ?? 10) },
  { key: 'discipline', label: 'Discipline', desc: 'Player stat (0–100)', category: 'Player stats', scope: 'grid', grid: 6, icon: 'mindCyber',
    value: (st) => st.discipline ?? 10, fmt: (v) => String(v), pct: (st) => clampPct(st.discipline ?? 10) },
  { key: 'health', label: 'Health', desc: 'Player stat (0–100)', category: 'Player stats', scope: 'grid', grid: 7, icon: 'heart',
    value: (st) => st.health ?? 10, fmt: (v) => String(v), pct: (st) => clampPct(st.health ?? 10) },
  { key: 'wisdom', label: 'Wisdom', desc: 'Player stat (0–100)', category: 'Player stats', scope: 'grid', grid: 8, icon: 'book',
    value: (st) => st.wisdom ?? 10, fmt: (v) => String(v), pct: (st) => clampPct(st.wisdom ?? 10) },
  { key: 'achCount', label: 'Achievements', desc: 'Earned achievements', category: 'Achievements', scope: 'grid', grid: 3, icon: 'medal',
    value: (st, cx) => cx.achN, fmt: (v) => String(v), pct: (st, cx) => cx.achPct,
    cellLabel: (st, cx) => `${cx.achN}/${cx.achTotal}` },
  { key: 'workouts', label: 'Workouts', desc: 'Logged workouts · all time', category: 'Training', scope: 'grid', grid: 9, icon: 'dumbbell',
    value: (st) => st.workouts ?? 0, fmt: (v) => String(v), pct: null },
  { key: 'steps', label: 'Steps', desc: 'Steps taken · today', category: 'Daily health', scope: 'grid', grid: 10, icon: 'footprintFill',
    value: (st) => st.steps ?? 0, fmt: (v) => String(v), pct: null },
  { key: 'study', label: 'Study', desc: 'Study/focus time · today (minutes)', category: 'Study & focus', scope: 'grid', grid: 11, icon: 'bookStack',
    value: (st) => st.study ?? 0, fmt: (v) => `${v}m`, pct: null },
  { key: 'water', label: 'Water', desc: 'Water goal completion · today (%)', category: 'Daily health', scope: 'grid', grid: 12, icon: 'drop',
    value: (st) => st.water ?? 0, fmt: (v) => `${v}%`, pct: (st) => st.water },
  { key: 'habits', label: 'Habits', desc: 'Habits completed · today', category: 'Habits & consistency', scope: 'grid', grid: 13, icon: 'checkSquare',
    value: (st) => st.habitsDone ?? 0, fmt: (v, st) => `${st.habitsDone || 0}/${st.habitsTotal || 0}`,
    pct: (st) => (st.habitsTotal ? Math.round((st.habitsDone / st.habitsTotal) * 100) : null) },
  { key: 'habitStreak', label: 'Best streak', desc: 'Longest habit streak (days)', category: 'Habits & consistency', scope: 'grid', grid: 14, icon: 'flame',
    value: () => bestStreak(), fmt: (v) => `${v}d`, pct: null },
  { key: 'consistency', label: 'Consistency', desc: 'Days with any habit done · last 7 days (%)', category: 'Habits & consistency', scope: 'grid', grid: 15, icon: 'target',
    value: (st) => st.consistency ?? 0, fmt: (v) => `${v}%`, pct: (st) => st.consistency },
  { key: 'bio', label: 'Bio / quote', desc: 'Your quote — personal content, kept out of templates', category: 'Identity & progression', scope: 'bio',
    value: () => bioText(sc()), fmt: (v) => String(v || ''), pct: null },
];
const ATTRS_BY_KEY = Object.fromEntries(SHOWCASE_ATTRIBUTES.map((a) => [a.key, a]));
const VIS_DEFS = SHOWCASE_ATTRIBUTES.map((a) => [a.key, a.label]);
/* Canonical cell order for the card grid (DOM + export share it). Users
   reorder via cfg.order; movers clamp so cells never leave the grid.
   The five player stats render as ONE full-width cluster ("attrs") taking
   the slot of the first stat: they move together, but every stat keeps its
   own on/off toggle in the Studio. */
const CLUSTER_KEY = 'attrs';
const ATTR_KEYS = SHOWCASE_ATTRIBUTES.filter((a) => a.category === 'Player stats').map((a) => a.key);
const GRID_KEYS = (() => {
  const rest = SHOWCASE_ATTRIBUTES.filter((a) => a.scope === 'grid' && !ATTR_KEYS.includes(a.key));
  const first = SHOWCASE_ATTRIBUTES.filter((a) => ATTR_KEYS.includes(a.key)).reduce((m, a) => Math.min(m, a.grid), Infinity);
  return [...rest, { key: CLUSTER_KEY, grid: first }].sort((a, b) => a.grid - b.grid).map((a) => a.key);
})();
const CELL_VIZ = ['number', 'bar', 'ring'];
const ACCENT_RE = /^#[0-9a-f]{6}$/i;
/* Preset card accents; '' = theme primary. Swatches chosen to read on dark
   skins and on the light collectible panel alike. */
const ACCENTS = [['#e8a33d', 'Amber'], ['#4fc3f7', 'Sky'], ['#7b5eff', 'Violet'], ['#22c07d', 'Green'], ['#e0526e', 'Rose']];
/* Per-field visualization: an explicit override wins over the global style. */
const vizFor = (cfg, key) => (CELL_VIZ.includes(cfg.cellViz?.[key]) ? cfg.cellViz[key] : cfg.cellStyle);
/* Resolve the optional card accent into canvas-safe colors (null = theme). */
function accentPair(cfg) {
  const hex = String(cfg.accent || '');
  if (!ACCENT_RE.test(hex)) return null;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g2 = (n >> 8) & 255, b = n & 255;
  return { main: hex, soft: `rgba(${r},${g2},${b},0.22)`, rgba: (a) => `rgba(${r},${g2},${b},${a})` };
}
function gridOrder(cfg) {
  const base = GRID_KEYS.slice();
  const cur = [];
  // legacy orders list the five stat keys individually — fold into "attrs"
  if (Array.isArray(cfg.order)) for (const x of cfg.order) {
    const k = ATTR_KEYS.includes(x) ? CLUSTER_KEY : x;
    if (base.includes(k) && !cur.includes(k)) cur.push(k);
  }
  base.forEach((x) => { if (!cur.includes(x)) cur.push(x); });
  return cur;
}
/* ── Canonical view model: one pure source of what the card contains. ────
   Builds display-ready data (cells, formatted values, identity, bio) that
   both the DOM preview and the canvas exporter consume. Read-only: never
   mutates S, never awards XP, never touches the leaderboard. */
function buildShowcaseModel(st, cfg, opts = {}) {
  const achTotal = ACHIEVEMENTS.length;
  const earned = opts.achN != null ? opts.achN : earnedIds().size;
  const ctx = {
    grank: opts.grank != null ? opts.grank : (__globalRank || '—'),
    achN: earned,
    achTotal,
    achPct: opts.achPct != null ? opts.achPct : Math.round((earned / Math.max(1, achTotal)) * 100),
    bio: bioText(cfg),
  };
  const cells = [];
  const vis = cfg.visible || {};
  for (const key of gridOrder(cfg)) {
    if (key === CLUSTER_KEY) {
      const members = ATTR_KEYS.filter((k) => vis[k] !== false).map((k) => {
        const a = ATTRS_BY_KEY[k];
        const raw = a.value(st, ctx);
        return { key: k, icon: a.icon, label: a.label, val: a.fmt ? a.fmt(raw, st, ctx) : String(raw), pct: a.pct ? a.pct(st, ctx) : null };
      });
      if (members.length) cells.push({ key: CLUSTER_KEY, cluster: true, label: 'Attributes', members });
      continue;
    }
    const a = ATTRS_BY_KEY[key];
    if (!a || a.scope !== 'grid') continue;
    const raw = a.value(st, ctx);
    cells.push({
      key,
      icon: a.icon,
      custom: !!a.custom,
      label: a.cellLabel ? a.cellLabel(st, ctx) : a.label,
      val: a.fmt ? a.fmt(raw, st, ctx) : String(raw),
      pct: a.pct ? a.pct(st, ctx) : null,
    });
  }
  const xpNeed = Math.max(1, xpForLevel(st.level));
  return {
    ctx,
    cells: { ordered: cells },
    identity: {
      name: st.name || 'Hunter',
      pic: S.profilePic || null,
      safePic: safePic(S.profilePic),
      level: st.level,
      rank: st.rank,
      xp: st.xp,
      xpPct: Math.min(1, (st.xp || 0) / xpNeed),
      rc: RANK_COLORS[st.rank] || '#888',
    },
    bio: ctx.bio,
    rank: { value: ctx.grank },
  };
}
/* One descriptor per visible grid cell, in user order — a thin filter over
   the model so the DOM and the canvas can never disagree about cells. */
function gridCells(st, v, cfg, grank, achN, achPct) {
  return buildShowcaseModel(st, cfg, { grank, achN, achPct }).cells.ordered.filter((c) => c.cluster || v[c.key]);
}

/* Current streak = recalculated consecutive days (never the stored value,
   which can be stale). Best streak keeps the stored-or-calculated max. */
function currentStreak() {
  try {
    return (S.habits || []).reduce((a, h) => Math.max(a, habitStreak(h) || 0), 0);
  } catch { return 0; }
}
function bestStreak() {
  try {
    return (S.habits || []).reduce((a, h) => Math.max(a, h.streak || habitStreak(h) || 0), 0);
  } catch { return 0; }
}
/* Anime ability-strip cells are quarter-width — long rank fallbacks take a
   compact form there so nothing gets clipped. */
/* Solo Leveling "system" rows: today's real daily quests — title, [0/1] and
   a checkbox ticked by real completion. Falls back to the stat cells if the
   quest list is somehow missing, so the goal list is never empty. */
/* Today's quest tally — the system window's status line only. */
function questProgress() {
  const qs = (() => { try { return questsToday() || []; } catch { return []; } })();
  return { done: qs.filter((q) => q.done).length, total: qs.length };
}

/* Bio/quote line: shown only when the user wrote one (and left it enabled).
   Stored sanitized (maxlength 140); rendered escaped; canvas fillText is
   code-inert by construction. */
function bioText(cfg) {
  const t = String(cfg.bio || '').trim();
  if (!t || cfg.visible?.bio === false) return '';
  return t.slice(0, 140);
}
/* One-line honest summary of the fields the exported image will contain. */
function includedFields(v) {
  const on = [];
  for (const a of SHOWCASE_ATTRIBUTES) {
    if ((a.scope === 'grid' || a.scope === 'header') && v[a.key]) on.push(a.label);
  }
  const extra = v.bio ? ['bio'] : [];
  const list = [...extra, ...on];
  const shown = list.length > 6 ? `${list.slice(0, 6).join(', ')} +${list.length - 6} more` : list.join(', ');
  return `avatar, name${shown ? `, ${shown}` : ''}`;
}

function avatarHTML(size = 64, acc = null) {
  const name = S.profile?.name || S.player?.name || 'Hunter';
  const init = escapeHtml(((name[0] || 'H').toUpperCase()));
  const main = acc ? acc.main : 'var(--primary)';
  const soft = acc ? acc.soft : 'var(--primary-dim)';
  if (S.profilePic) return `<img src="${safePic(S.profilePic)}" alt="" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:2px solid ${main};flex-shrink:0">`;
  return `<span style="width:${size}px;height:${size}px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:${Math.round(size * 0.4)}px;font-family:var(--font-display);background:${soft};color:${main};border:2px solid ${main}">${init}</span>`;
}

function statCell(iconName, label, value, pct, style, acc = null) {
  const main = acc ? acc.main : 'var(--primary)';
  const glyph = `<div style="width:20px;height:20px;margin:0 auto 4px;color:${main}">${ICONS[iconName] || ''}</div>`;
  const num = `<div class="sc-num" data-count="${value}" style="font-size:18px;font-weight:800;font-family:var(--font-display)">0</div>`;
  let extra = '';
  if (style === 'bar' && pct != null) {
    extra = `<div class="xp-bar-wrap mt8" style="height:6px"><div class="xp-bar" data-w="${Math.round(pct)}" style="width:0%${acc ? `;background:${acc.main}` : ''}"></div></div>`;
  } else if (style === 'ring' && pct != null) {
    const r = 13, c = 2 * Math.PI * r, t = c * Math.min(1, Math.max(0, pct / 100));
    return `<div class="card-sm sc-stat" style="text-align:center;padding:10px 6px">${glyph}`
      + `<svg width="44" height="44" viewBox="0 0 32 32" style="transform:rotate(-90deg);display:block;margin:0 auto">`
      + `<circle cx="16" cy="16" r="${r}" fill="none" stroke="var(--bg-overlay)" stroke-width="4"/>`
      + `<circle cx="16" cy="16" r="${r}" fill="none" stroke="${main}" stroke-width="4" stroke-linecap="round" stroke-dasharray="0 ${c.toFixed(1)}" data-ring="${t.toFixed(1)} ${c.toFixed(1)}"/></svg>`
      + `<div class="sc-num" data-count="${value}" style="font-size:13px;font-weight:800;font-family:var(--font-display)">0</div>`
      + `<div style="font-size:10px;color:var(--text-muted)">${label}</div></div>`;
  }
  return `<div class="card-sm sc-stat" style="text-align:center;padding:10px 6px">${glyph}${num}`
    + `<div style="font-size:10px;color:var(--text-muted)">${label}</div>${extra}</div>`;
}

/* Full-width stat cluster: the five player stats as one compact block
   (individual visibility still controlled per stat in the Studio). */
function clusterCell(c, acc) {
  const main = acc ? acc.main : 'var(--primary)';
  return `<div class="card-sm sc-stat" style="text-align:left;padding:10px 12px;margin-top:8px">
    <div style="font-size:10px;letter-spacing:1.5px;color:var(--text-muted);font-weight:600;margin-bottom:6px">ATTRIBUTES</div>
    ${c.members.map((m) => `<div style="display:flex;align-items:center;gap:8px;margin:5px 0">
      <span style="width:15px;height:15px;flex-shrink:0;color:${main}">${ICONS[m.icon] || ''}</span>
      <span style="font-size:11px;color:var(--text-secondary);width:76px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(m.label)}</span>
      <span style="flex:1;min-width:0;height:5px;border-radius:3px;background:var(--bg-overlay);overflow:hidden"><span style="display:block;height:100%;width:${m.pct != null ? Math.min(100, Math.max(0, m.pct)) : 0}%;background:${main}"></span></span>
      <span style="font-size:12px;font-weight:800;font-family:var(--font-display);width:30px;text-align:right">${escapeHtml(m.val)}</span>
    </div>`).join('')}
  </div>`;
}

/* DOM mirror of paintTreatmentBand (long form of the designed treatments). */
function treatmentBandHTML(cfg, v, model, opts) {
  const items = model.cells.ordered.filter((c) => v[c.key] !== false);
  const cluster = items.find((c) => c.cluster) || null;
  const skip = opts.skip || [];
  const rest = items.filter((c) => !c.cluster && !skip.includes(c.key));
  const bio = opts.bio ? bioText(cfg) : '';
  if (!cluster && !rest.length && !bio) return '';
  return `<div style="margin-top:10px${opts.pad ? `;padding:${opts.pad}` : ''}">
    <div style="font-size:9px;letter-spacing:2px;font-weight:600;color:${opts.acc};margin-bottom:6px">${opts.title}</div>
    ${cluster ? cluster.members.map((m) => `<div style="display:flex;align-items:center;gap:8px;margin:5px 0">
      <span style="font-size:11px;color:${opts.ink};width:76px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(m.label)}</span>
      <span style="flex:1;min-width:0;height:5px;border-radius:3px;background:${opts.track};overflow:hidden"><span style="display:block;height:100%;width:${m.pct != null ? Math.min(100, Math.max(0, m.pct)) : 0}%;background:${opts.acc}"></span></span>
      <span style="font-size:12px;font-weight:800;font-family:var(--font-display);color:${opts.ink};width:30px;text-align:right">${escapeHtml(m.val)}</span>
    </div>`).join('') : ''}
    ${rest.length ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px">
      ${rest.map((c) => `<div style="background:${opts.chip};border:1px solid ${opts.chipBorder};border-radius:8px;padding:6px 4px;text-align:center;min-width:0">
        <div style="font-size:12px;font-weight:800;font-family:var(--font-display);color:${opts.ink};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(c.val)}</div>
        <div style="font-size:9px;color:${opts.mut};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(c.label)}</div>
      </div>`).join('')}
    </div>` : ''}
    ${bio ? `<div style="font-size:10px;font-style:italic;color:${opts.mut};margin-top:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">“${escapeHtml(bio)}”</div>` : ''}
  </div>`;
}

/* PNG renderer: hand-drawn canvas (no new deps). The SVG-foreignObject
   snapshot approach was dropped — it renders without page CSS, so the
   export came out as bare text. Canvas draws the real card: theme
   colors, avatar, XP bar, stat grid. Exports are clean: no wallpaper and
   no particles (stage + card), only the theme base behind the card.
   Remote-https artwork is skipped (canvas taint) with a theme-wash fallback. */
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
/* Wallpaper orientation (frame editor: rotate/flip) baked into a bitmap, so
   the DOM preview cards and the canvas exports both match the live #zf-bg
   render — cover-fit then handles the swapped aspect for free. Neutral
   orientation returns the source untouched; failures fall back unrotated. */
let __wpOrient = { key: '', url: '' };
async function orientedWp(url) {
  const o = bgOrient(1, 1);
  if (!url || !o.on) return url;
  const key = `${o.r}|${o.fh}|${o.fv}|${url}`;
  if (__wpOrient.key === key) return __wpOrient.url;
  const img = await loadImg(url);
  if (!img) return url;
  try {
    const rot = o.r === 90 || o.r === 270;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, rot ? img.naturalHeight : img.naturalWidth);
    cv.height = Math.max(1, rot ? img.naturalWidth : img.naturalHeight);
    const g = cv.getContext('2d');
    g.translate(cv.width / 2, cv.height / 2);
    g.rotate((o.r * Math.PI) / 180);
    g.scale(o.fh, o.fv);
    g.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    const data = cv.toDataURL('image/jpeg', 0.92);
    __wpOrient = { key, url: data };
    return data;
  } catch { return url; } // tainted / oversized → unrotated beats blank
}
function drawCover(g, img, x, y, w, h) {
  const ir = img.naturalWidth / Math.max(1, img.naturalHeight);
  const r = w / h;
  let sw, sh, sx, sy;
  if (ir > r) { sh = img.naturalHeight; sw = sh * r; sx = (img.naturalWidth - sw) / 2; sy = 0; }
  else { sw = img.naturalWidth; sh = sw / r; sx = 0; sy = (img.naturalHeight - sh) / 2; }
  g.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}
/* Deterministic PRNG for decorative textures — same export every time. */
function seededRng(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}
function ellipsize(g, text, maxW) {
  let t = String(text ?? '');
  if (g.measureText(t).width <= maxW) return t;
  while (t.length > 1 && g.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}
function star5(g, cx, cy, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.45 : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.closePath();
}
function roundedClip(g, x, y, w, h, r) {
  rr(g, x, y, w, h, r);
  g.clip();
}

/* ── ONISEA treatmeant — wide sci-fi access credential (3:2 landscape). ──
   Dark graphite base, fine metal frame, starfield + grid, amber micro
   accents, barcode, ID-photo area, compact fields and a large rank strip.
   Decorative textures are seeded (repeatable), all text uses the registry
   model and respects the visibility flags. */
/* ── Long-form record band shared by the designed treatments ─────────────
   Stat-cluster rows + every remaining enabled cell as chips + optional
   quote, in the treatment's own palette. Measured before painting so the
   card can genuinely grow (real long variant, not a footer line). */
function bandMetrics(cfg, v, model, u, opts) {
  const items = model.cells.ordered.filter((c) => v[c.key] !== false);
  const cluster = items.find((c) => c.cluster) || null;
  const skip = opts.skip || [];
  const rest = items.filter((c) => !c.cluster && !skip.includes(c.key));
  const bio = opts.bio ? bioText(cfg) : '';
  if (!cluster && !rest.length && !bio) return null;
  const gap = u(12);
  const rows = Math.ceil(rest.length / 3);
  return {
    cluster, rest, rows, gap, bio,
    h: u(40) + (cluster ? cluster.members.length * u(54) + u(14) : 0) + (rows ? rows * u(86) + (rows - 1) * gap : 0) + (bio ? u(34) : 0),
  };
}
function paintTreatmentBand(g, x, y, w, m, cfg, u, c) {
  g.fillStyle = c.acc; g.font = `600 ${u(15)}px ${DISP}`;
  try { g.letterSpacing = `${u(3)}px`; } catch {}
  g.fillText(c.title, x, y + u(12));
  try { g.letterSpacing = '0px'; } catch {}
  let yy = y + u(40);
  if (m.cluster) {
    g.fillStyle = c.accA(0.55); g.fillRect(x, yy - u(12), Math.max(2, u(3)), m.cluster.members.length * u(54) - u(6));
    for (const mm of m.cluster.members) {
      g.fillStyle = c.ink; g.font = `700 ${u(24)}px ${DISP}`;
      g.fillText(ellipsize(g, mm.label, w * 0.42), x + u(18), yy + u(24));
      g.textAlign = 'right'; g.font = `800 ${u(26)}px ${DISP}`;
      g.fillText(ellipsize(g, mm.val, w * 0.3), x + w, yy + u(24));
      g.textAlign = 'left';
      if (mm.pct != null) {
        const bw = w - u(18);
        g.fillStyle = c.track; rr(g, x + u(18), yy + u(36), bw, u(6), u(3)); g.fill();
        if (mm.pct > 0) { g.fillStyle = c.acc; rr(g, x + u(18), yy + u(36), Math.max(u(6), (bw * Math.min(100, mm.pct)) / 100), u(6), u(3)); g.fill(); }
      }
      yy += u(54);
    }
    yy += u(14);
  }
  const chipW = (w - 2 * m.gap) / 3;
  m.rest.forEach((cell, i) => {
    const cx = x + (i % 3) * (chipW + m.gap);
    const cy = yy + Math.floor(i / 3) * (u(86) + m.gap);
    g.fillStyle = c.chip; rr(g, cx, cy, chipW, u(86), u(12)); g.fill();
    g.strokeStyle = c.chipBorder; g.lineWidth = 1; rr(g, cx, cy, chipW, u(86), u(12)); g.stroke();
    g.fillStyle = c.ink; g.font = `800 ${u(26)}px ${DISP}`; g.textAlign = 'center';
    g.fillText(ellipsize(g, cell.val, chipW - u(14)), cx + chipW / 2, cy + u(38));
    g.fillStyle = c.mut; g.font = `500 ${u(15)}px ${DISP}`;
    g.fillText(ellipsize(g, cell.label, chipW - u(12)), cx + chipW / 2, cy + u(64));
    g.textAlign = 'left';
  });
  if (m.rows) yy += m.rows * u(86) + (m.rows - 1) * m.gap;
  if (m.bio) {
    g.fillStyle = c.mut; g.font = `italic 500 ${u(19)}px ${DISP}`;
    g.fillText(ellipsize(g, `“${m.bio}”`, w), x, yy + u(12));
  }
}

async function paintOnisea(g, dx, dy, W, cfg, st, v, model) {
  const s = W / 1080;
  const u = (n) => n * s;
  // Long form: the credential + a full service record band, rank strip
  // pinned to the bottom. Short keeps the exact original composition.
  const bm = cfg.variant === 'long' ? bandMetrics(cfg, v, model, u, { skip: ['streak', 'achCount'], bio: false }) : null;
  const H = Math.round(720 * s) + (bm ? bm.h + u(180) : 0);
  // Amber is the treatment's identity accent; a chosen card accent replaces
  // it (all translucent accents derive from the same source for coherence).
  const accN = accentPair(cfg);
  const amber = accN ? accN.main : '#e8a33d';
  const amberA = (a) => (accN ? accN.rgba(a) : `rgba(232,163,61,${a})`);
  const base = '#0a0d13', edge = '#3a4152', ink = '#eef2f7', mut = '#8b93a7';
  const rankC = RANK_COLORS[st.rank] || amber;
  const pic = await loadImg(safePic(S.profilePic) || S.profilePic);

  g.save();
  roundedClip(g, dx, dy, W, H, u(18));
  g.fillStyle = base; g.fillRect(dx, dy, W, H);
  // starfield (seeded) + faint grid
  const rnd = seededRng(1337);
  for (let i = 0; i < 110; i++) {
    const x = dx + rnd() * W, y = dy + rnd() * H;
    g.fillStyle = i % 14 === 0 ? amberA((0.10 + rnd() * 0.16).toFixed(2)) : `rgba(255,255,255,${(0.03 + rnd() * 0.16).toFixed(2)})`;
    g.beginPath(); g.arc(x, y, u(0.6 + rnd() * 1.3), 0, 7); g.fill();
  }
  g.strokeStyle = 'rgba(255,255,255,0.035)'; g.lineWidth = 1;
  for (let x = dx + u(80); x < dx + W; x += u(80)) { g.beginPath(); g.moveTo(x, dy); g.lineTo(x, dy + H); g.stroke(); }
  for (let y = dy + u(80); y < dy + H; y += u(80)) { g.beginPath(); g.moveTo(dx, y); g.lineTo(dx + W, y); g.stroke(); }

  // photo area
  const px = dx + u(36), py = dy + u(36), pw = u(300), ph = u(372);
  if (pic) { g.save(); roundedClip(g, px, py, pw, ph, u(8)); drawCover(g, pic, px, py, pw, ph); g.restore(); }
  else {
    g.fillStyle = '#151b28'; rr(g, px, py, pw, ph, u(8)); g.fill();
    g.fillStyle = amberA(0.85); g.font = `800 ${u(150)}px ${DISP}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(((st.name || 'H')[0] || 'H').toUpperCase(), px + pw / 2, py + ph / 2);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }
  g.strokeStyle = amberA(0.45); g.lineWidth = u(2);
  rr(g, px, py, pw, ph, u(8)); g.stroke();
  // barcode under photo
  g.save(); g.beginPath(); g.rect(px, py + ph + u(20), pw, u(44)); g.clip();
  const brnd = seededRng(77);
  for (let x = px; x < px + pw; x += u(3 + brnd() * 5)) {
    g.fillStyle = `rgba(238,242,247,${(0.35 + brnd() * 0.5).toFixed(2)})`;
    g.fillRect(x, py + ph + u(20), u(1 + brnd() * 2.4), u(44));
  }
  g.restore();
  g.fillStyle = mut; g.font = `500 ${u(15)}px ${DISP}`;
  try { g.letterSpacing = `${u(3)}px`; } catch {}
  g.fillText('ACCESS CREDENTIAL', px, py + ph + u(92));
  try { g.letterSpacing = '0px'; } catch {}

  // right column
  const rx = dx + u(380);
  const colW = W - u(380) - u(36);
  g.fillStyle = amber; g.font = `600 ${u(15)}px ${DISP}`;
  try { g.letterSpacing = `${u(3.5)}px`; } catch {}
  g.fillText('ZENFIT // OPERATIONS', rx, dy + u(70));
  try { g.letterSpacing = '0px'; } catch {}
  g.fillStyle = ink; g.font = `800 ${u(56)}px ${DISP}`;
  g.fillText(ellipsize(g, String(model.identity.name || 'HUNTER').toUpperCase(), colW - u(130)), rx, dy + u(132));
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(rx, dy + u(172)); g.lineTo(rx + colW, dy + u(172)); g.stroke();
  // bio — under the name, above the compact fields
  const oniBio = !!(v.bio !== false && model.bio);
  if (oniBio) {
    g.fillStyle = mut; g.font = `italic 500 ${u(24)}px ${DISP}`;
    const words = String(model.bio).split(/\s+/); const lines = []; let line = '';
    for (const wd of words) { const t2 = line ? `${line} ${wd}` : wd; if (g.measureText(t2).width > colW && line) { lines.push(line); line = wd; if (lines.length === 2) break; } else line = t2; }
    if (line && lines.length < 2) lines.push(line);
    lines.slice(0, 2).forEach((ln, i) => g.fillText(ellipsize(g, ln, colW), rx, dy + u(206) + i * u(30)));
  }
  // rank chip (top-right)
  if (v.rank) {
    const cx = dx + W - u(36) - u(104);
    g.strokeStyle = amberA(0.55); g.lineWidth = u(2);
    rr(g, cx, dy + u(52), u(104), u(104), u(10)); g.stroke();
    g.fillStyle = rankC; g.font = `800 ${u(56)}px ${DISP}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(st.rank || '—'), cx + u(52), dy + u(106));
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }
  // compact fields (gated)
  const rows = [];
  if (v.level) rows.push(['LEVEL', `Lv ${st.level}`]);
  if (v.xp) rows.push(['EXPERIENCE', `${st.xp ?? 0} XP`]);
  if (v.achCount) rows.push(['ACHIEVEMENTS', `${model.ctx.achN}/${model.ctx.achTotal}`]);
  if (v.streak) rows.push(['STREAK', `${currentStreak()}d`]);
  let ry = dy + u(oniBio ? 300 : 224);
  for (const [cap, val] of rows.slice(0, 4)) {
    g.fillStyle = amber; g.font = `600 ${u(14)}px ${DISP}`;
    try { g.letterSpacing = `${u(2)}px`; } catch {}
    g.fillText(cap, rx, ry);
    try { g.letterSpacing = '0px'; } catch {}
    g.fillStyle = ink; g.font = `700 ${u(30)}px ${DISP}`;
    g.fillText(ellipsize(g, val, colW), rx, ry + u(36));
    ry += u(64);
  }
  if (bm) paintTreatmentBand(g, dx + u(36), dy + u(596), W - u(72), bm, cfg, u, {
    title: 'SERVICE RECORD', acc: amber, accA: amberA, ink, mut,
    track: 'rgba(255,255,255,0.08)', chip: 'rgba(255,255,255,0.045)', chipBorder: 'rgba(255,255,255,0.09)',
  });
  // large rank strip (rank visibility respected)
  if (v.rank) {
    const sy = dy + H - u(152), sh = u(116), sx = dx + u(36), sw = W - u(72);
    g.fillStyle = 'rgba(255,255,255,0.045)'; rr(g, sx, sy, sw, sh, u(8)); g.fill();
    g.fillStyle = amber; g.fillRect(sx, sy, u(4), sh);
    g.fillStyle = ink; g.font = `800 ${u(84)}px ${DISP}`;
    g.textBaseline = 'middle';
    g.fillText(String(st.rank || '—'), sx + u(26), sy + sh / 2 + u(2));
    const lw = g.measureText(String(st.rank || '—')).width;
    g.fillStyle = mut; g.font = `600 ${u(16)}px ${DISP}`;
    try { g.letterSpacing = `${u(3)}px`; } catch {}
    g.fillText('HUNTER CLASS', sx + u(26) + lw + u(26), sy + sh / 2 - u(10));
    try { g.letterSpacing = '0px'; } catch {}
    g.fillStyle = amber; g.font = `600 ${u(15)}px ${DISP}`;
    g.fillText(`// ${ellipsize(g, st.name || 'HUNTER', u(240)).toUpperCase()}`, sx + u(26) + lw + u(26), sy + sh / 2 + u(22));
    g.textBaseline = 'alphabetic';
    // corner ticks on the strip
    g.strokeStyle = amberA(0.8); g.lineWidth = u(2);
    g.beginPath(); g.moveTo(sx + sw - u(30), sy + u(12)); g.lineTo(sx + sw - u(12), sy + u(12)); g.lineTo(sx + sw - u(12), sy + u(30)); g.stroke();
  }
  // corner ticks on the card
  g.strokeStyle = amberA(0.7); g.lineWidth = u(2);
  const tick = u(24), off = u(14);
  [[dx + off, dy + off, 1, 1], [dx + W - off, dy + off, -1, 1], [dx + off, dy + H - off, 1, -1], [dx + W - off, dy + H - off, -1, -1]]
    .forEach(([x, y, sx2, sy2]) => { g.beginPath(); g.moveTo(x + sx2 * tick, y); g.lineTo(x, y); g.lineTo(x, y + sy2 * tick); g.stroke(); });
  g.restore();
  // metal frame (unclipped stroke)
  const grd = g.createLinearGradient(dx, dy, dx + W, dy + H);
  grd.addColorStop(0, 'rgba(88,98,120,0.9)'); grd.addColorStop(0.5, 'rgba(40,46,60,0.9)'); grd.addColorStop(1, 'rgba(88,98,120,0.85)');
  g.strokeStyle = grd; g.lineWidth = Math.max(2, u(3));
  rr(g, dx + u(1.5), dy + u(1.5), W - u(3), H - u(3), u(18)); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1;
  rr(g, dx + u(9), dy + u(9), W - u(18), H - u(18), u(12)); g.stroke();
  return H;
}

/* ── Anime collector treatment — portrait collectible (2:3). ─────────────
   Soft teal canvas, inset white frame, artwork hero, translucent teal
   panel with name / level / rank, achievement stars, bio and a compact
   ability strip of the visible grid cells. No bundled art or logos. */
async function paintAnime(g, dx, dy, W, cfg, st, v, model) {
  const s = W / 720;
  const u = (n) => n * s;
  // Long form: the collectible + a full record band between the bio and the
  // ability strip. Short keeps the exact original composition.
  const strip = model.cells.ordered.filter((c) => !c.cluster && v[c.key] !== false).slice(0, 4);
  const bm = cfg.variant === 'long' ? bandMetrics(cfg, v, model, u, { skip: strip.map((c) => c.key), bio: false }) : null;
  const H = Math.round(1080 * s) + (bm ? bm.h + u(28) : 0);
  // Deep teal is the treatment's identity accent; a chosen card accent
  // replaces it, and chip text flips to dark ink when the accent is light.
  const accN = accentPair(cfg);
  const accent = accN ? accN.main : '#1f6f63';
  const accentA = (a) => (accN ? accN.rgba(a) : `rgba(31,111,99,${a})`);
  const accentLum = (() => { const n = parseInt(accent.slice(1), 16); return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); })();
  const onAccent = accentLum > 150 ? '#10312c' : '#ffffff';
  const canvasC = '#b9e2d8', ink = '#10312c', sub = '#3f6f66';
  const pic = await loadImg(safePic(S.profilePic) || S.profilePic);

  g.save();
  roundedClip(g, dx, dy, W, H, u(30));
  g.fillStyle = canvasC; g.fillRect(dx, dy, W, H);
  g.fillStyle = '#ffffff'; rr(g, dx + u(14), dy + u(14), W - u(28), H - u(28), u(22)); g.fill();
  // hero artwork
  const hx = dx + u(30), hy = dy + u(30), hw = W - u(60), hh = u(560);
  if (pic) { g.save(); roundedClip(g, hx, hy, hw, hh, u(18)); drawCover(g, pic, hx, hy, hw, hh); g.restore(); }
  else {
    g.fillStyle = '#dfeee9'; rr(g, hx, hy, hw, hh, u(18)); g.fill();
    g.fillStyle = accentA(0.9); g.font = `800 ${u(190)}px ${DISP}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(((st.name || 'H')[0] || 'H').toUpperCase(), hx + hw / 2, hy + hh / 2);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }
  // emblem (rank gate)
  if (v.rank) {
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.beginPath(); g.arc(hx + u(56), hy + u(56), u(40), 0, 7); g.fill();
    g.strokeStyle = accent; g.lineWidth = u(3);
    g.beginPath(); g.arc(hx + u(56), hy + u(56), u(40), 0, 7); g.stroke();
    g.fillStyle = ink; g.font = `800 ${u(40)}px ${DISP}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(st.rank || '—'), hx + u(56), hy + u(58));
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }
  // achievement stars (achievement gate)
  if (v.achCount) {
    const n = Math.min(5, Math.max(0, Math.round(model.ctx.achPct / 20)));
    for (let i = 0; i < 5; i++) {
      const cx = hx + hw - u(32) - i * u(38), cy = hy + u(50);
      if (i < n) { g.fillStyle = '#f2b64a'; star5(g, cx, cy, u(15)); g.fill(); }
      else { g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = u(2); star5(g, cx, cy, u(14)); g.stroke(); }
    }
  }
  // info panel
  const pay = dy + u(620), ph = H - u(650);
  g.fillStyle = 'rgba(255,255,255,0.55)'; rr(g, dx + u(30), pay, W - u(60), ph, u(20)); g.fill();
  g.strokeStyle = accentA(0.28); g.lineWidth = u(2);
  rr(g, dx + u(30), pay, W - u(60), ph, u(20)); g.stroke();
  const px = dx + u(54);
  g.fillStyle = ink; g.font = `800 ${u(52)}px ${DISP}`;
  // long names scale to fit the info panel instead of truncating
  const anName = String(st.name || 'HUNTER');
  const anMax = W - u(108);
  const anW = g.measureText(anName).width;
  if (anW > anMax) g.font = `800 ${Math.max(u(26), Math.floor((u(52) * anMax) / anW) - 1)}px ${DISP}`;
  g.fillText(ellipsize(g, anName, anMax), px, pay + u(72));
  let chipX = px;
  const chip = (text, filled) => {
    g.font = `700 ${u(24)}px ${DISP}`;
    const w = g.measureText(text).width + u(36);
    if (filled) { g.fillStyle = accent; rr(g, chipX, pay + u(94), w, u(46), u(23)); g.fill(); g.fillStyle = onAccent; }
    else { g.strokeStyle = accent; g.lineWidth = u(2); rr(g, chipX, pay + u(94), w, u(46), u(23)); g.stroke(); g.fillStyle = accent; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, chipX + w / 2, pay + u(118));
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    chipX += w + u(10);
  };
  if (v.level) chip(`Lv ${st.level}`, true);
  if (v.rank) chip(`RANK ${st.rank}`, false);
  // bio (max 2 wrapped lines)
  if (model.bio) {
    g.fillStyle = sub; g.font = `500 ${u(25)}px ${DISP}`;
    const maxW = W - u(108);
    const words = String(model.bio).split(/\s+/);
    const lines = [];
    let line = '';
    for (const wd of words) {
      const t = line ? `${line} ${wd}` : wd;
      if (g.measureText(t).width > maxW && line) { lines.push(line); line = wd; if (lines.length === 2) break; } else line = t;
    }
    if (line && lines.length < 2) lines.push(line);
    lines.slice(0, 2).forEach((ln, i) => g.fillText(ellipsize(g, ln, maxW), px, pay + u(186) + i * u(32)));
  }
  if (bm) paintTreatmentBand(g, dx + u(54), pay + u(268), W - u(108), bm, cfg, u, {
    title: 'FULL RECORD', acc: accent, accA: accentA, ink, mut: sub,
    track: 'rgba(16,49,44,0.10)', chip: 'rgba(255,255,255,0.72)', chipBorder: accentA(0.25),
  });
  // ability strip — visible grid cells (max 4)
  const cells = strip;
  if (cells.length) {
    const gap = u(12), sw = (W - u(108) - gap * (cells.length - 1)) / cells.length;
    const sy = pay + ph - u(116);
    cells.forEach((c, i) => {
      const cx = px + i * (sw + gap);
      g.fillStyle = 'rgba(255,255,255,0.72)'; rr(g, cx, sy, sw, u(92), u(14)); g.fill();
      g.fillStyle = ink;
      // long values scale to the cell instead of ellipsizing
      const cTxt = String(c.val == null ? '' : c.val);
      const cMax = sw - u(16);
      g.font = `800 ${u(30)}px ${DISP}`;
      const cW = g.measureText(cTxt).width;
      if (cW > cMax) g.font = `800 ${Math.max(u(16), Math.floor((u(30) * cMax) / cW) - 1)}px ${DISP}`;
      g.textAlign = 'center';
      g.fillText(ellipsize(g, cTxt, cMax), cx + sw / 2, sy + u(40));
      g.fillStyle = sub; g.font = `500 ${u(16)}px ${DISP}`;
      g.fillText(ellipsize(g, c.label, sw - u(14)), cx + sw / 2, sy + u(68));
      g.textAlign = 'left';
    });
  }
  g.restore();
  g.strokeStyle = accentA(0.35); g.lineWidth = Math.max(2, u(3));
  rr(g, dx + u(1.5), dy + u(1.5), W - u(3), H - u(3), u(30)); g.stroke();
  return H;
}
const DISP = `'Syne','Inter',system-ui,sans-serif`;

/* Card chrome, single-sourced from the skin tokens (mirrors css/skins/* +
   --radius-*: liquid 14 / brutalist 4 / hud 3 + 12px cuts / neomorph 20,
   cells liquid 12 / brutalist 4). Export measures the live
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
function cardPath(g, dx, dy, W, H, style) {
  const px = SKIN_PX[style] || SKIN_PX.liquid;
  const cut = px.clip * __pxk;
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
/* Rank → operator title (presentation mapping of the real rank). */
const RANK_TITLES = { S: 'COMMANDER', A: 'ELITE', B: 'VETERAN', C: 'SPECIALIST', D: 'OPERATOR', E: 'RECRUIT' };

/* ── Poster treatment — typographic poster (760×1060). ───────────────────
   Dark textured ground, frosted translucent panel, oversized display
   name, spaced subtitle, italic quote, halftone-dotted avatar inset.
   No bundled art or logos. */
async function paintPoster(g, dx, dy, W, cfg, st, v, model) {
  const s = W / 760;
  const u = (n) => n * s;
  const accN = accentPair(cfg);
  const accent = accN ? accN.main : '#e0526e';
  const accA = (a) => (accN ? accN.rgba(a) : `rgba(224,82,110,${a})`);
  const ink = '#f5f2f4', mut = 'rgba(245,242,244,0.62)';
  const bm = cfg.variant === 'long' ? bandMetrics(cfg, v, model, u, { skip: ['streak', 'achCount'], bio: false }) : null;
  const H = Math.round(1060 * s) + (bm ? bm.h + u(60) : 0);
  const pic = await loadImg(safePic(S.profilePic) || S.profilePic);

  g.save();
  roundedClip(g, dx, dy, W, H, u(24));
  {
    // Ground: full-bleed wallpaper + scrim when set, else the treatment gradient.
    let wpPost = null;
    if (cfg.cardBackdrop === 'wallpaper' && S.bgImage) {
      try { wpPost = await loadImg(await orientedWp(await resolveBgSrc(S.bgImage))); } catch { wpPost = null; }
    }
    if (wpPost) {
      drawCover(g, wpPost, dx, dy, W, H);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(dx, dy, W, H);
    } else {
      const grd = g.createLinearGradient(dx, dy, dx + W * 0.6, dy + H);
      grd.addColorStop(0, '#231a20'); grd.addColorStop(0.55, '#141018'); grd.addColorStop(1, '#0c0a10');
      g.fillStyle = grd; g.fillRect(dx, dy, W, H);
    }
  }
  const glow = g.createRadialGradient(dx + W * 0.72, dy + u(240), u(40), dx + W * 0.72, dy + u(240), u(430));
  glow.addColorStop(0, accA(0.28)); glow.addColorStop(1, accA(0));
  g.fillStyle = glow; g.fillRect(dx, dy, W, H);
  // frosted panel
  const px2 = dx + u(48), pw2 = W - u(96);
  g.fillStyle = 'rgba(255,255,255,0.07)';
  rr(g, px2, dy + u(210), pw2, u(500), u(18)); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 1;
  rr(g, px2, dy + u(210), pw2, u(500), u(18)); g.stroke();
  g.fillStyle = accent; g.font = `600 ${u(16)}px ${DISP}`;
  try { g.letterSpacing = `${u(4)}px`; } catch {}
  g.fillText('ZENFIT · HUNTER ARCHIVE', px2 + u(28), dy + u(268));
  try { g.letterSpacing = `${u(1)}px`; } catch {}
  g.fillStyle = ink; g.font = `800 ${u(104)}px ${DISP}`;
  // long names scale to fit the panel instead of truncating (floor 30 keeps it legible)
  const nameT = (st.name || 'HUNTER').toUpperCase();
  const nmax = pw2 - u(56);
  const nw = g.measureText(nameT).width;
  if (nw > nmax) g.font = `800 ${Math.max(u(30), Math.floor((u(104) * nmax) / nw) - 1)}px ${DISP}`;
  g.fillText(ellipsize(g, nameT, nmax), px2 + u(28), dy + u(390));
  try { g.letterSpacing = '0px'; } catch {}
  const sub = [v.level ? `LEVEL ${st.level}` : '', v.rank ? `RANK ${st.rank}` : ''].filter(Boolean).join('  ·  ');
  if (sub) {
    g.fillStyle = mut; g.font = `600 ${u(18)}px ${DISP}`;
    try { g.letterSpacing = `${u(5)}px`; } catch {}
    g.fillText(sub, px2 + u(30), dy + u(444));
    try { g.letterSpacing = '0px'; } catch {}
  }
  if (v.bio !== false && model.bio) {
    g.fillStyle = mut; g.font = `italic 500 ${u(24)}px ${DISP}`;
    const words = String(model.bio).split(/\s+/); const lines = []; let line = '';
    for (const wd of words) { const t2 = line ? `${line} ${wd}` : wd; if (g.measureText(t2).width > pw2 - u(56) && line) { lines.push(line); line = wd; if (lines.length === 2) break; } else line = t2; }
    if (line && lines.length < 2) lines.push(line);
    lines.slice(0, 2).forEach((ln, i) => g.fillText(ln, px2 + u(30), dy + u(506) + i * u(34)));
  }
  // halftone inset (overlaps the panel's lower-right corner)
  const hw2 = u(268), hx2 = dx + W - u(48) - hw2, hy2 = dy + u(596);
  g.save();
  roundedClip(g, hx2, hy2, hw2, hw2, u(14));
  if (pic) drawCover(g, pic, hx2, hy2, hw2, hw2);
  else {
    g.fillStyle = accA(0.35); g.fillRect(hx2, hy2, hw2, hw2);
    g.fillStyle = accent; g.font = `800 ${u(120)}px ${DISP}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(((st.name || 'H')[0] || 'H').toUpperCase(), hx2 + hw2 / 2, hy2 + hw2 / 2 + u(6));
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }
  // dotted screen over the primary image (Design → Poster dots)
  if (cfg.posterDots !== false) {
    const step = u(7);
    g.globalCompositeOperation = 'overlay';
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let yy2 = step / 2; yy2 < hw2; yy2 += step) for (let xx2 = step / 2; xx2 < hw2; xx2 += step) { g.beginPath(); g.arc(hx2 + xx2, hy2 + yy2, u(1.6), 0, 7); g.fill(); }
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = 'rgba(10,6,12,0.45)';
    for (let yy2 = 0; yy2 < hw2; yy2 += step) for (let xx2 = 0; xx2 < hw2; xx2 += step) { g.beginPath(); g.arc(hx2 + xx2, hy2 + yy2, u(1.2), 0, 7); g.fill(); }
    g.globalCompositeOperation = 'source-over';
  }
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = u(2);
  rr(g, hx2, hy2, hw2, hw2, u(14)); g.stroke();
  // caption
  const cap = [v.achCount ? `${model.ctx.achN}/${model.ctx.achTotal} ACHIEVEMENTS` : '', v.streak ? `STREAK ${currentStreak()}D` : ''].filter(Boolean).join(' · ');
  if (cap) {
    g.fillStyle = mut; g.font = `600 ${u(15)}px ${DISP}`;
    try { g.letterSpacing = `${u(3)}px`; } catch {}
    g.fillText(cap, dx + u(48), dy + u(940));
    try { g.letterSpacing = '0px'; } catch {}
  }
  if (bm) paintTreatmentBand(g, dx + u(48), dy + u(1034), W - u(96), bm, cfg, u, {
    title: 'FULL RECORD', acc: accent, accA, ink, mut,
    track: 'rgba(255,255,255,0.10)', chip: 'rgba(255,255,255,0.06)', chipBorder: 'rgba(255,255,255,0.14)',
  });
  g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = u(2);
  rr(g, dx + u(16), dy + u(16), W - u(32), H - u(32), u(18)); g.stroke();
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = Math.max(1, u(2));
  rr(g, dx + u(1), dy + u(1), W - u(2), H - u(2), u(24)); g.stroke();
  return H;
}

/* ── Operator ID treatment — brushed-metal tactical ID (1040×680). ──────
   Emblem watermark, dotted corner, photo box, call sign / title block,
   barcode and a bottom operations strip. No bundled art or logos. */
async function paintOperator(g, dx, dy, W, cfg, st, v, model) {
  const s = W / 1040;
  const u = (n) => n * s;
  const accN = accentPair(cfg);
  const accent = accN ? accN.main : '#aebdcc';
  const accA = (a) => (accN ? accN.rgba(a) : `rgba(174,189,204,${a})`);
  const ink = '#e8ecf1', mut = '#8d97a5';
  const bm = cfg.variant === 'long' ? bandMetrics(cfg, v, model, u, { skip: ['streak', 'achCount'], bio: false }) : null;
  const H = Math.round(680 * s) + (bm ? bm.h + u(140) : 0);
  const pic = await loadImg(safePic(S.profilePic) || S.profilePic);

  g.save();
  roundedClip(g, dx, dy, W, H, u(16));
  const grd = g.createLinearGradient(dx, dy, dx + W, dy + H);
  grd.addColorStop(0, '#2c313a'); grd.addColorStop(0.5, '#171a20'); grd.addColorStop(1, '#262b33');
  g.fillStyle = grd; g.fillRect(dx, dy, W, H);
  const rnd = seededRng(909);
  for (let i = 0; i < 120; i++) {
    g.fillStyle = `rgba(255,255,255,${(0.015 + rnd() * 0.03).toFixed(3)})`;
    g.fillRect(dx, dy + rnd() * H, W, u(0.8 + rnd() * 1.4));
  }
  // emblem watermark
  g.save(); g.globalAlpha = 0.06; g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = u(4);
  const ex = dx + W * 0.62, ey = dy + H * 0.42;
  g.beginPath(); g.arc(ex, ey, u(210), 0, 7); g.stroke();
  g.beginPath(); g.arc(ex, ey, u(150), 0, 7); g.stroke();
  g.beginPath();
  g.moveTo(ex, ey - u(120));
  g.quadraticCurveTo(ex, ey, ex + u(120), ey);
  g.quadraticCurveTo(ex, ey, ex, ey + u(120));
  g.quadraticCurveTo(ex, ey, ex - u(120), ey);
  g.quadraticCurveTo(ex, ey, ex, ey - u(120));
  g.fill();
  g.restore();
  // dotted texture (top-left)
  g.fillStyle = 'rgba(255,255,255,0.16)';
  for (let yy2 = 0; yy2 < 9; yy2++) for (let xx2 = 0; xx2 < 9; xx2++) { g.beginPath(); g.arc(dx + u(36) + xx2 * u(11), dy + u(36) + yy2 * u(11), u(1.4), 0, 7); g.fill(); }
  // photo box
  const phx = dx + u(44), phy = dy + u(110), phw = u(288), phh = u(356);
  g.save(); roundedClip(g, phx, phy, phw, phh, u(8));
  if (pic) drawCover(g, pic, phx, phy, phw, phh);
  else {
    g.fillStyle = '#11151b'; g.fillRect(phx, phy, phw, phh);
    g.fillStyle = accent; g.font = `800 ${u(120)}px ${DISP}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(((st.name || 'H')[0] || 'H').toUpperCase(), phx + phw / 2, phy + phh / 2 + u(6));
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }
  g.restore();
  g.strokeStyle = accA(0.5); g.lineWidth = u(2); rr(g, phx, phy, phw, phh, u(8)); g.stroke();
  // emblem diamond under the photo
  const dpx = phx + phw / 2, dpy = phy + phh + u(46);
  g.strokeStyle = accA(0.8); g.lineWidth = u(2);
  g.beginPath(); g.moveTo(dpx, dpy - u(26)); g.lineTo(dpx + u(20), dpy); g.lineTo(dpx, dpy + u(26)); g.lineTo(dpx - u(20), dpy); g.closePath(); g.stroke();
  g.beginPath(); g.moveTo(dpx - u(8), dpy); g.lineTo(dpx + u(8), dpy); g.stroke();
  // right column
  const rx = dx + u(392), rw = W - u(392) - u(44);
  g.fillStyle = mut; g.font = `600 ${u(14)}px ${DISP}`;
  try { g.letterSpacing = `${u(4)}px`; } catch {}
  g.fillText('CALL SIGN', rx, dy + u(140));
  try { g.letterSpacing = `${u(1)}px`; } catch {}
  g.fillStyle = ink; g.font = `800 ${u(56)}px ${DISP}`;
  g.fillText(ellipsize(g, (st.name || 'OPERATOR').toUpperCase(), rw), rx, dy + u(206));
  try { g.letterSpacing = `${u(4)}px`; } catch {}
  g.fillStyle = mut; g.font = `600 ${u(14)}px ${DISP}`;
  g.fillText('TITLE', rx, dy + u(262));
  try { g.letterSpacing = '0px'; } catch {}
  g.fillStyle = accent; g.font = `700 ${u(30)}px ${DISP}`;
  g.fillText(`${RANK_TITLES[st.rank] || 'OPERATOR'}${v.rank ? ` · RANK ${st.rank}` : ''}`, rx, dy + u(302));
  const info = [];
  if (v.level) info.push(`LV ${st.level}`);
  if (v.xp) info.push(`${st.xp} XP`);
  if (v.streak) info.push(`STREAK ${currentStreak()}D`);
  if (v.achCount) info.push(`${model.ctx.achN}/${model.ctx.achTotal} ACH`);
  if (info.length) { g.fillStyle = mut; g.font = `500 ${u(21)}px ${DISP}`; g.fillText(info.join('   ·   '), rx, dy + u(368)); }
  g.fillStyle = mut; g.font = `italic 500 ${u(20)}px ${DISP}`;
  const quote = v.bio !== false && model.bio ? `“${model.bio}”` : 'DAILY OBJECTIVES IN EFFECT — MAINTAIN STREAK INTEGRITY.';
  {
    const words = quote.split(/\s+/); const lines = []; let line = '';
    for (const wd of words) { const t2 = line ? `${line} ${wd}` : wd; if (g.measureText(t2).width > rw && line) { lines.push(line); line = wd; if (lines.length === 2) break; } else line = t2; }
    if (line && lines.length < 2) lines.push(line);
    lines.slice(0, 2).forEach((ln, i) => g.fillText(ellipsize(g, ln, rw), rx, dy + u(418) + i * u(28)));
  }
  // barcode + caption
  g.save(); g.beginPath(); g.rect(rx, dy + u(468), rw * 0.7, u(40)); g.clip();
  const brnd = seededRng(31);
  for (let x = rx; x < rx + rw * 0.7; x += u(3 + brnd() * 5)) {
    g.fillStyle = `rgba(232,236,241,${(0.3 + brnd() * 0.5).toFixed(2)})`;
    g.fillRect(x, dy + u(468), u(1 + brnd() * 2.2), u(40));
  }
  g.restore();
  g.fillStyle = mut; g.font = `600 ${u(13)}px ${DISP}`;
  try { g.letterSpacing = `${u(3)}px`; } catch {}
  g.fillText('OPERATOR ID CARD', rx, dy + u(534));
  try { g.letterSpacing = '0px'; } catch {}
  if (bm) paintTreatmentBand(g, dx + u(44), dy + u(704), W - u(88), bm, cfg, u, {
    title: 'SERVICE LOG', acc: accent, accA, ink, mut,
    track: 'rgba(255,255,255,0.10)', chip: 'rgba(255,255,255,0.05)', chipBorder: 'rgba(255,255,255,0.12)',
  });
  // bottom strip (footer)
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(dx, H - u(76), W, u(76));
  g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(dx, H - u(76)); g.lineTo(dx + W, H - u(76)); g.stroke();
  g.fillStyle = ink; g.font = `700 ${u(17)}px ${DISP}`;
  try { g.letterSpacing = `${u(3)}px`; } catch {}
  g.fillText('ZENFIT GLOBAL OPERATIONS', dx + u(44), H - u(30));
  try { g.letterSpacing = '0px'; } catch {}
  g.fillStyle = mut; g.font = `500 ${u(14)}px ${DISP}`;
  g.textAlign = 'right'; g.fillText('LOCAL EXPORT · NOTHING UPLOADED', dx + W - u(44), H - u(30)); g.textAlign = 'left';
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = Math.max(1, u(2));
  rr(g, dx + u(1), dy + u(1), W - u(2), H - u(2), u(16)); g.stroke();
  return H;
}

/* ── System Panel treatment — neon status window (760×1140). ─────────────
   Black ground, glowing double frame with corner brackets, level crystal,
   PLAYER INFO header, portrait/name/level/rank strip, bio and WARNING
   block. No bundled art or logos. */
async function paintSystem(g, dx, dy, W, cfg, st, v, model) {
  const s = W / 760;
  const u = (n) => n * s;
  const accN = accentPair(cfg);
  const accent = accN ? accN.main : '#58c8ff';
  const accA = (a) => (accN ? accN.rgba(a) : `rgba(88,200,255,${a})`);
  const ink = '#dce8f2', mut = '#6f8296';
  const qp = questProgress();
  // streak/achievements live in the footer — the band carries the stat cells
  // and the window's own name strip carries the bio, so nothing repeats
  const bm = cfg.variant === 'long' ? bandMetrics(cfg, v, model, u, { skip: ['streak', 'achCount'], bio: false }) : null;
  const H = Math.round(1140 * s) + (bm ? bm.h + u(140) : 0);
  const pic = await loadImg(safePic(S.profilePic) || S.profilePic);

  g.save();
  roundedClip(g, dx, dy, W, H, u(20));
  g.fillStyle = '#05070d'; g.fillRect(dx, dy, W, H);
  const glowG = g.createRadialGradient(dx + W / 2, dy + u(40), u(10), dx + W / 2, dy + u(40), u(560));
  glowG.addColorStop(0, accA(0.16)); glowG.addColorStop(1, accA(0));
  g.fillStyle = glowG; g.fillRect(dx, dy, W, H);
  const rnd = seededRng(555);
  for (let i = 0; i < 90; i++) {
    g.fillStyle = accA((0.05 + rnd() * 0.1).toFixed(2));
    g.fillRect(dx + rnd() * W, dy + rnd() * u(600), u(1.3), u(1.3));
  }
  // neon frame + corner brackets
  g.save();
  g.shadowColor = accent; g.shadowBlur = u(16);
  g.strokeStyle = accA(0.9); g.lineWidth = u(3);
  rr(g, dx + u(12), dy + u(12), W - u(24), H - u(24), u(14)); g.stroke();
  g.restore();
  g.strokeStyle = accA(0.28); g.lineWidth = u(2);
  rr(g, dx + u(22), dy + u(22), W - u(44), H - u(44), u(10)); g.stroke();
  g.strokeStyle = accA(0.95); g.lineWidth = u(3);
  const bk = u(46), bo = u(10);
  [[dx + bo, dy + bo, 1, 1], [dx + W - bo, dy + bo, -1, 1], [dx + bo, dy + H - bo, 1, -1], [dx + W - bo, dy + H - bo, -1, -1]]
    .forEach(([x, y, sx2, sy2]) => { g.beginPath(); g.moveTo(x + sx2 * bk, y); g.lineTo(x, y); g.lineTo(x, y + sy2 * bk); g.stroke(); });
  // centre gems (top carries the level, bottom is a plain gem like the ref)
  const gem = (cx2, cy2, h) => {
    g.save(); g.shadowColor = accent; g.shadowBlur = u(14);
    g.fillStyle = '#0a1522'; g.strokeStyle = accent; g.lineWidth = u(3);
    g.beginPath(); g.moveTo(cx2, cy2 - h); g.lineTo(cx2 + h * 0.87, cy2); g.lineTo(cx2, cy2 + h); g.lineTo(cx2 - h * 0.87, cy2); g.closePath(); g.fill(); g.stroke();
    g.restore();
  };
  gem(dx + W / 2, dy + u(16), u(30));
  gem(dx + W / 2, dy + H - u(16), u(22));
  if (v.level) {
    g.fillStyle = accent; g.font = `800 ${u(22)}px ${DISP}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(st.level), dx + W / 2, dy + u(18));
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }
  // header
  const hx = dx + u(52), hy = dy + u(96);
  g.save(); g.shadowColor = accent; g.shadowBlur = u(12);
  g.strokeStyle = accent; g.lineWidth = u(2.5);
  rr(g, hx, hy, u(52), u(52), u(8)); g.stroke();
  g.restore();
  g.fillStyle = accent; g.font = `800 ${u(34)}px ${DISP}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('!', hx + u(26), hy + u(28));
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.save(); g.shadowColor = accent; g.shadowBlur = u(14);
  g.fillStyle = ink; g.font = `700 ${u(34)}px ${DISP}`;
  try { g.letterSpacing = `${u(5)}px`; } catch {}
  const qw = g.measureText('PLAYER INFO').width;
  g.fillText('PLAYER INFO', hx + u(92), hy + u(37));
  g.restore();
  try { g.letterSpacing = '0px'; } catch {}
  g.strokeStyle = accA(0.5); g.lineWidth = u(2);
  rr(g, hx + u(66), hy, qw + u(52), u(52), u(8)); g.stroke();
  g.strokeStyle = accA(0.35); g.lineWidth = 1;
  g.beginPath(); g.moveTo(hx, hy + u(78)); g.lineTo(dx + W - u(52), hy + u(78)); g.stroke();
  // daily quest line + date
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  g.fillStyle = ink; g.font = `500 ${u(22)}px ${DISP}`;
  g.fillText(qp.total ? `[ Daily Quest: ${qp.done}/${qp.total} complete ]` : '[ No daily quest assigned ]', hx, dy + u(232));
  g.fillStyle = mut; g.font = `500 ${u(17)}px ${DISP}`;
  try { g.letterSpacing = `${u(2)}px`; } catch {}
  const dtw = g.measureText(date).width;
  g.fillText(date, dx + W - u(52) - dtw, dy + u(232));
  try { g.letterSpacing = '0px'; } catch {}
  // player identity — portrait + name + level/rank, the window's own image
  const py = dy + u(272), psz = u(84);
  g.save();
  roundedClip(g, hx, py, psz, psz, u(10));
  if (pic) drawCover(g, pic, hx, py, psz, psz);
  else {
    g.fillStyle = accA(0.28); g.fillRect(hx, py, psz, psz);
    g.fillStyle = accent; g.font = `800 ${u(44)}px ${DISP}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(((st.name || 'H')[0] || 'H').toUpperCase(), hx + psz / 2, py + psz / 2 + u(2));
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }
  g.restore();
  g.strokeStyle = accA(0.75); g.lineWidth = u(2);
  rr(g, hx, py, psz, psz, u(10)); g.stroke();
  const tx = hx + psz + u(24);
  g.fillStyle = ink; g.font = `800 ${u(30)}px ${DISP}`;
  g.fillText(ellipsize(g, String(st.name || 'HUNTER'), W - u(156) - psz), tx, py + u(38));
  const idBits = [v.level ? `LV ${st.level}` : '', v.rank ? `RANK ${st.rank}` : ''].filter(Boolean).join('  ·  ');
  if (idBits) {
    g.fillStyle = accent; g.font = `600 ${u(17)}px ${DISP}`;
    try { g.letterSpacing = `${u(3)}px`; } catch {}
    g.fillText(idBits, tx, py + u(70));
    try { g.letterSpacing = '0px'; } catch {}
  }
  // bio — sits with the identity, directly under the name
  if (v.bio !== false && model.bio) {
    g.fillStyle = mut; g.font = `italic 500 ${u(22)}px ${DISP}`;
    const bmax = W - u(104);
    const words = String(model.bio).split(/\s+/); const lines = []; let line = '';
    for (const wd of words) { const t2 = line ? `${line} ${wd}` : wd; if (g.measureText(t2).width > bmax && line) { lines.push(line); line = wd; if (lines.length === 2) break; } else line = t2; }
    if (line && lines.length < 2) lines.push(line);
    lines.slice(0, 2).forEach((ln, i) => g.fillText(ellipsize(g, ln, bmax), hx, dy + u(408) + i * u(30)));
  }
  // WARNING — centred in the window body, italic label + sentence body
  const wy = dy + u(760);
  g.save();
  g.textAlign = 'center';
  g.shadowColor = accent; g.shadowBlur = u(8);
  g.fillStyle = accent; g.font = `italic 700 ${u(23)}px ${DISP}`;
  g.fillText('WARNING:', dx + W / 2, wy);
  g.shadowColor = 'transparent'; g.shadowBlur = 0;
  g.fillStyle = ink; g.font = `500 ${u(21)}px ${DISP}`;
  {
    const wmax = W - u(180);
    const words = 'Incomplete daily quests incur the inactivity penalty. Maintain your streak.'.split(' ');
    const lines = []; let line = '';
    for (const wd of words) { const t2 = line ? `${line} ${wd}` : wd; if (g.measureText(t2).width > wmax && line) { lines.push(line); line = wd; if (lines.length === 2) break; } else line = t2; }
    if (line && lines.length < 2) lines.push(line);
    lines.slice(0, 2).forEach((ln, i) => g.fillText(ln, dx + W / 2, wy + u(36) + i * u(30)));
  }
  g.restore();
  if (bm) paintTreatmentBand(g, dx + u(52), dy + u(1164), W - u(104), bm, cfg, u, {
    title: 'STATUS', acc: accent, accA, ink, mut,
    track: 'rgba(255,255,255,0.08)', chip: 'rgba(255,255,255,0.04)', chipBorder: accA(0.25),
  });
  // bottom status (gated, footer) — inside the fixed card, above the band
  const bits = [];
  if (v.streak) bits.push(`STREAK ${currentStreak()}D`);
  if (v.achCount) bits.push(`${model.ctx.achN}/${model.ctx.achTotal} ACHIEVEMENTS`);
  if (bits.length) {
    g.fillStyle = mut; g.font = `500 ${u(16)}px ${DISP}`;
    try { g.letterSpacing = `${u(3)}px`; } catch {}
    g.fillText(bits.join('  ·  '), dx + u(52), dy + u(1100));
    try { g.letterSpacing = '0px'; } catch {}
  }
  g.restore();
  g.strokeStyle = accA(0.2); g.lineWidth = Math.max(1, u(2));
  rr(g, dx + u(1), dy + u(1), W - u(2), H - u(2), u(20)); g.stroke();
  return H;
}

/* Paints the profile card at (dx,dy) width W. Returns painted height. */
async function paintCard(g, dx, dy, W, cfg, st, v, grank) {
  // Designed treatments own their full composition (fixed canvas widths).
  if (isDesignedStyle(cfg.cardStyle)) {
    const model = buildShowcaseModel(st, cfg, { grank });
    const paint = { onisea: paintOnisea, anime: paintAnime, poster: paintPoster, operator: paintOperator, system: paintSystem }[cfg.cardStyle];
    return paint ? paint(g, dx, dy, W, cfg, st, v, model) : 0;
  }
  const style = S.uiStyle || 'liquid';
  // Skin radii are authored at the 720-wide reference; wider canvases (the
  // landscape credential) scale the same DOM-px tokens proportionally.
  const k = skinK() * (W / 720);
  const px = SKIN_PX[style] || SKIN_PX.liquid;
  const glass = !!S.glassMode;
  const galpha = Math.min(0.95, Math.max(0.1, S.glassAlpha ?? 0.55));
  const surf = cssVar('--bg-surface', '#0f1118');
  const raised = cssVar('--bg-raised', '#171b28');
  const overlayC = cssVar('--bg-overlay', 'rgba(255,255,255,0.08)');
  const prim = cssVar('--primary', '#7b5eff');
  const primDim = cssVar('--primary-dim', '#3a2099');
  // Card accent override: recolors the card's own content surfaces (avatar
  // ring/initials, level badge, XP fill, cell bars/rings) — never the skin
  // chrome. Falls back to the theme primary when unset.
  const acc = accentPair(cfg) || { main: prim, soft: primDim, rgba: () => primDim };
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
    try { wpImg = await loadImg(await orientedWp(await resolveBgSrc(S.bgImage))); } catch { wpImg = null; }
  }
  // Measure first: fixed layout, so paint bg in a second pass.
  const av = 116;
  const isSpot = cfg.cardStyle === 'spotlight';
  const isID = cfg.cardStyle === 'idcard';
  // Primary image: the user pic (front, focused).
  // Spotlight: full-bleed hero art; ID: framed photo box + data rows + stamp.
  const topH = isSpot ? 300 : isID ? 236 : av + 8;
  // ID cards draw an extra "HUNTER ID" strip (56 + 16 gap) below the photo
  // rows — count it, or the footer paints past the clipped card bounds.
  const idStripH = isID ? 72 : 0;
  const barH = 16;
  const cells = [];
  const achN = earnedIds().size;
  const achPct = Math.round((achN / ACHIEVEMENTS.length) * 100);
  if (cfg.variant === 'long') {
    for (const c of gridCells(st, v, cfg, grank, achN, achPct)) {
      if (c.cluster) cells.push({ cluster: true, members: c.members.map((mm) => ({ label: mm.label, val: mm.val, pct: mm.pct, key: mm.key, viz: vizFor(cfg, mm.key) })) });
      else cells.push({ label: c.label, val: c.val, pct: c.pct, key: c.key, viz: vizFor(cfg, c.key) });
    }
  }
  const gap = 16;
  const cols = 3;
  const cellW = (cw - gap * (cols - 1)) / cols;
  // A ring anywhere makes every grid cell taller, so rows stay uniform.
  const ringAny = cells.some((c) => !c.cluster && c.viz === 'ring' && c.pct != null);
  const cellH = ringAny ? 168 : 118;
  // Segment flow: cells before the stat cluster, the cluster band, the rest
  // — mirrors the DOM split so preview and export cannot drift.
  const ci = cells.findIndex((c) => c.cluster);
  const pre = ci < 0 ? cells : cells.slice(0, ci);
  const cluster = ci < 0 ? null : cells[ci];
  const post = ci < 0 ? [] : cells.slice(ci + 1);
  const clusterH = cluster ? cluster.members.length * 46 + 40 : 0;
  const rowsH = (n) => (n ? Math.ceil(n / cols) * cellH + (Math.ceil(n / cols) - 1) * gap : 0);
  const segHs = [];
  if (pre.length) segHs.push(rowsH(pre.length));
  if (cluster) segHs.push(clusterH);
  if (post.length) segHs.push(rowsH(post.length));
  const gridH = segHs.length ? segHs.reduce((a, b) => a + b, 0) + gap * (segHs.length - 1) + 16 : 0;
  const headH = cfg.showHeader ? 128 : 0;
  // Bio sits with the identity in every variant (rules §27.13). The ID card
  // draws it inside its photo row, so it needs no extra card height.
  const bio = bioText(cfg);
  const bioH = bio && !isID ? 36 : 0;
  const footH = cfg.variant === 'long' ? 40 : 44;
  const cardH = pad + headH + topH + idStripH + bioH + 18 + barH + 16 + gridH + footH + pad;
  const cellR = (px.cell) * k;

  g.save();
  // Brutalist hard offset shadow sits behind the card (pre-clip).
  if (style === 'brutalist') {
    g.fillStyle = '#000';
    cardPath(g, dx + 4 * k, dy + 4 * k, W, cardH, style);
    g.fill();
  }
  // Neomorph soft depth behind the card (pre-clip).
  if (style === 'neomorph') {
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 34; g.shadowOffsetY = 10;
    g.fillStyle = surf;
    cardPath(g, dx, dy, W, cardH, style);
    g.fill();
    g.restore();
  }
  cardPath(g, dx, dy, W, cardH, style);
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
  }
  // In-card header (part of the card, not a separate block).
  if (cfg.showHeader) {
    const themeName = THEMES[S.theme]?.name || 'Custom';
    g.textAlign = 'center';
    g.fillStyle = tPri;
    g.font = `800 52px ${DISP}`;
    try { g.letterSpacing = '6px'; } catch {}
    g.fillText('ZENFIT', dx + W / 2, y + 52);
    try { g.letterSpacing = '0px'; } catch {}
    g.fillStyle = tMut;
    g.font = `500 21px ${DISP}`;
    g.fillText(`${themeName} · ${S.uiStyle || 'liquid'}`, dx + W / 2, y + 86);
    g.textAlign = 'left';
    y += headH;
  }
  // Identity block: spotlight hero art / ID photo rows / classic avatar row.
  const pic = await loadImg(S.profilePic);
  const ax = dx + pad;
  if (isSpot) {
    const hh = 300, hx = dx + pad, hw = cw;
    if (pic) drawCover(g, pic, hx, y, hw, hh);
    else {
      g.fillStyle = acc.soft;
      rr(g, hx, y, hw, hh, 14); g.fill();
      g.fillStyle = acc.main;
      g.font = `800 120px ${DISP}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(((st.name && st.name[0]) || 'H').toUpperCase(), hx + hw / 2, y + hh / 2);
      g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    }
    const grd = g.createLinearGradient(0, y + hh - 140, 0, y + hh);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.72)');
    g.fillStyle = grd;
    g.fillRect(hx, y + hh - 140, hw, 140);
    const badge = `Lv ${st.level}`;
    g.font = `700 24px ${DISP}`;
    const bw = g.measureText(badge).width + 36;
    g.fillStyle = acc.soft;
    rr(g, dx + W - pad - bw, y + 20, bw, 44, 22);
    g.fill();
    g.fillStyle = acc.main; g.textAlign = 'center';
    g.fillText(badge, dx + W - pad - bw / 2, y + 51);
    g.textAlign = 'left';
    g.fillStyle = '#fff';
    g.font = `800 44px ${DISP}`;
    // long names scale to fit the hero panel
    const nm = st.name || 'Hunter';
    const spMax = hw - 40;
    const spW = g.measureText(nm).width;
    if (spW > spMax) g.font = `800 ${Math.max(24, Math.floor((44 * spMax) / spW) - 1)}px ${DISP}`;
    g.fillText(ellipsize(g, nm, spMax), hx + 20, y + hh - 52);
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
      g.fillStyle = acc.soft;
      rr(g, ax, y, pw, ph, 10); g.fill();
      g.fillStyle = acc.main;
      g.font = `800 72px ${DISP}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(((st.name && st.name[0]) || 'H').toUpperCase(), ax + pw / 2, y + ph / 2);
      g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    }
    g.lineWidth = Math.max(2, Math.round(k)); g.strokeStyle = acc.main;
    rr(g, ax, y, pw, ph, 10); g.stroke();
    const ix = ax + pw + 24;
    const rcolW = dx + W - pad - ix;
    g.textAlign = 'left';
    const idRow = (cap, val, yy, xx = ix, wmax = rcolW) => {
      g.fillStyle = tMut;
      g.font = `500 17px ${DISP}`;
      g.fillText(cap, xx, yy);
      g.fillStyle = tPri;
      g.font = `800 30px ${DISP}`;
      g.fillText(ellipsize(g, String(val), wmax), xx, yy + 38);
    };
    idRow('CALL SIGN', st.name || 'Hunter', y + 24);
    idRow('RANK', v.rank ? st.rank : '—', y + 100);
    idRow('LEVEL', v.level ? st.level : '—', y + 100, ix + 130, rcolW - 130);
    // bio — under the name, inside the photo row
    if (bio) {
      g.fillStyle = tSec; g.font = `italic 500 20px ${DISP}`;
      const words = bio.split(/\s+/); const lines = []; let line = '';
      for (const wd of words) { const t2 = line ? `${line} ${wd}` : wd; if (g.measureText(t2).width > rcolW && line) { lines.push(line); line = wd; if (lines.length === 2) break; } else line = t2; }
      if (line && lines.length < 2) lines.push(line);
      lines.slice(0, 2).forEach((ln, i) => g.fillText(ellipsize(g, ln, rcolW), ix, y + 176 + i * 22));
    }
    y += 236;
    g.fillStyle = raised;
    rr(g, ax, y, cw, 56, 10); g.fill();
    g.fillStyle = tMut;
    g.font = `500 17px ${DISP}`; g.textAlign = 'left';
    g.fillText('HUNTER ID', ax + 20, y + 36);
    g.fillStyle = acc.main;
    g.font = `800 34px ${DISP}`; g.textAlign = 'right';
    g.fillText(v.rank ? st.rank : '—', ax + cw - 20, y + 40);
    g.textAlign = 'left';
    y += 72;
  } else {
  // Avatar
  g.save();
  g.beginPath(); g.arc(ax + av / 2, y + av / 2, av / 2, 0, 7); g.clip();
  if (pic) drawCover(g, pic, ax, y, av, av);
  else {
    g.fillStyle = acc.soft;
    g.fillRect(ax, y, av, av);
    g.fillStyle = acc.main;
    g.font = `800 ${Math.round(av * 0.42)}px ${DISP}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(((st.name && st.name[0]) || 'H').toUpperCase(), ax + av / 2, y + av / 2 + 2);
  }
  g.restore();
  g.lineWidth = 4; g.strokeStyle = acc.main;
  g.beginPath(); g.arc(ax + av / 2, y + av / 2, av / 2 - 2, 0, 7); g.stroke();
  // Level badge measured first so the name can fit beside it (mirrors .badge-purple)
  const badge = `Lv ${st.level}`;
  g.font = `700 24px ${DISP}`;
  const bw = g.measureText(badge).width + 36;
  // Name + sub (rank keeps its V1 rank color, like the DOM badge text)
  const tx = ax + av + 24;
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillStyle = tPri;
  g.font = `800 40px ${DISP}`;
  // long names scale down instead of running under the level badge
  const nameMax = Math.max(140, dx + W - pad - bw - 20 - tx);
  const nm = st.name || 'Hunter';
  const nmW = g.measureText(nm).width;
  if (nmW > nameMax) g.font = `800 ${Math.max(22, Math.floor((40 * nameMax) / nmW) - 1)}px ${DISP}`;
  g.fillText(ellipsize(g, nm, nameMax), tx, y + 48);
  g.font = `500 24px ${DISP}`;
  let sx = tx;
  const seg = (txt, color) => { g.fillStyle = color; g.fillText(txt, sx, y + 88); sx += g.measureText(txt).width; };
  seg(`Lv ${v.level ? st.level : '—'}   `, tSec);
  seg(v.rank ? `RANK ${st.rank}` : '—', v.rank ? rankC : tSec);
  seg(`   ${v.xp ? `${st.xp} XP` : ''}`, tSec);
  g.font = `700 24px ${DISP}`;
  g.fillStyle = acc.soft;
  rr(g, dx + W - pad - bw, y + 8, bw, 44, 22);
  g.fill();
  g.fillStyle = acc.main; g.textAlign = 'center';
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
  if (isSpot || isID) {
    y += 18;
  } else {
    y += topH + 18;
  }
  // XP bar
  const xpNeed = xpForLevel(st.level);
  const pct = Math.min(1, st.xp / Math.max(1, xpNeed));
  g.fillStyle = overlayC;
  rr(g, dx + pad, y, cw, barH, 8); g.fill();
  if (pct > 0) {
    const grad = g.createLinearGradient(dx + pad, 0, dx + pad + cw, 0);
    grad.addColorStop(0, acc.main); grad.addColorStop(1, succ);
    g.fillStyle = grad;
    rr(g, dx + pad, y, Math.max(barH, cw * pct), barH, 8); g.fill();
  }
  y += barH + 16;
  // Stat grid (mirrors the DOM cells: number / bar / ring; the stat cluster
  // is one full-width band in its slot).
  const paintGridCells = (arr, gy) => {
    arr.forEach((cell, i) => {
      const cx = dx + pad + (i % cols) * (cellW + gap);
      const cy = gy + Math.floor(i / cols) * (cellH + gap);
      g.fillStyle = raised;
      rr(g, cx, cy, cellW, cellH, cellR); g.fill();
      const vy = cell.viz === 'ring' && cell.pct != null ? cy + 40 : cy + 62;
      g.fillStyle = tPri;
      g.font = `800 ${cell.viz === 'ring' && cell.pct != null ? 30 : 40}px ${DISP}`;
      g.textAlign = 'center';
      g.fillText(cell.val, cx + cellW / 2, vy);
      if (cell.viz === 'bar' && cell.pct != null) {
        const bw = cellW - 44, bx = cx + 22, by = cy + 74;
        g.fillStyle = overlayC;
        rr(g, bx, by, bw, 10, 5); g.fill();
        g.fillStyle = acc.main;
        if (cell.pct > 0) { rr(g, bx, by, Math.max(10, (bw * cell.pct) / 100), 10, 5); g.fill(); }
      } else if (cell.viz === 'ring' && cell.pct != null) {
        const rx = cx + cellW / 2, ry = cy + 96, rr2 = 24;
        g.lineWidth = 7; g.strokeStyle = overlayC;
        g.beginPath(); g.arc(rx, ry, rr2, 0, 7); g.stroke();
        g.strokeStyle = acc.main; g.lineCap = 'round';
        g.beginPath(); g.arc(rx, ry, rr2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, cell.pct / 100)); g.stroke();
        g.lineCap = 'butt';
      }
      g.fillStyle = tMut;
      g.font = `500 20px ${DISP}`;
      const isBar = cell.viz === 'bar' && cell.pct != null;
      const isRing = cell.viz === 'ring' && cell.pct != null;
      g.fillText(cell.label, cx + cellW / 2, cy + (isRing ? 142 : isBar ? 106 : 94));
      g.textAlign = 'left';
    });
  };
  const paintCluster = (cl, gy) => {
    g.fillStyle = raised;
    rr(g, dx + pad, gy, cw, clusterH, cellR); g.fill();
    g.fillStyle = acc.main; g.fillRect(dx + pad + 1, gy + 12, 3, clusterH - 24);
    let ry = gy + 42;
    g.fillStyle = tMut; g.font = `600 15px ${DISP}`;
    try { g.letterSpacing = '2px'; } catch {}
    g.fillText('ATTRIBUTES', dx + pad + 16, gy + 26);
    try { g.letterSpacing = '0px'; } catch {}
    for (const mm of cl.members) {
      g.fillStyle = tPri; g.font = `700 20px ${DISP}`;
      g.fillText(mm.label, dx + pad + 16, ry + 2);
      g.textAlign = 'right'; g.font = `800 22px ${DISP}`;
      g.fillText(mm.val, dx + pad + cw - 14, ry + 2); g.textAlign = 'left';
      if (mm.pct != null) {
        const bw = cw - 32;
        g.fillStyle = overlayC; rr(g, dx + pad + 16, ry + 10, bw, 6, 3); g.fill();
        if (mm.pct > 0) { g.fillStyle = acc.main; rr(g, dx + pad + 16, ry + 10, Math.max(8, (bw * Math.min(100, mm.pct)) / 100), 6, 3); g.fill(); }
      }
      ry += 46;
    }
  };
  if (cells.length) {
    const segs = [];
    if (pre.length) segs.push({ cells: pre, h: rowsH(pre.length) });
    if (cluster) segs.push({ cluster, h: clusterH });
    if (post.length) segs.push({ cells: post, h: rowsH(post.length) });
    let gy = y;
    segs.forEach((se, si) => {
      if (se.cluster) paintCluster(se.cluster, gy); else paintGridCells(se.cells, gy);
      gy += se.h;
      if (si < segs.length - 1) gy += gap;
    });
  }
  y += gridH;
  // Footer
  const themeName = THEMES[S.theme]?.name || 'Custom';
  g.fillStyle = tMut;
  g.font = `500 21px ${DISP}`;
  if (cfg.variant === 'long') {
    const pct2 = Math.round((earnedIds().size / ACHIEVEMENTS.length) * 100);
    g.fillText(`Achievements ${pct2}% · ${themeName} theme`, dx + pad, y + 28);
  } else {
    g.fillText(`Hunter card · ${v.streak ? `Streak ${currentStreak()}d` : ''} ${v.achCount ? `· ${earnedIds().size}/${ACHIEVEMENTS.length}` : ''}`, dx + pad, y + 28);
  }
  // Style frame (mirrors the skins)
  if (style === 'hud') {
    g.save();
    g.lineWidth = Math.max(2, Math.round(k)); g.strokeStyle = prim;
    g.shadowColor = prim; g.shadowBlur = 18;
    cardPath(g, dx + 2, dy + 2, W - 4, cardH - 4, 'hud');
    g.stroke();
    g.restore();
  } else if (style === 'brutalist') {
    g.save();
    g.lineWidth = Math.max(2, Math.round(2 * k)); g.strokeStyle = '#0a0a0a';
    cardPath(g, dx + 1.5, dy + 1.5, W - 3, cardH - 3, style);
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
    cardPath(g, dx + 1, dy + 1, W - 2, cardH - 2, style);
    g.stroke();
    g.restore();
  }
  g.restore();
  return cardH;
}

async function exportPNG(kind) {
  const cfg = sc();
  if (!cfg.showCard && (kind === 'short' || kind === 'long')) { showNotif('Card block is hidden — show it first', '!'); return; }
  showNotif(kind === 'long' ? 'Rendering full stage…' : 'Rendering greeting card…', 'OK');
  try {
    // Web fonts must be ready before painting or the canvas silently falls
    // back to a system face and the export drifts from the preview.
    try { await document.fonts?.ready; } catch {}
    const st = showcaseStats();
    const v = cfg.visible;
    const grank = __globalRank || '—';
    const scale = 2;
    const dims = CARD_DIMS[cfg.cardStyle];
    const W = dims ? dims[0] : 720;
    let cv;
    if (kind === 'short') {
      // Measure via offscreen paint? Layout is fixed — paint directly.
      cv = document.createElement('canvas');
      cv.width = W * scale; cv.height = (dims ? dims[1] + 300 : 900) * scale;
      const g = cv.getContext('2d');
      g.scale(scale, scale);
      const h = await paintCard(g, 0, 0, W, { ...cfg, variant: 'short' }, st, v, grank);
      const out = document.createElement('canvas');
      out.width = W * scale; out.height = Math.ceil(h) * scale;
      out.getContext('2d').drawImage(cv, 0, 0, W * scale, Math.ceil(h) * scale, 0, 0, W * scale, Math.ceil(h) * scale);
      cv = out;
    } else {
      const base = cssVar('--bg-base', '#080a10');
      // Stage honors the live backdrop: wallpaper cover + dim when set,
      // theme base otherwise. Same-origin only (remote → base fallback).
      let stageWp = null;
      if (cfg.showWallpaper && S.bgImage) {
        try { stageWp = await loadImg(await orientedWp(await resolveBgSrc(S.bgImage))); } catch { stageWp = null; }
      }
      // Measure via offscreen paint? Layout is fixed — paint directly.
      const tmp = document.createElement('canvas');
      tmp.width = W; tmp.height = dims ? dims[1] + 1200 : 1600;
      const tg = tmp.getContext('2d');
      const cardH = await paintCard(tg, 0, 0, W, { ...cfg, variant: 'long' }, st, v, grank);
      // Header lives inside the card — the stage starts at the card. The old
      // status footer was removed on owner order; its band stays as bottom
      // margin so the documented 2x export dims do not shift.
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
      g.drawImage(tmp, 0, 0, W, cardH, 0, 0, W, cardH);
    }
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    if (!blob) throw new Error('empty');
    const name = `zenfit-showcase-${kind}.png`;
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], name, { type: 'image/png' })] })) {
      try { await navigator.share({ files: [new File([blob], name, { type: 'image/png' })], title: 'ZenFit Showcase' }); return; } catch (e) { const msg = (e && e.message || '').toLowerCase(); if (msg.includes('abort') || e.name === 'AbortError') { showNotif('Share cancelled', '!'); return; } }
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
  const v = cfg.visible;
  // Designed treatments render their own full composition (see paintOnisea/
  // paintAnime) — the generic header/xp-bar/grid/footer sections don't stack
  // on top of them, keeping preview and export structurally aligned.
  const isCustom = isDesignedStyle(cfg.cardStyle);
  const model = buildShowcaseModel(st, cfg, { grank: __globalRank || '…', achN: earned.size, achPct });
  const customCells = isCustom ? model.cells.ordered.filter((c) => !c.cluster && v[c.key]).slice(0, 4) : [];
  const stars = Math.min(5, Math.max(0, Math.round(achPct / 20)));
  const acc = accentPair(cfg);
  const badgeStyle = acc ? ` style="background:${acc.soft};color:${acc.main}"` : '';
  const oniAcc = acc ? acc.main : '#e8a33d';
  const oniSoft = acc ? acc.soft : 'rgba(232,163,61,.45)';
  const aniAcc = acc ? acc.main : '#1f6f63';
  const aniSoft = acc ? acc.soft : 'rgba(31,111,99,.28)';
  const postAcc = acc ? acc.main : '#e0526e';
  const postSoft = acc ? acc.soft : 'rgba(224,82,110,.25)';
  const opAcc = acc ? acc.main : '#aebdcc';
  const opSoft = acc ? acc.soft : 'rgba(174,189,204,.5)';
  const sysAcc = acc ? acc.main : '#58c8ff';
  const sysSoft = acc ? acc.soft : 'rgba(88,200,255,.35)';
  const sysq = cfg.cardStyle === 'system' ? questProgress() : null;
  const sysBits = [v.streak ? `STREAK ${currentStreak()}D` : '', v.achCount ? `${earned.size}/${ACHIEVEMENTS.length} ACHIEVEMENTS` : ''].filter(Boolean).join(' · ');
  // Filled collectible chips flip to dark ink when the accent is light.
  const onAniAcc = (() => {
    if (!acc) return '#fff';
    const n = parseInt(acc.main.slice(1), 16);
    return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) > 150 ? '#10312c' : '#fff';
  })();

  host.innerHTML = `
  <div id="sc-stage" class="sc-stage">
    <div id="sc-export-long" class="sc-export">
      ${cfg.showCard ? `
      <div id="sc-export-short" class="card mb12 sc-card sc-default" style="container-type:inline-size">
        ${!isCustom && cfg.showHeader ? `
        <div style="text-align:center;margin-bottom:12px">
          <div style="font-size:24px;font-weight:800;font-family:var(--font-display);letter-spacing:3px">ZENFIT</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${escapeHtml(themeName)} · ${escapeHtml(S.uiStyle || 'liquid')}</div>
        </div>` : ''}
        ${cfg.cardStyle === 'onisea' ? `
        <div style="border-radius:14px;overflow:hidden;background:#0a0d13;border:2px solid #3a4152;margin-bottom:12px">
        <div style="position:relative;aspect-ratio:1080/720;padding:3.2%;display:flex;gap:3.4%;box-sizing:border-box">
          <div style="width:27%;flex-shrink:0;display:flex;flex-direction:column">
            <div style="aspect-ratio:300/372;border:2px solid ${oniSoft};border-radius:8px;overflow:hidden;background:#151b28">
              ${S.profilePic
                ? `<img src="${safePic(S.profilePic)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">`
                : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:64px;font-weight:800;font-family:var(--font-display);color:${oniAcc}">${escapeHtml(((st.name || 'H')[0] || 'H').toUpperCase())}</div>`}
            </div>
            <div style="height:5px;width:100%;margin-top:5%;background:repeating-linear-gradient(90deg,rgba(238,242,247,.75) 0 2px,transparent 2px 6px);opacity:.85"></div>
            <div style="font-size:8px;letter-spacing:2px;color:#8b93a7;margin-top:4%;font-weight:500">ACCESS CREDENTIAL</div>
          </div>
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;color:#eef2f7">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
              <div style="min-width:0">
                <div style="font-size:9px;letter-spacing:3px;color:${oniAcc};font-weight:600">ZENFIT // OPERATIONS</div>
                <div class="sc-name" style="font-size:23px;font-size:min(23px,2.95cqw);font-weight:800;font-family:var(--font-display);text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:6px">${escapeHtml(st.name)}</div>
              </div>
              ${v.rank ? `<div style="flex-shrink:0;width:44px;height:44px;border:2px solid ${oniSoft};border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;font-family:var(--font-display);color:${rc}">${escapeHtml(st.rank)}</div>` : ''}
            </div>
            <div style="height:1px;background:rgba(255,255,255,.12);margin:8px 0"></div>
            ${bioText(cfg) && v.bio !== false ? `<div style="font-size:11px;font-style:italic;color:#8b93a7;margin:0 0 8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(bioText(cfg))}</div>` : ''}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px">
              ${v.level ? `<div><div style="font-size:8px;letter-spacing:2px;color:${oniAcc};font-weight:600">LEVEL</div><div style="font-size:13px;font-weight:700">Lv ${st.level}</div></div>` : ''}
              ${v.xp ? `<div><div style="font-size:8px;letter-spacing:2px;color:${oniAcc};font-weight:600">EXPERIENCE</div><div style="font-size:13px;font-weight:700">${st.xp} XP</div></div>` : ''}
              ${v.achCount ? `<div><div style="font-size:8px;letter-spacing:2px;color:${oniAcc};font-weight:600">ACHIEVEMENTS</div><div style="font-size:13px;font-weight:700">${earned.size}/${ACHIEVEMENTS.length}</div></div>` : ''}
              ${v.streak ? `<div><div style="font-size:8px;letter-spacing:2px;color:${oniAcc};font-weight:600">STREAK</div><div style="font-size:13px;font-weight:700">${currentStreak()}d</div></div>` : ''}
            </div>
            ${v.rank ? `<div style="margin-top:auto;display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.045);border-left:3px solid ${oniAcc};border-radius:6px;padding:7px 12px">
              <div style="font-size:30px;line-height:1;font-weight:800;font-family:var(--font-display);color:${rc}">${escapeHtml(st.rank)}</div>
              <div><div style="font-size:8px;letter-spacing:2px;color:#8b93a7;font-weight:600">HUNTER CLASS</div><div style="font-size:10px;color:${oniAcc};font-weight:600">// ${escapeHtml(String(st.name || 'HUNTER').toUpperCase())}</div></div>
            </div>` : ''}
          </div>
        </div>
        ${cfg.variant === 'long' ? treatmentBandHTML(cfg, v, model, { skip: ['streak', 'achCount'], bio: false, title: 'SERVICE RECORD', acc: oniAcc, ink: '#eef2f7', mut: '#8b93a7', track: 'rgba(255,255,255,.08)', chip: 'rgba(255,255,255,.045)', chipBorder: 'rgba(255,255,255,.09)', pad: '0 3.2% 3.2%' }) : ''}
        </div>`
        : cfg.cardStyle === 'anime' ? `
        <div style="border-radius:20px;overflow:hidden;background:#b9e2d8;padding:2%;margin-bottom:12px;box-sizing:border-box${cfg.variant === 'long' ? '' : ';aspect-ratio:720/1080'}">
          <div style="background:#fff;border-radius:16px;padding:2.6%;display:flex;flex-direction:column;gap:10px;box-sizing:border-box;height:100%">
            <div style="position:relative;aspect-ratio:660/560;border-radius:12px;overflow:hidden;background:#dfeee9">
              ${S.profilePic
                ? `<img src="${safePic(S.profilePic)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">`
                : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:80px;font-weight:800;font-family:var(--font-display);color:${aniAcc}">${escapeHtml(((st.name || 'H')[0] || 'H').toUpperCase())}</div>`}
              ${v.rank ? `<div style="position:absolute;top:10px;left:10px;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.92);border:2px solid ${aniAcc};display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;font-family:var(--font-display);color:#10312c">${escapeHtml(st.rank)}</div>` : ''}
              ${v.achCount ? `<div style="position:absolute;top:12px;right:12px;display:flex;gap:4px">${Array.from({ length: 5 }, (_, i) => `<span style="width:14px;height:14px;display:inline-flex;color:${i < stars ? '#f2b64a' : 'rgba(255,255,255,.85)'}">${i < stars ? ICONS.star : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>`}</span>`).join('')}</div>` : ''}
            </div>
            <div style="background:rgba(255,255,255,.55);border:2px solid ${aniSoft};border-radius:14px;padding:12px;display:flex;flex-direction:column;flex:1;min-height:0">
              <div class="sc-name" style="font-size:22px;font-size:min(22px,6.1cqw);font-weight:800;font-family:var(--font-display);color:#10312c;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(st.name)}</div>
              <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
                ${v.level ? `<span style="font-size:11px;font-weight:700;color:${onAniAcc};background:${aniAcc};border-radius:12px;padding:3px 12px">Lv ${st.level}</span>` : ''}
                ${v.rank ? `<span style="font-size:11px;font-weight:700;color:${aniAcc};border:2px solid ${aniAcc};border-radius:12px;padding:1px 10px">RANK ${escapeHtml(st.rank)}</span>` : ''}
              </div>
              ${bioText(cfg) && v.bio !== false ? `<div style="font-size:11px;color:#3f6f66;margin-top:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(bioText(cfg))}</div>` : ''}
              ${cfg.variant === 'long' ? treatmentBandHTML(cfg, v, model, { skip: customCells.map((c) => c.key), bio: false, title: 'FULL RECORD', acc: aniAcc, ink: '#10312c', mut: '#3f6f66', track: 'rgba(16,49,44,.12)', chip: 'rgba(255,255,255,.72)', chipBorder: aniSoft }) : ''}
              ${customCells.length ? `<div style="display:flex;gap:8px;margin-top:auto">
                ${customCells.map((c) => `<div style="flex:1;min-width:0;background:rgba(255,255,255,.72);border-radius:10px;padding:6px 4px;text-align:center">
                  <div style="font-size:14px;font-weight:800;font-family:var(--font-display);color:#10312c;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(c.val)}</div>
                  <div style="font-size:9px;color:#3f6f66;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(c.label)}</div>
                </div>`).join('')}
              </div>` : ''}
            </div>
          </div>
        </div>`
        : cfg.cardStyle === 'poster' ? `
        <div id="sc-poster-root" style="border-radius:14px;overflow:hidden;background:${cfg.cardBackdrop === 'wallpaper' && S.bgImage ? 'transparent' : 'linear-gradient(135deg,#231a20,#141018 55%,#0c0a10)'};border:1px solid rgba(255,255,255,.10);margin-bottom:12px">
        <div style="position:relative;aspect-ratio:760/1060">
          <div style="position:absolute;inset:8px;border:1.5px solid rgba(255,255,255,.22);border-radius:10px;pointer-events:none"></div>
          <div style="position:absolute;left:6.3%;right:6.3%;top:19.8%;height:47.2%;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);border-radius:10px;padding:5% 5% 4%">
            <div style="font-size:9px;letter-spacing:3px;font-weight:600;color:${postAcc}">ZENFIT · HUNTER ARCHIVE</div>
            <div class="sc-name" style="font-size:${(st.name || '').length > 10 ? 'clamp(18px,5.2vw,30px)' : 'clamp(24px,8vw,44px)'};font-size:${(st.name || '').length > 10 ? 'min(30px,4.5cqw)' : 'min(44px,6.4cqw)'};font-weight:800;font-family:var(--font-display);color:#f5f2f4;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:6px">${escapeHtml(st.name)}</div>
            <div style="font-size:10px;letter-spacing:4px;color:rgba(245,242,244,.62);margin-top:6px">${[v.level ? `LEVEL ${st.level}` : '', v.rank ? `RANK ${escapeHtml(st.rank)}` : ''].filter(Boolean).join(' · ')}</div>
            ${bioText(cfg) && v.bio !== false ? `<div style="font-size:11px;font-style:italic;color:rgba(245,242,244,.62);margin-top:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(bioText(cfg))}</div>` : ''}
          </div>
          <div style="position:absolute;right:6.3%;top:56.2%;width:35.3%;aspect-ratio:1;border-radius:10px;overflow:hidden;border:2px solid rgba(255,255,255,.35);background:${postSoft}">
            ${S.profilePic ? `<img src="${safePic(S.profilePic)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:52px;font-weight:800;font-family:var(--font-display);color:${postAcc}">${escapeHtml(((st.name || 'H')[0] || 'H').toUpperCase())}</div>`}
            ${cfg.posterDots !== false ? `<span aria-hidden="true" style="position:absolute;inset:0;pointer-events:none;mix-blend-mode:overlay;background-image:radial-gradient(rgba(255,255,255,.6) 1px,transparent 1.5px),radial-gradient(rgba(10,6,12,.5) 1px,transparent 1.4px);background-size:5px 5px,5px 5px;background-position:1px 1px,3.5px 3.5px"></span>` : ''}
          </div>
          ${[v.achCount ? `${earned.size}/${ACHIEVEMENTS.length} ACHIEVEMENTS` : '', v.streak ? `STREAK ${currentStreak()}D` : ''].filter(Boolean).length ? `<div style="position:absolute;left:6.3%;bottom:3.5%;font-size:9px;letter-spacing:2px;color:rgba(245,242,244,.62)">${[v.achCount ? `${earned.size}/${ACHIEVEMENTS.length} ACHIEVEMENTS` : '', v.streak ? `STREAK ${currentStreak()}D` : ''].filter(Boolean).join(' · ')}</div>` : ''}
        </div>
        ${cfg.variant === 'long' ? treatmentBandHTML(cfg, v, model, { skip: ['streak', 'achCount'], bio: false, title: 'FULL RECORD', acc: postAcc, ink: '#f5f2f4', mut: 'rgba(245,242,244,.62)', track: 'rgba(255,255,255,.10)', chip: 'rgba(255,255,255,.06)', chipBorder: 'rgba(255,255,255,.14)', pad: '0 6.3% 5%' }) : ''}
        </div>`
        : cfg.cardStyle === 'operator' ? `
        <div style="border-radius:12px;overflow:hidden;background:linear-gradient(135deg,#2c313a,#171a20 50%,#262b33);border:1px solid rgba(255,255,255,.14);margin-bottom:12px">
        <div style="position:relative;aspect-ratio:1040/680;display:flex;gap:4%;padding:4.2%;box-sizing:border-box;color:#e8ecf1">
          <div style="width:27.7%;flex-shrink:0">
            <div style="aspect-ratio:288/356;border:2px solid ${opSoft};border-radius:8px;overflow:hidden;background:#11151b">
              ${S.profilePic ? `<img src="${safePic(S.profilePic)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:56px;font-weight:800;font-family:var(--font-display);color:${opAcc}">${escapeHtml(((st.name || 'H')[0] || 'H').toUpperCase())}</div>`}
            </div>
            <div style="display:flex;justify-content:center;margin-top:10px"><span style="width:16px;height:16px;border:2px solid ${opAcc};transform:rotate(45deg)"></span></div>
          </div>
          <div style="flex:1;min-width:0;display:flex;flex-direction:column">
            <div style="font-size:9px;letter-spacing:3px;color:#8d97a5;font-weight:600">CALL SIGN</div>
            <div class="sc-name" style="font-size:24px;font-size:min(24px,3.7cqw);font-weight:800;font-family:var(--font-display);text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:4px">${escapeHtml(st.name)}</div>
            <div style="font-size:9px;letter-spacing:3px;color:#8d97a5;font-weight:600;margin-top:10px">TITLE</div>
            <div style="font-size:14px;font-weight:700;color:${opAcc};margin-top:3px">${escapeHtml(RANK_TITLES[st.rank] || 'OPERATOR')}${v.rank ? ` · RANK ${escapeHtml(st.rank)}` : ''}</div>
            <div style="font-size:10px;color:#8d97a5;margin-top:10px">${[v.level ? `LV ${st.level}` : '', v.xp ? `${st.xp} XP` : '', v.streak ? `STREAK ${currentStreak()}D` : '', v.achCount ? `${earned.size}/${ACHIEVEMENTS.length} ACH` : ''].filter(Boolean).join('   ·   ')}</div>
            <div style="font-size:10px;font-style:italic;color:#8d97a5;margin-top:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${bioText(cfg) && v.bio !== false ? escapeHtml(bioText(cfg)) : 'Daily objectives in effect — maintain streak integrity.'}</div>
            <div style="margin-top:auto">
              <div style="height:22px;width:60%;background:repeating-linear-gradient(90deg,rgba(232,236,241,.65) 0 2px,transparent 2px 6px)"></div>
              <div style="font-size:8px;letter-spacing:3px;color:#8d97a5;margin-top:6px">OPERATOR ID CARD</div>
            </div>
          </div>
        </div>
        ${cfg.variant === 'long' ? treatmentBandHTML(cfg, v, model, { skip: ['streak', 'achCount'], bio: false, title: 'SERVICE LOG', acc: opAcc, ink: '#e8ecf1', mut: '#8d97a5', track: 'rgba(255,255,255,.10)', chip: 'rgba(255,255,255,.05)', chipBorder: 'rgba(255,255,255,.12)', pad: '0 4.2% 4%' }) : ''}
        <div style="display:flex;justify-content:space-between;gap:8px;padding:8px 4.2%;border-top:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.35);font-size:9px;letter-spacing:2px">
          <span style="font-weight:700">ZENFIT GLOBAL OPERATIONS</span>
          <span style="color:#8d97a5">LOCAL EXPORT · NOTHING UPLOADED</span>
        </div>
        </div>`
        : cfg.cardStyle === 'system' ? `
        <div style="border-radius:14px;overflow:hidden;background:#05070d;border:2px solid ${sysAcc};box-shadow:0 0 18px ${sysSoft};margin-bottom:12px">
          <div style="position:relative;aspect-ratio:760/1140;padding:6.8%;box-sizing:border-box;color:#dce8f2;display:flex;flex-direction:column">
            <div style="display:flex;align-items:center;gap:10px">
              <span style="width:34px;height:34px;flex-shrink:0;border:2px solid ${sysAcc};border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17px;color:${sysAcc}">!</span>
              <span style="border:1.5px solid ${sysSoft};border-radius:8px;padding:7px 16px;font-size:13px;font-weight:700;letter-spacing:4px">PLAYER INFO</span>
            </div>
            <div style="height:1px;background:${sysSoft};margin:12px 0"></div>
            <div style="display:flex;justify-content:space-between;gap:8px;font-size:11px">
              <span>${sysq.total ? `[ Daily Quest: ${sysq.done}/${sysq.total} complete ]` : '[ No daily quest assigned ]'}</span>
              <span style="color:#6f8296">${escapeHtml(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }))}</span>
            </div>
            <div style="display:flex;align-items:center;gap:12px;margin-top:14px">
              <div style="width:52px;height:52px;flex-shrink:0;border:2px solid ${sysSoft};border-radius:10px;overflow:hidden;background:#0b1220">
                ${S.profilePic
                  ? `<img src="${safePic(S.profilePic)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">`
                  : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;font-family:var(--font-display);color:${sysAcc}">${escapeHtml(((st.name || 'H')[0] || 'H').toUpperCase())}</div>`}
              </div>
              <div style="min-width:0">
                <div class="sc-name" style="font-size:17px;font-size:min(17px,4.6cqw);font-weight:800;font-family:var(--font-display);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(st.name)}</div>
                <div style="font-size:10px;letter-spacing:2px;color:${sysAcc};margin-top:4px">${[v.level ? `LV ${st.level}` : '', v.rank ? `RANK ${escapeHtml(st.rank)}` : ''].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
            ${bioText(cfg) && v.bio !== false ? `<div style="font-size:11px;font-style:italic;color:#6f8296;margin-top:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(bioText(cfg))}</div>` : ''}
            <div style="display:flex;flex-direction:column;justify-content:center;flex:1;text-align:center;min-height:0">
              <div style="font-size:11px;font-weight:700;font-style:italic;letter-spacing:3px;color:${sysAcc}">WARNING:</div>
              <div style="font-size:11px;margin-top:5px">Incomplete daily quests incur the inactivity penalty. Maintain your streak.</div>
            </div>
            ${sysBits ? `<div style="position:absolute;left:6.8%;bottom:3.5%;font-size:9px;letter-spacing:2px;color:#6f8296">${escapeHtml(sysBits)}</div>` : ''}
          </div>
          ${cfg.variant === 'long' ? treatmentBandHTML(cfg, v, model, { skip: ['streak', 'achCount'], bio: false, title: 'STATUS', acc: sysAcc, ink: '#dce8f2', mut: '#6f8296', track: 'rgba(255,255,255,.08)', chip: 'rgba(255,255,255,.04)', chipBorder: sysSoft, pad: '0 6.8% 5%' }) : ''}
        </div>`
        : cfg.cardStyle === 'spotlight' ? `
        <div class="sc-hero-art" style="position:relative;height:240px;border-radius:12px;overflow:hidden;margin-bottom:12px;background:${acc ? acc.soft : 'var(--primary-dim)'}">
          ${S.profilePic
            ? `<img src="${safePic(S.profilePic)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">`
            : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:90px;font-weight:800;font-family:var(--font-display);color:${acc ? acc.main : 'var(--primary)'}">${escapeHtml(((st.name || 'H')[0] || 'H').toUpperCase())}</div>`}
          <div style="position:absolute;inset:auto 0 0 0;padding:36px 14px 12px;background:linear-gradient(transparent,rgba(0,0,0,.72));display:flex;align-items:flex-end;justify-content:space-between;gap:8px">
            <div style="min-width:0"><div class="sc-name" style="font-size:22px;font-size:min(22px,5.6cqw);font-weight:800;font-family:var(--font-display);color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(st.name)}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.85)">Lv ${v.level ? st.level : '—'} · <span style="font-weight:700">${v.rank ? `RANK ${escapeHtml(st.rank)}` : '—'}</span>${v.xp ? ` · ${st.xp} XP` : ''}</div></div>
            <span class="badge badge-purple"${badgeStyle}>Lv ${st.level}</span>
          </div>
        </div>`
        : cfg.cardStyle === 'idcard' ? `
        <div class="sc-idrow" style="display:flex;gap:12px;align-items:stretch;margin-bottom:12px">
          <div style="width:96px;flex-shrink:0;border:2px solid ${acc ? acc.main : 'var(--primary)'};border-radius:10px;overflow:hidden;background:${acc ? acc.soft : 'var(--primary-dim)'}">
            ${S.profilePic
              ? `<img src="${safePic(S.profilePic)}" alt="" style="width:100%;height:100%;min-height:118px;object-fit:cover;display:block">`
              : `<div style="width:100%;height:118px;display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:800;font-family:var(--font-display);color:${acc ? acc.main : 'var(--primary)'}">${escapeHtml(((st.name || 'H')[0] || 'H').toUpperCase())}</div>`}
          </div>
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:5px">
            <div><div style="font-size:9px;color:var(--text-muted);letter-spacing:1px">CALL SIGN</div><div class="sc-name" style="font-size:17px;font-size:min(17px,4.6cqw);font-weight:800;font-family:var(--font-display);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(st.name)}</div></div>
            <div style="display:flex;gap:12px"><div><div style="font-size:9px;color:var(--text-muted);letter-spacing:1px">RANK</div><div style="font-size:13px;font-weight:700">${v.rank ? escapeHtml(st.rank) : '—'}</div></div>
            <div><div style="font-size:9px;color:var(--text-muted);letter-spacing:1px">LEVEL</div><div style="font-size:13px;font-weight:700">${v.level ? st.level : '—'}</div></div></div>
            ${bioText(cfg) ? `<div style="font-size:10px;font-style:italic;color:var(--text-secondary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">“${escapeHtml(bioText(cfg))}”</div>` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;border:1px solid var(--border-mid);border-radius:10px;padding:6px 12px;margin-bottom:12px;background:var(--bg-raised)">
          <span style="font-size:10px;color:var(--text-muted);letter-spacing:2px">HUNTER ID</span>
          <span style="font-size:26px;font-weight:800;font-family:var(--font-display);color:${acc ? acc.main : 'var(--primary)'}">${v.rank ? escapeHtml(st.rank) : '—'}</span>
        </div>`
        : `
        <div class="sc-card-top" style="display:flex;align-items:center;gap:12px">
          ${avatarHTML(64, acc)}
          <div style="flex:1;min-width:0">
            <div class="sc-name" style="font-size:19px;font-size:min(19px,4.3cqw);font-weight:800;font-family:var(--font-display);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(st.name)}</div>
            <div style="font-size:11px;color:var(--text-muted)">Lv ${v.level ? st.level : '—'} · <span style="color:${rc};font-weight:700">${v.rank ? `RANK ${escapeHtml(st.rank)}` : '—'}</span> · ${v.xp ? `${st.xp} XP` : ''}</div>
          </div>
          <span class="badge badge-purple"${badgeStyle}>Lv ${st.level}</span>
        </div>`}
        ${!isCustom && cfg.cardStyle !== 'idcard' && bioText(cfg) ? `<div style="font-size:12px;color:var(--text-secondary);font-style:italic;margin-top:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">“${escapeHtml(bioText(cfg))}”</div>` : ''}
        ${!isCustom ? `<div class="xp-bar-wrap mt8"><div class="xp-bar sc-xpfill" data-w="${Math.min(100, Math.round((st.xp / Math.max(1, xpNeed)) * 100))}" style="width:0%${acc ? `;background:${acc.main}` : ''}"></div></div>` : ''}
        ${isCustom ? '' : cfg.variant === 'long' ? (() => {
          const items = model.cells.ordered.filter((c) => c.cluster || v[c.key]);
          const ci = items.findIndex((c) => c.cluster);
          const pre = ci < 0 ? items : items.slice(0, ci);
          const clo = ci < 0 ? null : items[ci];
          const post = ci < 0 ? [] : items.slice(ci + 1);
          const one = (c) => c.custom
            ? `<div class="card-sm sc-stat" style="text-align:center;padding:10px 6px"><div style="width:20px;height:20px;margin:0 auto 4px;color:${acc ? acc.main : 'var(--primary)'}">${ICONS.globe}</div><div class="sc-num" id="sc-grank" style="font-size:16px;font-weight:800;font-family:var(--font-display)">${__globalRank || '…'}</div><div style="font-size:10px;color:var(--text-muted)">Global</div></div>`
            : statCell(c.icon, c.label, c.val, c.pct, vizFor(cfg, c.key), acc);
          const seg = (arr) => arr.length ? `<div class="grid3 mt8" style="gap:8px">${arr.map(one).join('')}</div>` : '';
          return `${seg(pre)}${clo ? clusterCell(clo, acc) : ''}${seg(post)}
        <div style="font-size:10px;color:var(--text-muted);margin-top:6px">Achievements ${achPct}% · ${escapeHtml(themeName)} theme</div>`;
        })() : `
        <div style="font-size:12px;color:var(--text-secondary);margin-top:8px">Hunter card · ${v.streak ? `${currentStreak()}d streak` : ''} ${v.achCount ? `· ${earned.size}/${ACHIEVEMENTS.length} achievements` : ''}</div>`}
      </div>` : `<div class="card mb12" style="text-align:center;color:var(--text-muted);font-size:12px">Card hidden — open the gear to show it.</div>`}
      <div style="display:flex;gap:8px;justify-content:center;align-items:center;margin-top:12px">
        <button class="btn btn-sm" id="sc-open-sheet">Customize design</button>
        <button class="btn btn-sm btn-primary" id="sc-quick-share"><span style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin-right:4px">${ICONS.share}</span>Share PNG</button>
      </div>
    </div>
  </div>
  <div id="sc-sheet" class="sc-sheet" role="dialog" aria-modal="false" aria-label="Showcase Studio" style="display:${sheetOpen ? 'block' : 'none'}">
    <div class="card" style="padding:0">
      <div class="sc-sheet-head"><div style="font-size:13px;font-weight:700">Showcase Studio</div><button class="btn btn-sm btn-ghost" id="sc-close">Close</button></div>
      <div style="padding:12px 14px 14px">
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
      <div class="flex gap8 mb8" style="flex-wrap:wrap">
        ${Object.entries(CARD_STYLES).map(([id, m]) => `<button class="btn btn-sm${cfg.cardStyle === id ? ' btn-primary' : ''}" data-scstyle="${id}" style="flex:1 1 30%">${m.name}</button>`).join('')}
      </div>
      <div style="font-size:12px;font-weight:600;margin-bottom:6px">My templates</div>
      ${customTemplates().length ? `<div class="flex gap8 mb8" style="flex-wrap:wrap">`
        + customTemplates().map((t) => `<span style="display:inline-flex;gap:4px;align-items:center;background:var(--bg-raised);border:1px solid var(--border-mid);border-radius:8px;padding:2px 2px 2px 8px;font-size:11px"><button class="btn btn-sm btn-ghost" data-sctemplate="${escapeHtml(t.id)}" style="border:none;padding:2px 4px">${escapeHtml(t.name)}</button><button class="btn btn-sm btn-ghost" data-sctdel="${escapeHtml(t.id)}" aria-label="Delete template" style="padding:2px 6px;color:var(--danger)">×</button></span>`).join('')
        + `</div>`
        : `<div style="font-size:11px;color:var(--text-muted);border:1px dashed var(--border-mid);border-radius:8px;padding:8px 10px;margin-bottom:8px">Create your own design and save it as a template — it will appear here.</div>`}
      <div class="flex gap8 mb8">
        <button class="btn btn-sm" id="sc-tplsave" style="flex:1">Save current as template</button>
      </div>
      <div style="font-size:12px;font-weight:600;margin-bottom:6px">Cell style</div>
      <div class="flex gap8 mb8">
        ${[['number', 'Number'], ['bar', 'Bar'], ['ring', 'Ring']].map(([x, l]) => `<button class="btn btn-sm${cfg.cellStyle === x ? ' btn-primary' : ''}" data-sccell="${x}" style="flex:1">${l}</button>`).join('')}
      </div>
      <div style="font-size:10px;color:var(--text-muted);margin:-4px 0 8px">Default for all cells — override individual cells in the Cells group below.</div>
      <div style="font-size:12px;font-weight:600;margin-bottom:6px">Card backdrop</div>
      <div class="flex gap8 mb8">
        ${[['wallpaper', 'Wallpaper'], ['theme', 'Theme']].map(([x, l]) => `<button class="btn btn-sm${cfg.cardBackdrop === x ? ' btn-primary' : ''}" data-scbdrop="${x}" style="flex:1">${l}</button>`).join('')}
      </div>
      <div style="font-size:12px;font-weight:600;margin-bottom:6px">Card accent</div>
      <div class="flex gap8 mb8" style="align-items:center">
        <button class="btn btn-sm${!cfg.accent ? ' btn-primary' : ''}" data-scacc="" style="flex:0 0 auto;padding:6px 10px">Theme</button>
        ${ACCENTS.map(([hex, name]) => `<button class="btn btn-sm" data-scacc="${hex}" aria-label="Accent ${name}" title="${name}" style="width:30px;height:28px;padding:0;background:${hex};border:2px solid ${cfg.accent === hex ? 'var(--text-primary)' : 'transparent'};flex:0 0 auto"></button>`).join('')}
      </div>
      ${cfg.cardStyle === 'poster' ? `
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;background:var(--bg-raised);border:1px solid var(--border-mid);border-radius:10px;padding:8px 10px;cursor:pointer">Dotted profile image
        <input type="checkbox" data-sc="posterDots" ${cfg.posterDots !== false ? 'checked' : ''} style="width:18px;height:18px"></label>` : ''}
      </div>
      ${collapseHeader('sc-g-cells', 'Cells', `<span class="collapse-ic">${ICONS.dashboard}</span>`, 'Info toggles + order', 'default-collapsed')}
      <div class="collapsible-body${S.collapsedSections?.['sc-g-cells'] !== false ? ' collapsed' : ''}" id="sc-g-cells">
      <div style="font-size:12px;font-weight:600;margin-bottom:6px">Show info</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">
        ${(() => {
          const byCat = new Map();
          for (const a of SHOWCASE_ATTRIBUTES) {
            if (!byCat.has(a.category)) byCat.set(a.category, []);
            byCat.get(a.category).push(a);
          }
          return [...byCat.entries()].map(([cat, attrs]) => `<div>
            <div style="font-size:9px;font-weight:700;letter-spacing:1px;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase">${escapeHtml(cat)}</div>
            <div class="grid2" style="gap:6px">
              ${attrs.map((a) => `<label title="${escapeHtml(a.desc)}" style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-secondary)"><input type="checkbox" data-scvis="${a.key}" ${v[a.key] ? 'checked' : ''} style="width:16px;height:16px">${escapeHtml(a.label)}</label>`).join('')}
            </div>
          </div>`).join('');
        })()}
      </div>
      <div style="font-size:12px;font-weight:600;margin-bottom:6px">Arrange cells</div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:10px;max-height:180px;overflow-y:auto">
        ${gridOrder(cfg).map((k) => {
          const isC = k === CLUSTER_KEY;
          const l = isC ? 'Attributes' : (VIS_DEFS.find(([x]) => x === k) || [k, k])[1];
          const d = isC ? ATTR_KEYS.map((x) => ATTRS_BY_KEY[x].label).join(' · ') : (ATTRS_BY_KEY[k]?.desc || '');
          const ov = cfg.cellViz[k];
          const vizLabel = ov ? { number: 'Num', bar: 'Bar', ring: 'Ring' }[ov] : 'Auto';
          return `<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-secondary);background:var(--bg-raised);border:1px solid var(--border-mid);border-radius:8px;padding:4px 8px;${isC || v[k] ? '' : 'opacity:.45'}"><span style="flex:1;min-width:0"><span>${l}</span><div style="font-size:9px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(d)}</div></span>`
            + (isC ? '' : `<button class="btn btn-sm" data-scviz="${k}" aria-label="Visualization for ${l}" title="Cycle: auto → number → bar → ring" style="padding:8px 10px;min-width:48px;font-size:10px;min-height:40px">${vizLabel}</button>`)
            + `<button class="btn btn-sm" data-scmv="-1" data-sckey="${k}" aria-label="Move up" style="padding:8px 12px;min-height:40px">↑</button>`
            + `<button class="btn btn-sm" data-scmv="1" data-sckey="${k}" aria-label="Move down" style="padding:8px 12px;min-height:40px">↓</button></div>`;
        }).join('')}
      </div>
      </div>
      <div class="flex gap8">
        <button class="btn btn-sm btn-primary" id="sc-share-long" style="flex:1"><span style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin-right:4px">${ICONS.share}</span>Full stage PNG</button>
        <button class="btn btn-sm" id="sc-share-short" style="flex:1">Card PNG</button>
      </div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:6px">Included in the image: ${escapeHtml(includedFields(v))}. Local export only — nothing is uploaded, and your leaderboard opt-in is not changed.</div>
      </div>
    </div>
  </div>`;

  // Card backdrop: the wallpaper bitmap (same-origin only), applied live so
  // the preview matches the export. The poster turns its ground transparent
  // so the wallpaper shows through instead of its own gradient.
  const cardElm = host.querySelector('.sc-card');
  if (cardElm) {
    if (cfg.cardBackdrop === 'wallpaper' && S.bgImage) {
      resolveBgSrc(S.bgImage).then(orientedWp).then((url) => {
        if (url && cardElm.isConnected) {
          cardElm.style.background = `linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,.55)),url("${url}") center/cover`;
          const posterElm = host.querySelector('#sc-poster-root');
          if (posterElm) posterElm.style.background = 'transparent';
        }
      }).catch(() => {});
    }
  }

  // Restore the sheet's scroll offset after the rebuild. The router clears
  // the screen before this function runs, so the offset is tracked on the
  // live sheet by a passive listener rather than read from the old DOM.
  const sheetEl = host.querySelector('#sc-sheet');
  if (sheetEl) {
    if (sheetOpen && __sheetScrollTop > 0) sheetEl.scrollTop = __sheetScrollTop;
    __sheetScrollTop = sheetEl.scrollTop; // post-restore truth (clamped)
    sheetEl.addEventListener('scroll', () => { __sheetScrollTop = sheetEl.scrollTop; }, { passive: true });
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
    const key = rankCacheKey();
    if (key !== __globalRankKey) { __globalRank = null; __globalRankTried = false; __globalRankKey = key; }
    if (__globalRank) grankElm.textContent = __globalRank;
    else if (!__globalRankTried) {
      grankElm.textContent = '…';
      __globalRankTried = true;
      LeaderboardAPI.fetch(50).then((rows) => {
        let ix = -1;
        if (S.deviceId) {
          ix = (rows || []).findIndex((u) => u.device_id && u.device_id === S.deviceId);
        }
        __globalRank = ix >= 0 ? `#${ix + 1}` : '50+';
        const live = host.querySelector('#sc-grank');
        if (live) live.textContent = __globalRank;
      }).catch(() => {
        __globalRank = '—'; // compact cells (anime strip ~43px at 360) can only hold a dash; the leaderboard screen keeps the explicit offline state
        const live = host.querySelector('#sc-grank');
        if (live) live.textContent = __globalRank;
      });
    } else grankElm.textContent = __globalRank || '—';
  }

  __cleanup = () => {
    document.removeEventListener('pointerdown', outsideSheetCloser);
    if (window.ZF?.consumeBack === consumeSheetBack) window.ZF.consumeBack = null;
  };
  host.querySelector('#sc-close').onclick = () => setSheet(false);
  // Visible primary actions under the preview — the gear is no longer the
  // only way in (auto-fading controls must not gate the whole studio).
  host.querySelector('#sc-open-sheet').onclick = () => {
    setSheet(true);
    try { springIn(document.getElementById('sc-sheet')?.firstElementChild); } catch {}
  };
  // Share PNG → format dialog, then the existing export path (native share
  // sheet when the browser supports it, plain download otherwise).
  const openShareDialog = () => {
    openOverlay(`<div style="font-size:15px;font-weight:700;margin-bottom:4px">Share PNG</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Pick a format — both export locally, nothing is uploaded.</div>
      <div style="display:flex;flex-direction:column;gap:8px">
      <button class="btn btn-primary" id="sc-sh-long"><span style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin-right:6px">${ICONS.share}</span>Long — full stage</button>
      <button class="btn" id="sc-sh-short">Short — card only</button>
      <button class="btn btn-ghost" id="sc-sh-x">Cancel</button></div>`);
    const go = (kind) => { document.getElementById('zf-overlay')?.remove(); exportPNG(kind); };
    document.getElementById('sc-sh-long').onclick = () => go('long');
    document.getElementById('sc-sh-short').onclick = () => go('short');
    document.getElementById('sc-sh-x').onclick = () => document.getElementById('zf-overlay')?.remove();
  };
  host.querySelector('#sc-quick-share').onclick = openShareDialog;

  host.querySelectorAll('[data-sc]').forEach((c) => {
    c.onchange = () => { set({ [c.dataset.sc]: c.checked }); };
  });
  host.querySelectorAll('[data-scvar]').forEach((b) => {
    b.onclick = () => { set({ variant: sanitizeEnum(b.dataset.scvar, ['short', 'long'], 'long') }); };
  });
  host.querySelectorAll('[data-scbdrop]').forEach((b) => {
    b.onclick = () => { set({ cardBackdrop: sanitizeEnum(b.dataset.scbdrop, ['wallpaper', 'theme'], 'wallpaper') }); };
  });
  host.querySelectorAll('[data-scstyle]').forEach((b) => {
    b.onclick = () => { set({ cardStyle: sanitizeEnum(b.dataset.scstyle, Object.keys(CARD_STYLES), 'default') }); showNotif(`Card style: ${CARD_STYLES[b.dataset.scstyle]?.name || b.dataset.scstyle}`, 'OK'); };
  });
  host.querySelectorAll('[data-sccell]').forEach((b) => {
    b.onclick = () => { set({ cellStyle: sanitizeEnum(b.dataset.sccell, ['number', 'bar', 'ring'], 'number') }); showNotif('Cell style: ' + b.dataset.sccell, 'OK'); };
  });
  host.querySelectorAll('[data-scacc]').forEach((b) => {
    b.onclick = () => {
      const a = b.dataset.scacc || '';
      set({ accent: ACCENT_RE.test(a) ? a : '' });
      showNotif(a ? 'Card accent applied' : 'Card accent: theme default', 'OK');
    };
  });
  // Per-cell visualization: auto → number → bar → ring → auto. 'auto' drops
  // the override so the global cell style applies again.
  host.querySelectorAll('[data-scviz]').forEach((b) => {
    b.onclick = () => {
      const key = b.dataset.scviz;
      const cv = { ...sc().cellViz };
      const seq = ['auto', 'number', 'bar', 'ring'];
      const cur = CELL_VIZ.includes(cv[key]) ? cv[key] : 'auto';
      const next = seq[(seq.indexOf(cur) + 1) % seq.length];
      if (next === 'auto') delete cv[key]; else cv[key] = next;
      set({ cellViz: cv });
      showNotif(`${key}: ${next === 'auto' ? 'global default' : next}`, 'OK');
    };
  });
  host.querySelectorAll('[data-scvis]').forEach((c) => {
    c.onchange = () => { setVis(c.dataset.scvis, c.checked); };
  });
  // Bio/quote: sanitize on commit (maxlength 140, tags/protocols/handlers stripped).
  host.querySelector('#sc-bio').onchange = (e) => {
    set({ bio: sanitizeText(e.target.value, 140) });
    showNotif('Bio updated', 'OK');
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
    };
  });
  host.querySelectorAll('[data-sctemplate]').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.sctemplate;
      const t = customTemplates().find((x) => x.id === id);
      if (!t) { showNotif('Template gone', '!'); return; }
      applyTemplateSnap(templateSnap(t));
      showNotif(`Template: ${t.name}`, 'OK');
    };
  });
  host.querySelectorAll('[data-sctdel]').forEach((b) => {
    b.onclick = () => {
      const cur = sc();
      const left = customTemplates().filter((x) => x.id !== b.dataset.sctdel);
      set({ templates: left });
      showNotif('Template deleted', 'OK');
    };
  });
  host.querySelector('#sc-tplsave').onclick = () => {
    openOverlay(`<div style="font-size:15px;font-weight:700;margin-bottom:4px">Save template</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">Saves the reusable design: layout, treatment, output format, field visibility and order. Your name, avatar and bio are not included.</div>
      <input type="text" id="sc-tplname" placeholder="Template name" maxlength="30" style="font-size:13px;margin-bottom:10px">
      <div class="flex gap8"><button class="btn btn-primary btn-sm" id="sc-tplgo" style="flex:1">Save</button>
      <button class="btn btn-ghost btn-sm" id="sc-tplx">Cancel</button></div>`);
    document.getElementById('sc-tplx').onclick = () => document.getElementById('zf-overlay')?.remove();
    const go = () => {
      const name = sanitizeText(document.getElementById('sc-tplname')?.value || '', 30) || 'My template';
      const c = sc();
      const snap = {
        schemaVersion: 2,
        cardStyle: c.cardStyle, cellStyle: c.cellStyle, variant: c.variant,
        cardBackdrop: c.cardBackdrop,
        posterDots: c.posterDots !== false,
        showHeader: !!c.showHeader, showCard: !!c.showCard,
        visible: { ...c.visible },
        order: gridOrder(c),
        cellViz: { ...c.cellViz },
        accent: c.accent,
      };
      const id = `u${Date.now().toString(36)}`;
      set({ templates: [...customTemplates(), { id, name, snap, createdAt: Date.now() }] });
      document.getElementById('zf-overlay')?.remove();
      showNotif(`Template saved: ${name}`, 'OK');
    };
    document.getElementById('sc-tplgo').onclick = go;
    document.getElementById('sc-tplname').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  };
  host.querySelector('#sc-share-long').onclick = () => exportPNG('long');
  host.querySelector('#sc-share-short').onclick = () => exportPNG('short');
  try { wireCollapsibles(host); } catch {}
}
