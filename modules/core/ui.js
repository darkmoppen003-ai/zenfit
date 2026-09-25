/* ── ZenFit V2 · core/ui.js ────────────────────────────────
   Shared DOM helpers: header, toasts, overlay, particles,
   background engine, SFX stubs. Used by ALL feature modules.
────────────────────────────────────────────────────────────── */
import { escapeHtml } from './sanitize.js';
import { S, addXP, update, resolveBgSrc } from './store.js';
import { xpForLevel, rankForLevel } from './utils.js';

export function el(id) { return document.getElementById(id); }

/** Desktop + mobile keyboard: Enter inside an input triggers an action. */
export function onEnter(input, action) {
  if (!input) return;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      action();
    }
  });
}

import { ICONS, icon } from './icons.js';
export { ICONS, icon };

/* Inbox message backgrounds (shared by inbox render + admin designer). */
export const MSG_BGS = {
  none: '',
  sunset: 'linear-gradient(135deg,#ff7a1a,#ff4d6a)',
  ocean: 'linear-gradient(135deg,#00b6ff,#4a9eff)',
  forest: 'linear-gradient(135deg,#0a3d22,#00d4aa)',
  royal: 'linear-gradient(135deg,#3a2099,#bf00ff)',
  ember: 'linear-gradient(135deg,#3d0a0a,#f5a623)',
  midnight: 'linear-gradient(135deg,#0a1228,#1e3060)',
};
export const MSG_HLS = {
  none: '', primary: 'var(--primary)', success: 'var(--success)',
  warning: 'var(--warning)', danger: 'var(--danger)', info: 'var(--info)',
};


/* Toast notifications — V1 API: showNotif(msg, icon).
   Icon map: 'XP'→⚡ '★'→🏆 'OK'→✓ '!'/'×'→⚠️, else raw emoji.
   Newest appears on top. */
export function showNotif(msg, icon = '+') {
  let c = el('notif-container');
  if (!c) { c = document.createElement('div'); c.id = 'notif-container'; document.body.appendChild(c); }
  const d = document.createElement('div');
  d.className = 'notif';
  if (icon === 'XP') d.classList.add('notif-xp');
  else if (icon === '★') d.classList.add('notif-success');
  else if (icon === '!' || icon === '×') d.classList.add('notif-danger');
  else if (icon === 'OK') d.classList.add('notif-success');
  const glyph = icon === 'XP' ? '⚡' : icon === '★' ? '🏆' : icon === 'OK' ? '✓' : icon === '!' ? '⚠️' : icon;
  d.innerHTML = `<span style="margin-right:8px;font-size:16px">${escapeHtml(glyph)}</span><span>${escapeHtml(msg)}</span>`;
  c.insertBefore(d, c.firstChild);
  while (c.children.length > 4) c.lastChild.remove();
  setTimeout(() => {
    d.style.transition = 'opacity .3s,transform .3s';
    d.style.opacity = '0'; d.style.transform = 'translateX(40px)';
    setTimeout(() => d.remove(), 450);
  }, 2600);
  if (icon === 'XP') sfx('xp');
  else if (icon === '★') sfx('achievement');
  else sfx('notif');
}

/* V1 celebrateFirst: one-time message per key (mascot-grade moment). */
export function celebrateFirst(key, msg) {
  if (S.featureFlags?.[key]) return;
  update((s) => { s.featureFlags = { ...(s.featureFlags || {}), [key]: true }; });
  showNotif(msg, '★');
}
export function awardXP(amount, reason = '') {
  if (!amount || amount <= 0) return { leveled: false };
  const r = addXP(amount, reason || 'Bonus');
  showNotif(`+${amount} XP — ${reason}`, 'XP');
  if (r.leveled) showLevelUp(r.to);
  // V1 parity: challenge progress + throttled global sync on every gain
  try {
    import('./peer.js').then((m) => m.trackChallengeProgress()).catch(() => {});
    import('./cloud.js').then((m) => m.syncGlobalIfOptedIn()).catch(() => {});
  } catch {}
  return r;
}

/* Modal overlay. Returns close fn. */
export function openOverlay(html) {
  closeOverlay();
  const o = document.createElement('div');
  o.className = 'overlay'; o.id = 'zf-overlay';
  o.innerHTML = `<div class="overlay-box">${html}</div>`;
  o.addEventListener('pointerdown', (e) => { if (e.target === o) closeOverlay(); });
  document.body.appendChild(o);
  return closeOverlay;
}
export function closeOverlay() { el('zf-overlay')?.remove(); }

/* Level-up / rank-up overlay (character GIF + congrats + confetti on rank-up) */
const RANK_COLORS = { E: '#888', D: '#4cdb8a', C: '#4a9eff', B: '#c084fc', A: '#f5a623', S: '#ff5a5a' };
const RANK_CREST = { S: 'crown', A: 'zap', B: 'shieldRank', C: 'bow', D: 'dagger', E: 'fist' };
const RANK_NAMES_LVL = { E: 'Novice Hunter', D: 'Awakened Hunter', C: 'Rising Warrior', B: 'Iron Sentinel', A: 'Apex Predator', S: 'Legendary Sovereign' };
export function showLevelUp(level) {
  const newRank = rankForLevel(level);
  const oldRank = rankForLevel(level - 1);
  const isRankUp = newRank !== oldRank;
  if (isRankUp) sfx('rankup'); else sfx('levelup');
  const rc = RANK_COLORS[newRank] || '#7b5eff';
  openOverlay(`<div style="position:relative;text-align:center;overflow:visible">
    ${isRankUp ? '' : `<div style="width:40px;height:40px;margin:0 auto 6px;color:${rc}">${ICONS.zap}</div>`}
    <h2 style="font-family:var(--font-display);color:${rc}">${isRankUp ? `🎉 RANK UP — ${newRank}!` : `LEVEL ${level}!`}</h2>
    <p style="color:var(--text-secondary);font-size:13px">${isRankUp ? `Congratulations, Hunter! ${RANK_NAMES_LVL[newRank]} unlocked. Greater quests await.` : 'Power grows. Keep pushing.'}</p>
    <div class="xp-bar-wrap mt12"><div class="xp-bar" style="width:${Math.round((S.player.xp / xpForLevel(level)) * 100)}%;background:${rc}"></div></div>
    <button class="btn btn-primary mt12" onclick="document.getElementById('zf-overlay')?.remove()">Claim</button>
  </div>`);
  if (isRankUp) setTimeout(fireLevelConfetti, 50);
}

function fireLevelConfetti() {
  celebrateBurst(80);
}

/** Fullscreen confetti shower (rank-ups, inbox surprises). Self-cleaning. */
export function celebrateBurst(count = 80) {
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:100006;';
  document.body.appendChild(cv);
  cv.width = window.innerWidth; cv.height = window.innerHeight;
  const ctx = cv.getContext('2d');
  const colors = ['#7b5eff', '#4cdb8a', '#4a9eff', '#f5a623', '#ff5a5a', '#fff'];
  const ps = Array.from({ length: count }, () => ({
    x: Math.random() * cv.width, y: -10 - Math.random() * cv.height * 0.3,
    vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3 + 2,
    c: colors[Math.floor(Math.random() * colors.length)], life: 1,
  }));
  let frames = 0;
  const tick = () => {
    if (!document.body.contains(cv)) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ps.forEach((p) => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= 0.008;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x, p.y, 6, 4);
    });
    ctx.globalAlpha = 1;
    if (++frames < 180) requestAnimationFrame(tick);
    else cv.remove();
  };
  tick();
}

/* Collapsible section header (V1 exact: left icon, rotating ▼).
   variant 'default-collapsed' (customization) vs 'default-open' (profile). */
export function collapseHeader(key, title, icon, sub, variant = 'default-open') {
  const collapsed = variant === 'default-collapsed'
    ? !(S.collapsedSections && S.collapsedSections[key] === false)
    : !!(S.collapsedSections && S.collapsedSections[key]);
  return `<div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:10px 0" data-collapse="${escapeHtml(key)}">`
    + `<div style="display:flex;align-items:center;gap:8px">`
    + `<span style="font-size:15px">${icon || '▸'}</span>`
    + `<div><div style="font-size:13px;font-weight:600">${escapeHtml(title)}</div>`
    + (sub ? `<div style="font-size:11px;color:var(--text-muted);margin-top:1px">${escapeHtml(sub)}</div>` : '')
    + `</div></div>`
    + `<span id="${escapeHtml(key)}-chev" style="font-size:12px;color:var(--text-muted);transition:transform .25s;transform:${collapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}">▼</span></div>`;
}

/** V1 toggleCollapse: flip class + flag + chevron, no re-render. */
export function toggleCollapse(id) {
  const body = document.getElementById(id);
  if (!body) return;
  const collapsed = body.classList.toggle('collapsed');
  update((s) => { s.collapsedSections = { ...(s.collapsedSections || {}), [id]: collapsed }; }, { silent: true });
  window.ZF.save();
  const chev = document.getElementById(`${id}-chev`);
  if (chev) chev.style.transform = collapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
}

/** Wire all [data-collapse] headers inside a rendered root. */
export function wireCollapsibles(root) {
  root.querySelectorAll('[data-collapse]').forEach((h) => {
    if (h.dataset.wired) return;
    h.dataset.wired = '1';
    h.onclick = () => toggleCollapse(h.dataset.collapse);
  });
}

/* ── Background engine (solid / image + dim + particles) ──
   Position model: bgOffX/bgOffY offsets in -100..+100,
   0 = centered (background-position 50%). Legacy bgPosX/
   bgPosY (0..100) migrate automatically on first apply. */
function bgOffsets() {
  let { bgOffX, bgOffY, bgPosX, bgPosY } = S;
  if (bgOffX == null && bgPosX != null) {
    bgOffX = Math.round((bgPosX - 50) * 2);
    bgOffY = Math.round(((bgPosY ?? 50) - 50) * 2);
    S.bgOffX = bgOffX; S.bgOffY = bgOffY;
  }
  return { x: bgOffX ?? 0, y: bgOffY ?? 0 };
}
export function bgPosPercent() {
  const { x, y } = bgOffsets();
  return { x: 50 + x / 2, y: 50 + y / 2 };
}
export function applyBackgroundConfig() {
  const st = S;
  document.body.classList.toggle('glass-mode', !!st.glassMode);
  document.documentElement.style.setProperty('--glass-blur', `${st.glassBlur ?? 4}px`);
  document.documentElement.style.setProperty('--glass-alpha', `${st.glassAlpha ?? 0.55}`);
  if (st.particleHue != null) document.documentElement.style.setProperty('--particle-hue', String(st.particleHue));
  let bg = el('zf-bg');
  if (!bg) {
    bg = document.createElement('div');
    bg.id = 'zf-bg';
    bg.style.cssText = 'position:fixed;inset:0;z-index:0;background-size:cover;background-position:center;pointer-events:none;';
    document.body.prepend(bg);
    const dim = document.createElement('div');
    dim.id = 'zf-bg-dim';
    dim.style.cssText = 'position:fixed;inset:0;z-index:0;background:#000;opacity:0;pointer-events:none;';
    bg.after(dim);
  }
  const dim = el('zf-bg-dim');
  if (st.bgType === 'image' && st.bgImage) {
    bg.style.backgroundImage = 'none';
    bg.style.background = 'var(--app-bg)';
    resolveBgSrc(st.bgImage).then((url) => {
      if (!url || S.bgImage !== st.bgImage) return;
      const layer = document.getElementById('zf-bg');
      if (!layer) return;
      layer.style.backgroundImage = `url("${url}")`;
      layer.style.backgroundSize = S.bgFit || 'cover';
      const pos = bgPosPercent();
      layer.style.backgroundPosition = `${pos.x}% ${pos.y}%`;
      const z = (S.bgZoom ?? 100) / 100;
      layer.style.transform = z === 1 ? '' : `scale(${z})`;
    });
    if (dim) dim.style.opacity = String((st.bgDim ?? 40) / 100);
  } else {
    bg.style.backgroundImage = 'none';
    bg.style.background = 'var(--app-bg)';
    if (dim) dim.style.opacity = '0';
  }
  if (st.accentColor) document.documentElement.style.setProperty('--primary', st.accentColor);
  const navEls = document.querySelectorAll('.bottom-nav');
  if (st.navOpacity === false || st.navOpacityVal < 100) {
    navEls.forEach((b) => { b.style.opacity = String((st.navOpacityVal ?? 100) / 100); });
  }
  renderParticles();
}

function renderParticles() {
  try { window.__zfRaf && cancelAnimationFrame(window.__zfRaf); } catch {}
  window.__zfResize && window.removeEventListener('resize', window.__zfResize);
  el('zf-particles')?.remove();
  if (!S.particlesEnabled) return;
  const c = document.createElement('canvas');
  c.id = 'zf-particles';
  c.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;';
  const anchor = document.getElementById('zf-bg-dim') || document.getElementById('zf-bg');
  if (anchor?.after) anchor.after(c);
  else document.body.prepend(c);
  const ctx = c.getContext('2d');
  const N = Math.min(S.particleCount || 50, 150);
  const effect = S.particleEffect || 'dust';
  const hue = Number(S.particleHue ?? (getComputedStyle(document.documentElement).getPropertyValue('--particle-hue').trim() || '250')) || 250;
  const sp = Number(S.particleSpeed ?? 1) || 1;
  const R = (a, b) => a + Math.random() * (b - a);
  let parts = [];
  const density = 0.25 + 0.75 * Math.min(1, N / 150);
  const buildMatrix = () => {
    const cols = Math.max(10, Math.floor(c.width / 16));
    parts = Array.from({ length: cols }, (_, i) => ({ x: i * 16, y: R(0, c.height), s: R(0.5, 1.6), gap: 18, active: Math.random() < density, trail: Array.from({ length: 5 }, () => null), seed: Math.random() }));
  };
  const buildCyber = () => {
    parts = Array.from({ length: N }, () => ({ x: R(0, c.width), y: R(0, c.height), len: R(10, 30), s: R(0.5, 1.6), col: Math.random() > 0.5 }));
  };
  const resize = () => {
    c.width = innerWidth; c.height = innerHeight;
    if (effect === 'matrix') buildMatrix();
    else if (effect === 'cyber') buildCyber();
    else parts.forEach((p) => { p.x = Math.min(p.x, c.width); p.y = Math.min(p.y, c.height); });
  };
  resize();
  window.__zfResize = resize;
  window.addEventListener('resize', resize);
  if (effect !== 'matrix' && effect !== 'cyber') {
    parts = Array.from({ length: N }, () => ({
      x: R(0, c.width), y: R(0, c.height), r: R(0.5, 2.5),
      s: R(0.2, 0.8), ph: R(0, 6.28), sway: R(0, 1), vx: R(-0.3, 0.3),
    }));
  }
  const glyphs = '01アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEFﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃ';
  const hiddenWords = ['DARK', 'MOPPEN', 'SHIVAM', '8958'];
  let raf = 0, t = 0;
  const mx = { x: -9999, y: -9999 };
  const onMove = (e) => { const p = e.touches?.[0] || e; mx.x = p.clientX; mx.y = p.clientY; };
  window.addEventListener('pointermove', onMove, { passive: true });
  const tick = () => {
    t += 0.016 * sp;
    if (effect === 'matrix') {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.font = 'bold 16px monospace';
      const v1Green = `hsla(155,75%,60%,0.95)`;
      parts.forEach((p) => {
        if (!p.active) return;
        p.trail.pop();
        let ch;
        if (p.seed < 0.02) {
          const w = hiddenWords[Math.floor(Math.random() * hiddenWords.length)];
          p.hidden = w.split('');
          p.seed = 1;
        }
        if (p.hidden?.length) ch = p.hidden.shift();
        else ch = glyphs[Math.floor(Math.random() * glyphs.length)];
        p.trail.unshift(ch);
        p.trail.forEach((tc, idx) => {
          if (!tc) return;
          const yy = p.y - idx * p.gap;
          if (idx === 0) { ctx.fillStyle = '#fff'; ctx.globalAlpha = 1; }
          else { ctx.fillStyle = v1Green; ctx.globalAlpha = Math.max(0.15, 0.95 - idx * 0.2); }
          ctx.fillText(tc, p.x, yy);
        });
        ctx.globalAlpha = 1;
        p.y += p.s * 0.8 * sp;
        if (p.y - p.trail.length * p.gap > c.height + 20) { p.y = R(-40, 0); p.s = R(0.5, 1.6); p.seed = Math.random(); p.trail = Array.from({ length: 5 }, () => null); }
      });
      ctx.globalAlpha = 1;
    } else ctx.clearRect(0, 0, c.width, c.height);
    if (effect === 'snow') {
      parts.forEach((p) => {
        p.y += (p.s + 0.4) * sp; p.x += Math.sin(t + p.ph) * 0.4 * sp;
        if (p.y > c.height + 4) { p.y = -4; p.x = R(0, c.width); }
        if (p.x > c.width + 4) p.x = -4; if (p.x < -4) p.x = c.width + 4;
        ctx.fillStyle = `hsla(${hue},85%,92%,${(0.3 + (p.r / 4) * 0.6).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      });
    } else if (effect === 'sparks') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      parts.forEach((p) => {
        p.y -= (p.s + 1.2) * sp; p.x += Math.sin(t * 3 + p.ph) * 0.9 * sp;
        if (p.y < -12) { p.y = c.height + 12; p.x = R(0, c.width); p.len = R(4, 12); }
        if (!p.len) p.len = R(4, 12);
        const flick = 0.55 + 0.45 * Math.sin(t * 9 + p.ph);
        const h = 18 + p.r * 8;
        ctx.strokeStyle = `hsla(${h},100%,55%,${(0.9 * flick).toFixed(2)})`;
        ctx.lineWidth = 1.6;
        ctx.shadowBlur = 6;
        ctx.shadowColor = `hsla(${h},100%,50%,0.9)`;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - p.len); ctx.stroke();
      });
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';
    } else if (effect === 'firefly') {
      ctx.globalCompositeOperation = 'lighter';
      parts.forEach((p) => {
        const dx = mx.x - p.x, dy = mx.y - p.y, d2 = dx * dx + dy * dy;
        if (d2 < 40000 && d2 > 100) { p.x += (dx / Math.sqrt(d2)) * 0.4 * sp; p.y += (dy / Math.sqrt(d2)) * 0.4 * sp; }
        p.x += Math.sin(t * 0.7 + p.ph) * 0.5 * sp; p.y += Math.cos(t * 0.5 + p.ph) * 0.4 * sp;
        const a = 0.3 + 0.7 * Math.abs(Math.sin(t * 2 + p.ph));
        const h = (hue + p.sway * 60) % 360;
        ctx.fillStyle = `hsla(${h},100%,65%,${(0.08 * a).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, (p.r + 0.5) * 4, 0, 7); ctx.fill();
        ctx.fillStyle = `hsla(${h},100%,70%,${(0.2 * a).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, (p.r + 0.5) * 2, 0, 7); ctx.fill();
        ctx.fillStyle = `hsla(${h},100%,75%,${a.toFixed(2)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 0.5, 0, 7); ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';
    } else if (effect === 'cyber') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = 1.8;
      const dir = S.cyberDirection || 'straight';
      parts.forEach((p) => {
        if (dir === 'diagonal') {
          p.x += p.s * 3 * sp; p.y += p.s * 1.5 * sp;
          if (p.x > c.width + 20 || p.y > c.height + 20) {
            if (Math.random() < 0.6) { p.x = R(0, c.width); p.y = R(-40, -10); }
            else { p.x = R(-40, -10); p.y = R(0, c.height); }
            p.s = R(0.5, 1.6);
          }
        } else {
          p.y += (p.s * 6 + 2) * sp;
          if (p.y > c.height + 30) { p.y = -30; p.x = R(0, c.width); p.len = R(10, 30); p.s = R(0.5, 1.6); }
        }
        ctx.strokeStyle = p.col ? `hsla(${hue},95%,60%,0.9)` : 'hsla(190,95%,60%,0.9)';
        ctx.shadowBlur = 8;
        ctx.shadowColor = ctx.strokeStyle;
        if (dir === 'diagonal') { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 12, p.y - 6); ctx.stroke(); }
        else { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - p.len); ctx.stroke(); }
      });
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';
    } else {
      parts.forEach((p) => {
        const dx = p.x - mx.x, dy = p.y - mx.y, d2 = dx * dx + dy * dy;
        if (d2 < 40000 && d2 > 1) { p.x += (dx / Math.sqrt(d2)) * 0.6 * sp; p.y += (dy / Math.sqrt(d2)) * 0.6 * sp; }
        p.x += p.vx * sp; p.y -= p.s * sp;
        if (p.y < 0) { p.y = c.height; p.x = R(0, c.width); }
        if (p.x < 0) p.x = c.width; if (p.x > c.width) p.x = 0;
        const pulse = 0.7 + 0.3 * Math.sin(t * 3 + p.ph);
        if (p.r > 1.5) {
          ctx.fillStyle = `hsla(${hue},80%,70%,0.12)`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.5 * pulse, 0, 7); ctx.fill();
        }
        ctx.fillStyle = `hsla(${hue},80%,70%,${(0.55 * pulse).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      });
      ctx.strokeStyle = `hsla(${hue},80%,70%,.12)`;
      ctx.lineWidth = 0.5;
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          const a = parts[i], b = parts[j];
          const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 < 14400) {
            ctx.globalAlpha = (1 - d2 / 14400) * 0.5;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
        if (i > 80) break;
      }
      ctx.globalAlpha = 1;
    }
    window.__zfRaf = raf = requestAnimationFrame(tick);
  };
  tick();
  c._stop = () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', onMove); window.removeEventListener('resize', resize); };
}

/* ── SFX: WebAudio tone engine (V1 parity, no assets) ── */
let audioCtx = null;
let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  try { ensureCtx().resume(); audioUnlocked = true; } catch {}
}
if (typeof document !== 'undefined') {
  document.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
  document.addEventListener('click', unlockAudio, { once: true, passive: true });
}
function ensureCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function tone(freq, { type = 'sine', dur = 0.15, vol = 0.05, when = 0 } = {}) {
  const c = ensureCtx();
  const t = c.currentTime + when;
  const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 4000;
  o.type = type; o.frequency.value = freq;
  o.connect(f); f.connect(g); g.connect(c.destination);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t); o.stop(t + dur + 0.02);
}
const SFX_TONES = {
  nav: [[440, {}]],
  xp: [[520, {}], [780, { when: 0.07 }]],
  quest: [[523, {}], [659, { when: 0.08 }], [784, { when: 0.16 }]],
  water: [[300, { type: 'sine', dur: 0.2 }], [420, { when: 0.09, dur: 0.18 }]],
  notif: [[660, { dur: 0.1 }]],
  success: [[660, {}], [880, { when: 0.08 }]],
  levelup: [[523, {}], [659, { when: 0.1 }], [784, { when: 0.2 }], [1046, { when: 0.3, dur: 0.25 }]],
  rankup: [[392, {}], [523, { when: 0.12 }], [659, { when: 0.24 }], [784, { when: 0.36 }], [1046, { when: 0.48, dur: 0.3 }]],
  achievement: [[784, {}], [1046, { when: 0.1, dur: 0.25 }]],
};
export function sfx(kind = 'nav') {
  if (!S.soundEnabled) return;
  try {
    (SFX_TONES[kind] || SFX_TONES.nav).forEach(([freq, opts]) => tone(freq, opts));
  } catch { /* audio unavailable — silent */ }
}
