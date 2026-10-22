/* ── ZenFit V2 · core/themes.js ────────────────────────────
   V1 theme engine (single home for all theme data + logic).
   Built-ins, custom-theme store access, full token applier.
   Used by features/customization.js (studio) and
   features/admin.js (Content tab). Themes are local-only —
   no Supabase changes needed (customThemes sync via backup).
────────────────────────────────────────────────────────────── */
import { S, update } from './store.js';
import { uid } from './utils.js';

export const PRESET_WALLPAPERS = [
  { file: 'berserk.jpg', name: 'Berserk' }, { file: 'vegeta.jpg', name: 'Vegeta' },
  { file: 'violet evergarden.png', name: 'Violet' }, { file: 'red-space.jpeg', name: 'Red Space' },
  { file: 'endure.jpeg', name: 'Endure' },
];

export const THEMES = {
  amoled: { name: 'AMOLED Black', bgBase: '#000000', bgSurface: '#0a0a0a', bgRaised: '#111111', bgOverlay: '#1a1a1a', borderMid: '#222222', primary: '#7c6fff', textPrimary: '#ffffff', textSecondary: '#cccccc', textMuted: '#888888', glow1: '#7c6fff', glow2: '#00d4ff', glow3: '#bf00ff', p_hue: '250', inputBg: '#111111' },
  midnight: { name: 'Midnight Blue', bgBase: '#050a1a', bgSurface: '#0a1228', bgRaised: '#0f1a38', bgOverlay: '#142048', borderMid: '#1e3060', primary: '#4a9eff', textPrimary: '#e8f0ff', textSecondary: '#a8c0e8', textMuted: '#6888b8', glow1: '#4a9eff', glow2: '#00d4aa', glow3: '#7c6fff', p_hue: '210', inputBg: '#0f1a38' },
  frost: { name: 'Frozen Steel', bgBase: '#0e1318', bgSurface: '#171e26', bgRaised: '#202833', bgOverlay: '#293340', borderMid: '#3a4757', primary: '#8fcfff', textPrimary: '#f3f8ff', textSecondary: '#c3d5e8', textMuted: '#8ca3bb', glow1: '#8fcfff', glow2: '#a8e0ff', glow3: '#c084fc', p_hue: '220', inputBg: '#202833' },
  light: {
    name: 'Light', bgBase: '#f5f0eb', bgSurface: '#ffffff', bgRaised: '#f0ece6', bgOverlay: '#e8e2da', borderMid: '#d4cec6', primary: '#7c6fff', textPrimary: '#1a1a2e', textSecondary: '#5a5a72', textMuted: '#9a9ab0', glow1: '#7c6fff', glow2: '#00d4ff', glow3: '#bf00ff', p_hue: '250', inputBg: '#ffffff',
    calDeficit: '#e8f5e9', calDeficit2: '#f0faf0', calSurplus: '#fff3e0', calSurplus2: '#fffaf0', calBalanced: '#e3f2fd', calBalanced2: '#f0f8ff',
    badgeBlueBg: '#dbeafe', badgeTealBg: '#ccfbf1', badgeEnergyBg: '#ffedd5', badgeGreenBg: '#d1fae5', badgeAmberBg: '#fef3c7', badgeRedBg: '#fee2e2',
    gradeABg: '#d1fae5', gradeBBg: '#dbeafe', gradeCBg: '#fef3c7', gradeDBg: '#ffedd5', gradeEBg: '#fee2e2',
    calDayDoneBg: '#d1fae5', calDayDoneBorder: '#6ee7b7',
    swipeHintBg: 'rgba(0,0,0,0.06)', previewCardBg: 'rgba(255,255,255,0.95)', homeStatsBg: 'rgba(245,240,235,0.85)', statBadgeBg: 'rgba(0,0,0,0.03)', orbBg: 'rgba(255,255,255,0.85)',
    hm1Bg: 'rgba(76,219,138,0.15)', hm1Border: 'rgba(76,219,138,0.25)', hm2Bg: 'rgba(76,219,138,0.35)', hm2Border: 'rgba(76,219,138,0.45)', hm3Bg: '#4cdb8a', hm3Border: '#4cdb8a',
    achEarnedGlow: 'rgba(245,166,35,0.15)', taskOverdueBg: 'rgba(255,90,90,0.08)', taskCompletedBg: 'rgba(76,219,138,0.08)',
    timerOkBg: 'rgba(74,158,255,0.1)', timerWarnBg: 'rgba(245,166,35,0.1)', timerOverBg: 'rgba(255,90,90,0.1)',
    overlayScrim: 'rgba(0,0,0,0.55)', changelogScrim: 'rgba(0,0,0,0.35)',
  },
  brutalist: {
    name: 'Pop', bgBase: '#fff3dc', bgSurface: '#ffffff', bgRaised: '#ffe9be', bgOverlay: '#ffd98f', borderMid: '#141414', primary: '#ff3d00', textPrimary: '#141414', textSecondary: '#3d3d3d', textMuted: '#7a7a7a', glow1: '#ff3d00', glow2: '#004dff', glow3: '#00a651', p_hue: '12', inputBg: '#ffffff',
    calDeficit: '#e8f5e9', calDeficit2: '#f0faf0', calSurplus: '#fff3e0', calSurplus2: '#fffaf0', calBalanced: '#e3f2fd', calBalanced2: '#f0f8ff',
    badgeBlueBg: '#dbeafe', badgeTealBg: '#ccfbf1', badgeEnergyBg: '#ffedd5', badgeGreenBg: '#d1fae5', badgeAmberBg: '#fef3c7', badgeRedBg: '#fee2e2',
    gradeABg: '#d1fae5', gradeBBg: '#dbeafe', gradeCBg: '#fef3c7', gradeDBg: '#ffedd5', gradeEBg: '#fee2e2',
    calDayDoneBg: '#d1fae5', calDayDoneBorder: '#6ee7b7',
    swipeHintBg: 'rgba(0,0,0,0.06)', previewCardBg: 'rgba(255,255,255,0.95)', homeStatsBg: 'rgba(255,243,220,0.85)', statBadgeBg: 'rgba(0,0,0,0.03)', orbBg: 'rgba(255,255,255,0.85)',
    hm1Bg: 'rgba(76,219,138,0.15)', hm1Border: 'rgba(76,219,138,0.25)', hm2Bg: 'rgba(76,219,138,0.35)', hm2Border: 'rgba(76,219,138,0.45)', hm3Bg: '#4cdb8a', hm3Border: '#4cdb8a',
    achEarnedGlow: 'rgba(245,166,35,0.15)', taskOverdueBg: 'rgba(255,90,90,0.08)', taskCompletedBg: 'rgba(76,219,138,0.08)',
    timerOkBg: 'rgba(74,158,255,0.1)', timerWarnBg: 'rgba(245,166,35,0.1)', timerOverBg: 'rgba(255,90,90,0.1)',
    overlayScrim: 'rgba(0,0,0,0.55)', changelogScrim: 'rgba(0,0,0,0.35)',
  },
  cyberpunk: { name: 'Neon Grid', bgBase: '#060907', bgSurface: '#0a0f0c', bgRaised: '#0f1712', bgOverlay: '#142019', borderMid: '#1e4030', primary: '#39ff14', textPrimary: '#e9ffef', textSecondary: '#a4d8b6', textMuted: '#5f8a6e', glow1: '#39ff14', glow2: '#00b6ff', glow3: '#b6ff4a', p_hue: '120', inputBg: '#0a0f0c' },
  // Electric blue + white only — no green anywhere; done-states lean azure,
  // warnings/errors keep their standard amber/red semantics.
  system: { name: 'System Blue', bgBase: '#01050c', bgSurface: '#04101f', bgRaised: '#071727', bgOverlay: '#0a2036', borderMid: '#14405f', primary: '#2f9dff', textPrimary: '#eef5ff', textSecondary: '#a9c4de', textMuted: '#6f8bab', glow1: '#7fc9ff', glow2: '#0b74d9', glow3: '#cfe9ff', p_hue: '205', inputBg: '#071727', taskCompletedBg: 'rgba(47,157,255,0.10)', calDayDoneBg: '#0a2f52', calDayDoneBorder: '#2f9dff', hm1Bg: 'rgba(47,157,255,0.16)', hm1Border: 'rgba(47,157,255,0.26)', hm2Bg: 'rgba(47,157,255,0.40)', hm2Border: 'rgba(47,157,255,0.52)', hm3Bg: '#2f9dff', hm3Border: '#2f9dff' },
};

export function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
export function hexToRgba(hex, a) {
  return `rgba(${hexToRgb(hex)},${a})`;
}
export function shadeColor(hex, pct) {
  const n = String(hex || '').replace('#', '');
  const v = n.length === 3 ? n.split('').map((c) => c + c).join('') : n;
  const num = parseInt(v, 16);
  const amt = Math.round(2.55 * pct);
  const r = Math.min(255, Math.max(0, (num >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 255) + amt));
  const b = Math.min(255, Math.max(0, (num & 255) + amt));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/** Theme colour fields are interpolated straight into CSS (style attributes and
 *  CSS custom properties), so they are a trust boundary — a theme file is
 *  owner-supplied data that can arrive from an import or a published asset.
 *  Allow only real CSS colour syntax; anything else falls back to the base value.
 *  This is the single choke point: guard here and every render site downstream
 *  (drawMine, the coach grid, applyTheme) is safe. */
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.%,\s/]+\)|hsla?\(\s*[\d.%,\s/deg]+\)|[a-z]{3,20})$/i;
const COLOR_KEYS = [
  'bgBase', 'bgSurface', 'bgRaised', 'bgOverlay', 'borderMid', 'primary', 'inputBg',
  'textPrimary', 'textSecondary', 'textMuted', 'glow1', 'glow2', 'glow3',
  'taskCompletedBg', 'calDayDoneBg', 'calDayDoneBorder', 'hm1Bg', 'hm1Border',
  'hm2Bg', 'hm2Border', 'hm3Bg', 'hm3Border',
];
/* Token names that only a full (V1) theme carries. `primary` is deliberately
   excluded — the legacy minimal shape uses it too. */
const FULL_KEYS = [
  'bgBase', 'bgSurface', 'bgRaised', 'bgOverlay', 'borderMid', 'inputBg',
  'textPrimary', 'textSecondary', 'textMuted', 'glow1', 'glow2', 'glow3',
];
function safeColor(v, fallback) {
  const s = String(v ?? '').trim();
  if (!s) return fallback;
  // Reject anything that could break out of a CSS declaration or an attribute,
  // or that carries a URL/scheme. Then require a recognised colour shape.
  if (/[;"'<>\\]/.test(s) || /url\s*\(/i.test(s)) return fallback;
  return COLOR_RE.test(s) ? s : fallback;
}
function safeTheme(t, base) {
  const out = { ...t };
  for (const k of COLOR_KEYS) if (k in out) out[k] = safeColor(out[k], base[k]);
  return out;
}

/** Normalize legacy minimal themes to the V1-full shape. */
export function normalizeTheme(t) {
  if (!t || typeof t !== 'object') return { ...THEMES.midnight };
  const base = THEMES.midnight;
  // A theme carrying the full token set was previously returned verbatim, which let
  // imported/remote colour strings reach CSS unchecked. Sanitise it against the base
  // palette instead, and bound the free-text fields that are rendered alongside it.
  if (FULL_KEYS.some((k) => t[k])) {
    const safe = safeTheme(t, base);
    safe.name = String(safe.name || 'Custom').slice(0, 60);
    safe.id = t.id;
    return safe;
  }
  return {
    ...base, name: String(t.name || 'Custom').slice(0, 60), id: t.id,
    primary: safeColor(t.primary, base.primary),
    bgBase: safeColor(t.bg, base.bgBase), bgSurface: safeColor(t.surface, base.bgSurface),
    bgRaised: safeColor(t.raised, base.bgRaised),
    textPrimary: safeColor(t.text, base.textPrimary),
  };
}

/** Migrate V1's separate theme key into state (one-time). */
export function migrateLegacyThemes() {
  try {
    const raw = localStorage.getItem('zenfit_themes_v1');
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length && !(S.customThemes || []).length) {
      update((s) => { s.customThemes = arr.map((t) => ({ ...normalizeTheme(t), id: t.id || uid('theme') })); }, { silent: true });
    }
    localStorage.removeItem('zenfit_themes_v1');
  } catch {}
}

export function getCustomThemes() {
  return (S.customThemes || []).map(normalizeTheme);
}

/** V1 applyThemeObject — sets the full token set + meta color. */
export function applyThemeObject(rawT, key) {
  // Trust boundary: every token below is written into a CSS custom property, so
  // sanitise the colour values before they land there.
  const t = normalizeTheme(rawT);
  update((s) => { s.theme = key; }, { silent: true });
  window.ZF.save();
  const r = document.documentElement.style;
  const P = (k, v) => { if (v != null) r.setProperty(k, v); };
  P('--bg-base', t.bgBase); P('--bg-surface', t.bgSurface);
  P('--glass-bg-rgb', hexToRgb(t.bgSurface));
  P('--bg-raised', t.bgRaised); P('--bg-overlay', t.bgOverlay);
  P('--border-mid', t.borderMid); P('--primary', t.primary);
  P('--primary-rgb', hexToRgb(t.primary));
  P('--primary-dark', shadeColor(t.primary, -25));
  P('--primary-dim', shadeColor(t.primary, -50));
  const mt = document.querySelector('meta[name="theme-color"]');
  if (mt) mt.setAttribute('content', t.primary);
  P('--text-primary', t.textPrimary); P('--text-secondary', t.textSecondary);
  P('--text-muted', t.textMuted);
  P('--glow1', t.glow1); P('--glow2', t.glow2); P('--glow3', t.glow3);
  P('--particle-hue', t.p_hue);
  P('--app-bg', t.bgBase);
  P('--input-bg', t.inputBg || t.bgRaised);
  P('--nav-bg', hexToRgba(t.bgSurface, 0.8));
  P('--bottombar-bg', hexToRgba(t.bgSurface, 0.85));
  P('--overlay-bg', hexToRgba(t.bgSurface, 0.92));
  P('--glass-bg', hexToRgba(t.bgSurface, 0.92));
  P('--glass-border', hexToRgba(t.borderMid, 0.6));
  P('--dialog-bg', t.bgRaised);
  P('--subtabs-bg', hexToRgba(t.bgRaised, 0.6));
  P('--notif-bg', hexToRgba(t.bgSurface, 0.9));
  P('--tutorial-bg', `linear-gradient(135deg,${t.bgRaised},${t.bgOverlay})`);
  P('--changelog-header-bg', `linear-gradient(135deg,${hexToRgba(t.primary, 0.15)},${hexToRgba(t.primary, 0.05)})`);
  P('--swipe-hint-bg', t.swipeHintBg || 'rgba(255,255,255,0.08)');
  P('--preview-card-bg', t.previewCardBg || 'rgba(18,18,26,0.95)');
  P('--home-stats-bg', t.homeStatsBg || 'rgba(8,10,16,0.75)');
  P('--stat-badge-bg', t.statBadgeBg || 'rgba(255,255,255,0.04)');
  P('--orb-bg', t.orbBg || 'rgba(10,12,20,.85)');
  P('--cal-deficit', t.calDeficit || '#0a3d22');
  P('--cal-deficit2', t.calDeficit2 || '#0d1f10');
  P('--cal-surplus', t.calSurplus || '#3d1500');
  P('--cal-surplus2', t.calSurplus2 || '#1f0e00');
  P('--cal-balanced', t.calBalanced || '#0a2a4d');
  P('--cal-balanced2', t.calBalanced2 || '#050f1a');
  P('--badge-blue-bg', t.badgeBlueBg); P('--badge-teal-bg', t.badgeTealBg);
  P('--badge-energy-bg', t.badgeEnergyBg); P('--badge-green-bg', t.badgeGreenBg);
  P('--badge-amber-bg', t.badgeAmberBg); P('--badge-red-bg', t.badgeRedBg);
  P('--grade-a-bg', t.gradeABg); P('--grade-b-bg', t.gradeBBg);
  P('--grade-c-bg', t.gradeCBg); P('--grade-d-bg', t.gradeDBg);
  P('--grade-e-bg', t.gradeEBg);
  P('--cal-day-done-bg', t.calDayDoneBg || '#0a3d22'); P('--cal-day-done-border', t.calDayDoneBorder || '#1a6d3a');
  P('--hm-1-bg', t.hm1Bg || 'rgba(76,219,138,0.2)'); P('--hm-1-border', t.hm1Border || 'rgba(76,219,138,0.27)');
  P('--hm-2-bg', t.hm2Bg || 'rgba(76,219,138,0.47)'); P('--hm-2-border', t.hm2Border || 'rgba(76,219,138,0.53)');
  P('--hm-3-bg', t.hm3Bg || '#4cdb8a'); P('--hm-3-border', t.hm3Border || '#4cdb8a');
  P('--ach-earned-glow', t.achEarnedGlow || 'rgba(61,40,0,0.07)');
  P('--task-overdue-bg', t.taskOverdueBg || 'rgba(61,10,10,0.09)');
  P('--task-completed-bg', t.taskCompletedBg || 'rgba(10,61,34,0.09)');
  P('--timer-ok-bg', t.timerOkBg || 'rgba(10,42,77,0.13)');
  P('--timer-warn-bg', t.timerWarnBg || 'rgba(61,40,0,0.13)');
  P('--timer-over-bg', t.timerOverBg || 'rgba(61,10,10,0.13)');
  P('--overlay-scrim', t.overlayScrim || 'rgba(0,0,0,0.85)');
  P('--changelog-scrim', t.changelogScrim || 'rgba(0,0,0,0.56)');
  if (S.accentColor) {
    P('--primary', S.accentColor);
    P('--primary-rgb', hexToRgb(S.accentColor));
  }
  // ponytail: persist critical tokens so the inline head script can pre-paint
  // the splash in the right theme before modules load (no hardcoded colors)
  try {
    localStorage.setItem('zf_theme_critical', JSON.stringify({
      bg: t.bgBase, primary: S.accentColor || t.primary, text: t.textPrimary,
    }));
  } catch {}
  window.ZF.applyBg();
}

export function applyTheme(id) {
  if (String(id).startsWith('custom:')) {
    const t = getCustomThemes().find((x) => x.id === String(id).slice(7));
    if (t) {
      applyThemeObject(t, id);
      try {
        if (t.bgImage) update((s) => { s.bgImage = t.bgImage; s.bgType = t.bgType || 'image'; }, { silent: true });
        update((s) => {
          if (t.particleEffect) s.particleEffect = t.particleEffect === 'sparks' ? 'embers' : t.particleEffect;
          if (t.p_hue != null) s.particleHue = Number(t.p_hue);
          if (t.particleSpeed != null) s.particleSpeed = Math.min(3, Math.max(0.2, Number(t.particleSpeed)));
          if (t.particleCount != null) s.particleCount = Math.min(150, Math.max(0, Number(t.particleCount)));
          if (t.bgFit) s.bgFit = t.bgFit;
          // orientation travels with the theme when the builder set it
          if (t.bgRotate != null) s.bgRotate = [0, 90, 180, 270].includes(Number(t.bgRotate)) ? Number(t.bgRotate) : 0;
          if (t.bgFlipH != null || t.bgFlipV != null) { s.bgFlipH = !!t.bgFlipH; s.bgFlipV = !!t.bgFlipV; }
          if (t.glassBlur != null) s.glassBlur = Math.min(30, Math.max(0, Number(t.glassBlur)));
          if (t.glassAlpha != null) s.glassAlpha = Math.min(0.95, Math.max(0.1, Number(t.glassAlpha)));
        }, { silent: true });
        window.ZF?.save(); window.ZF?.applyBg();
      } catch {}
    }
    return;
  }
  if (THEMES[id]) applyThemeObject(THEMES[id], id);
}
