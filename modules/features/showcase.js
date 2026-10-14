/* ── ZenFit V2 · features/showcase.js ──────────────────────
   Flex/stage screen: showcases the user's theme, wallpaper,
   interface style + profile card. Reads live state only —
   never writes earned data. Prefs live in S.showcase (v20).
   PNG export uses a zero-dependency DOM-snapshot renderer
   (SVG foreignObject → canvas → PNG), lazy + offline-safe.
────────────────────────────────────────────────────────────── */
import { S, update, resolveBgSrc } from '../core/store.js';
import { escapeHtml, sanitizeEnum } from '../core/sanitize.js';
import { showNotif, ICONS } from '../core/ui.js';
import { showcaseStats, habitStreak } from '../core/selectors.js';
import { animateNumbers } from '../core/animations.js';
import { xpForLevel } from '../core/utils.js';
import { ACHIEVEMENTS, earnedIds } from '../core/achievements.js';
import { LeaderboardAPI } from '../core/cloud.js';
import { THEMES } from '../core/themes.js';

/* Extensible card-style registry — add a third entry later, no refactor. */
export const CARD_STYLES = {
  default: { name: 'Default', icon: 'styleLiquid' },
  cyber: { name: 'Cyberpunk', icon: 'styleCyber' },
};

let __globalRank = null;
let __globalRankTried = false;
let __cleanup = null;

function sc() {
  const d = (S.showcase && typeof S.showcase === 'object') ? S.showcase : {};
  const dv = { showHeader: true, showCard: true, variant: 'long', showPill: true, showWallpaper: true, cardStyle: 'default', cardBackdrop: 'wallpaper', visible: {} };
  const visD = { streak: true, level: true, rank: true, globalRank: true, xp: true, strength: true, endurance: true, discipline: true, health: true, wisdom: true, achCount: true };
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
];

function bestStreak() {
  try {
    return (S.habits || []).reduce((a, h) => Math.max(a, h.streak || habitStreak(h) || 0), 0);
  } catch { return 0; }
}

function avatarHTML(size = 64) {
  const name = S.profile?.name || S.player?.name || 'Hunter';
  const init = escapeHtml(((name[0] || 'H').toUpperCase()));
  if (S.profilePic) return `<img src="${S.profilePic}" alt="" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:2px solid var(--primary);flex-shrink:0">`;
  return `<span style="width:${size}px;height:${size}px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:${Math.round(size * 0.4)}px;font-family:var(--font-display);background:var(--primary-dim);color:var(--primary);border:2px solid var(--primary)">${init}</span>`;
}

function statCell(iconName, label, value) {
  return `<div class="card-sm sc-stat" style="text-align:center;padding:10px 6px">`
    + `<div style="width:20px;height:20px;margin:0 auto 4px;color:var(--primary)">${ICONS[iconName] || ''}</div>`
    + `<div class="sc-num" data-count="${value}" style="font-size:18px;font-weight:800;font-family:var(--font-display)">0</div>`
    + `<div style="font-size:10px;color:var(--text-muted)">${label}</div></div>`;
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

/* Paints the profile card at (dx,dy) width W. Returns painted height. */
async function paintCard(g, dx, dy, W, cfg, st, v, grank) {
  const cyber = cfg.cardStyle === 'cyber';
  const surf = cssVar('--bg-surface', '#0f1118');
  const prim = cssVar('--primary', '#7b5eff');
  const succ = cssVar('--success', '#22d98a');
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
  const topH = av + 8;
  const barH = 16;
  const cells = [];
  if (cfg.variant === 'long') {
    if (v.streak) cells.push(['Streak', String(bestStreak())]);
    if (v.globalRank) cells.push(['Global', grank]);
    if (v.achCount) cells.push([`of ${ACHIEVEMENTS.length}`, String(earnedIds().size)]);
    for (const d of STAT_DEFS) if (v[d.key]) cells.push([d.label, String(st[d.key])]);
  }
  const gap = 16;
  const cols = 3;
  const cellW = (cw - gap * (cols - 1)) / cols;
  const cellH = 118;
  const rows = Math.ceil(cells.length / cols);
  const gridH = rows ? rows * cellH + (rows - 1) * gap + 16 : 0;
  const footH = cfg.variant === 'long' ? 40 : 44;
  const cardH = pad + topH + 18 + barH + 16 + gridH + footH + pad;

  g.save();
  rr(g, dx, dy, W, cardH, cyber ? 10 : 28);
  g.clip();
  g.fillStyle = surf;
  g.fillRect(dx, dy, W, cardH);
  if (wpImg) {
    drawCover(g, wpImg, dx, dy, W, cardH);
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(dx, dy, W, cardH);
  } else if (cyber) {
    g.fillStyle = 'rgba(255,255,255,0.03)';
    for (let i = -cardH; i < W; i += 28) {
      g.beginPath(); g.moveTo(dx + i, dy + cardH); g.lineTo(dx + i + cardH, dy); g.lineTo(dx + i + cardH + 10, dy); g.lineTo(dx + i + 10, dy + cardH); g.closePath(); g.fill();
    }
  }
  // Avatar
  const ax = dx + pad;
  g.save();
  g.beginPath(); g.arc(ax + av / 2, y + av / 2, av / 2, 0, 7); g.clip();
  const pic = await loadImg(S.profilePic);
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
  // Name + sub
  const tx = ax + av + 24;
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillStyle = '#fff';
  g.font = `800 40px ${DISP}`;
  const nm = st.name.length > 16 ? `${st.name.slice(0, 15)}…` : st.name;
  g.fillText(nm, tx, y + 48);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.font = `500 24px ${DISP}`;
  g.fillText(`Lv ${v.level ? st.level : '—'}   RANK ${v.rank ? st.rank : '—'}   ${v.xp ? `${st.xp} XP` : ''}`, tx, y + 88);
  // Level badge
  const badge = `Lv ${st.level}`;
  g.font = `700 24px ${DISP}`;
  const bw = g.measureText(badge).width + 36;
  g.fillStyle = prim;
  rr(g, dx + W - pad - bw, y + 8, bw, 44, 22);
  g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center';
  g.fillText(badge, dx + W - pad - bw / 2, y + 39);
  g.textAlign = 'left';
  y += topH + 18;
  // XP bar
  const xpNeed = xpForLevel(st.level);
  const pct = Math.min(1, st.xp / Math.max(1, xpNeed));
  g.fillStyle = 'rgba(255,255,255,0.14)';
  rr(g, dx + pad, y, cw, barH, 8); g.fill();
  if (pct > 0) {
    const grad = g.createLinearGradient(dx + pad, 0, dx + pad + cw, 0);
    grad.addColorStop(0, prim); grad.addColorStop(1, succ);
    g.fillStyle = grad;
    rr(g, dx + pad, y, Math.max(barH, cw * pct), barH, 8); g.fill();
  }
  y += barH + 16;
  // Stat grid
  cells.forEach(([label, val], i) => {
    const cx = dx + pad + (i % cols) * (cellW + gap);
    const cy = y + Math.floor(i / cols) * (cellH + gap);
    g.fillStyle = 'rgba(255,255,255,0.07)';
    rr(g, cx, cy, cellW, cellH, cyber ? 6 : 14); g.fill();
    g.fillStyle = '#fff';
    g.font = `800 40px ${DISP}`;
    g.textAlign = 'center';
    g.fillText(val, cx + cellW / 2, cy + 62);
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.font = `500 20px ${DISP}`;
    g.fillText(label, cx + cellW / 2, cy + 94);
    g.textAlign = 'left';
  });
  y += gridH;
  // Footer
  const themeName = THEMES[S.theme]?.name || 'Custom';
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.font = `500 21px ${DISP}`;
  if (cfg.variant === 'long') {
    const pct2 = Math.round((earnedIds().size / ACHIEVEMENTS.length) * 100);
    g.fillText(`Achievements ${pct2}% · ${themeName} theme`, dx + pad, y + 28);
  } else {
    g.fillText(`Hunter card · ${v.streak ? `Streak ${bestStreak()}d` : ''} ${v.achCount ? `· ${earnedIds().size}/${ACHIEVEMENTS.length}` : ''}`, dx + pad, y + 28);
  }
  // Cyber frame
  if (cyber) {
    g.lineWidth = 4; g.strokeStyle = prim;
    rr(g, dx + 2, dy + 2, W - 4, cardH - 4, 10); g.stroke();
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
      // Paint card to measure, then compose stage.
      const tmp = document.createElement('canvas');
      tmp.width = W; tmp.height = 1600;
      const tg = tmp.getContext('2d');
      const cardH = await paintCard(tg, 0, 0, W, cfg, st, v, grank);
      const headH = cfg.showHeader ? 170 : 24;
      const pillH = cfg.showPill ? 70 : 8;
      const footH = 54;
      const H = headH + cardH + 24 + pillH + footH;
      cv = document.createElement('canvas');
      cv.width = W * scale; cv.height = Math.ceil(H) * scale;
      const g = cv.getContext('2d');
      g.scale(scale, scale);
      g.fillStyle = base;
      g.fillRect(0, 0, W, H);
      let y = 0;
      if (cfg.showHeader) {
        g.textAlign = 'center';
        g.fillStyle = tPri;
        g.font = `800 64px ${DISP}`;
        g.fillText('ZENFIT', W / 2, 78);
        const themeName = THEMES[S.theme]?.name || 'Custom';
        const wpName = !S.bgImage ? 'Solid' : String(S.bgImage).startsWith('preset:') ? String(S.bgImage).slice(7) : 'Custom';
        g.fillStyle = tMut;
        g.font = `500 22px ${DISP}`;
        g.fillText(`${themeName} · ${cfg.cardStyle === 'cyber' ? 'Cyberpunk HUD' : (S.uiStyle || 'liquid')} · ${wpName}`, W / 2, 122);
        g.textAlign = 'left';
        y = headH;
      } else y = 24;
      g.drawImage(tmp, 0, 0, W, cardH, 0, y, W, cardH);
      y += cardH + 24;
      if (cfg.showPill) {
        const n = 5;
        const dotR = 9;
        const span = 44;
        const x0 = W / 2 - ((n - 1) * span) / 2;
        const prim = cssVar('--primary', '#7b5eff');
        for (let i = 0; i < n; i++) {
          g.fillStyle = i === 1 ? prim : 'rgba(255,255,255,0.25)';
          g.beginPath(); g.arc(x0 + i * span, y + 20, dotR, 0, 7); g.fill();
        }
        y += pillH;
      }
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
      ${cfg.showHeader ? `
      <div class="card mb12 sc-hero" style="text-align:center;padding:18px 14px">
        <div style="font-size:26px;font-weight:800;font-family:var(--font-display);letter-spacing:3px">ZENFIT</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${escapeHtml(themeName)} · ${escapeHtml(cfg.cardStyle === 'cyber' ? 'Cyberpunk HUD' : (S.uiStyle || 'liquid'))} · ${escapeHtml(wpName)}</div>
      </div>` : ''}
      ${cfg.showCard ? `
      <div id="sc-export-short" class="card mb12 sc-card sc-${cfg.cardStyle === 'cyber' ? 'cyber' : 'default'}">
        <div class="sc-card-top" style="display:flex;align-items:center;gap:12px">
          ${avatarHTML(64)}
          <div style="flex:1;min-width:0">
            <div class="sc-name" style="font-size:19px;font-weight:800;font-family:var(--font-display);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(st.name)}</div>
            <div style="font-size:11px;color:var(--text-muted)">Lv ${v.level ? st.level : '—'} · <span style="color:${rc};font-weight:700">${v.rank ? `RANK ${escapeHtml(st.rank)}` : '—'}</span> · ${v.xp ? `${st.xp} XP` : ''}</div>
          </div>
          <span class="badge badge-purple">Lv ${st.level}</span>
        </div>
        <div class="xp-bar-wrap mt8"><div class="xp-bar sc-xpfill" data-w="${Math.min(100, Math.round((st.xp / Math.max(1, xpNeed)) * 100))}" style="width:0%"></div></div>
        ${cfg.variant === 'long' ? `
        <div class="grid3 mt8" style="gap:8px">
          ${v.streak ? statCell('flame', 'Streak', bestStreak()) : ''}
          ${v.globalRank ? `<div class="card-sm sc-stat" style="text-align:center;padding:10px 6px"><div style="width:20px;height:20px;margin:0 auto 4px;color:var(--primary)">${ICONS.globe}</div><div class="sc-num" id="sc-grank" style="font-size:16px;font-weight:800;font-family:var(--font-display)">${__globalRank || '…'}</div><div style="font-size:10px;color:var(--text-muted)">Global</div></div>` : ''}
          ${v.achCount ? statCell('trophy', `${earned.size}/${ACHIEVEMENTS.length}`, earned.size) : ''}
          ${STAT_DEFS.filter((d) => v[d.key]).map((d) => statCell(d.icon, d.label, st[d.key])).join('')}
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:6px">Achievements ${achPct}% · ${escapeHtml(themeName)} theme</div>
        ` : `
        <div style="font-size:12px;color:var(--text-secondary);margin-top:8px">Hunter card · ${v.streak ? `🔥 ${bestStreak()}d streak` : ''} ${v.achCount ? `· ${earned.size}/${ACHIEVEMENTS.length} achievements` : ''}</div>
        `}
      </div>` : `<div class="card mb12" style="text-align:center;color:var(--text-muted);font-size:12px">Card hidden — open the gear to show it.</div>`}
      ${cfg.showPill ? `
      <div class="sc-pill" aria-hidden="true"><span></span><span class="on"></span><span></span><span></span><span></span></div>` : ''}
      ${cfg.showWallpaper ? `<div style="font-size:10px;color:var(--text-muted);text-align:center">Wallpaper: ${escapeHtml(wpName)} · particles ${S.particlesEnabled ? 'on' : 'off'}</div>`
        : `<div style="font-size:10px;color:var(--text-muted);text-align:center">Wallpaper hidden in this flex</div>`}
    </div>
  </div>
  <button id="sc-gear" class="sc-gear" aria-label="Showcase options" style="width:48px;height:48px;border-radius:50%;background:var(--primary);border:none;color:#fff;font-size:20px;position:fixed;right:16px;bottom:108px;z-index:9990;display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow-lg);cursor:pointer;transition:opacity .25s,transform .25s"><span style="width:22px;height:22px;display:block">${ICONS.gear}</span></button>
  <div id="sc-sheet" class="sc-sheet" style="display:none">
    <div class="card" style="padding:14px">
      <div class="flex-between mb8"><div style="font-size:13px;font-weight:700">Showcase Studio</div><button class="btn btn-sm btn-ghost" id="sc-close">Close</button></div>
      <div class="grid2" style="gap:8px;margin-bottom:10px">
        ${[['showHeader', 'Header ZENFIT'], ['showCard', 'Card block'], ['showPill', 'Nav pill'], ['showWallpaper', 'Wallpaper']].map(([k, l]) => `
          <label style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;background:var(--bg-raised);border:1px solid var(--border-mid);border-radius:10px;padding:8px 10px;cursor:pointer">${l}
          <input type="checkbox" data-sc="${k}" ${cfg[k] ? 'checked' : ''} style="width:18px;height:18px"></label>`).join('')}
      </div>
      <div style="font-size:12px;font-weight:600;margin-bottom:6px">Version</div>
      <div class="flex gap8 mb8">
        ${['short', 'long'].map((x) => `<button class="btn btn-sm${cfg.variant === x ? ' btn-primary' : ''}" data-scvar="${x}" style="flex:1">${x}</button>`).join('')}
      </div>
      <div style="font-size:12px;font-weight:600;margin-bottom:6px">Card style</div>
      <div class="flex gap8 mb8">
        ${Object.entries(CARD_STYLES).map(([id, m]) => `<button class="btn btn-sm${cfg.cardStyle === id ? ' btn-primary' : ''}" data-scstyle="${id}" style="flex:1">${m.name}</button>`).join('')}
      </div>
      <div style="font-size:12px;font-weight:600;margin-bottom:6px">Card backdrop</div>
      <div class="flex gap8 mb8">
        ${[['wallpaper', 'Wallpaper'], ['theme', 'Theme']].map(([x, l]) => `<button class="btn btn-sm${cfg.cardBackdrop === x ? ' btn-primary' : ''}" data-scbdrop="${x}" style="flex:1">${l}</button>`).join('')}
      </div>
      <div style="font-size:12px;font-weight:600;margin-bottom:6px">Show info</div>
      <div class="grid2" style="gap:6px;margin-bottom:10px">
        ${VIS_DEFS.map(([k, l]) => `<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-secondary)"><input type="checkbox" data-scvis="${k}" ${v[k] ? 'checked' : ''} style="width:16px;height:16px">${l}</label>`).join('')}
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
      window.anime({ targets: host.querySelectorAll('.sc-hero,.sc-card'), opacity: [0, 1], translateY: [16, 0], duration: 420, delay: window.anime.stagger(90), easing: 'easeOutBack(1.3)' });
    }
  } catch {}
  animateNumbers(host);

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
    gear.style.opacity = '1';
    gear.style.pointerEvents = 'auto';
    gear.style.transform = 'scale(1)';
    clearTimeout(idleT);
    idleT = setTimeout(() => {
      if (sheet.style.display === 'block') return;
      gear.style.opacity = '0';
      gear.style.pointerEvents = 'none';
      gear.style.transform = 'scale(.7)';
    }, 1000);
  };
  const onAct = () => poke();
  const wake = () => { if (gear.style.opacity === '0') poke(); };
  document.addEventListener('pointermove', onAct, { passive: true });
  document.addEventListener('pointerdown', onAct, { passive: true });
  document.addEventListener('keydown', onAct);
  host.addEventListener('pointerdown', wake);
  poke();
  __cleanup = () => {
    clearTimeout(idleT);
    document.removeEventListener('pointermove', onAct);
    document.removeEventListener('pointerdown', onAct);
    document.removeEventListener('keydown', onAct);
  };

  gear.onclick = (e) => {
    e.stopPropagation();
    const open = sheet.style.display === 'block';
    sheet.style.display = open ? 'none' : 'block';
    if (!open) {
      poke();
      try {
        if (window.anime && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
          window.anime({ targets: sheet.firstElementChild, opacity: [0, 1], translateY: [18, 0], duration: 280, easing: 'easeOutBack(1.4)' });
        }
      } catch {}
    } else poke();
  };
  host.querySelector('#sc-close').onclick = () => { sheet.style.display = 'none'; poke(); };

  host.querySelectorAll('[data-sc]').forEach((c) => {
    c.onchange = () => { set({ [c.dataset.sc]: c.checked }); window.ZF.save(); window.ZF.rerender(); };
  });
  host.querySelectorAll('[data-scvar]').forEach((b) => {
    b.onclick = () => { set({ variant: sanitizeEnum(b.dataset.scvar, ['short', 'long'], 'long') }); window.ZF.save(); window.ZF.rerender(); };
  });
  host.querySelectorAll('[data-scstyle]').forEach((b) => {
    b.onclick = () => { set({ cardStyle: sanitizeEnum(b.dataset.scstyle, ['default', 'cyber'], 'default') }); window.ZF.save(); showNotif(`Card style: ${CARD_STYLES[b.dataset.scstyle]?.name || b.dataset.scstyle}`, 'OK'); window.ZF.rerender(); };
  });
  host.querySelectorAll('[data-scbdrop]').forEach((b) => {
    b.onclick = () => { set({ cardBackdrop: sanitizeEnum(b.dataset.scbdrop, ['wallpaper', 'theme'], 'wallpaper') }); window.ZF.save(); window.ZF.rerender(); };
  });
  host.querySelectorAll('[data-scvis]').forEach((c) => {
    c.onchange = () => { setVis(c.dataset.scvis, c.checked); window.ZF.save(); window.ZF.rerender(); };
  });
  host.querySelector('#sc-share-long').onclick = () => exportPNG('long');
  host.querySelector('#sc-share-short').onclick = () => exportPNG('short');
}
