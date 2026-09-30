/* ── ZenFit V2 · features/inbox.js ─────────────────────────
   User inbox: local messages + global broadcasts/events/rewards.
   Hidden route — accessible ONLY via More popover.
   Global: Supabase tables (see cloud.js GlobalBoard). Rewards are
   claimed once (claimedRewards IDs) — no double-XP.
────────────────────────────────────────────────────────────── */
import { S, update, save, deductXP } from '../core/store.js';
import { escapeHtml } from '../core/sanitize.js';
import { uid } from '../core/utils.js';
import { showNotif, awardXP, celebrateBurst, MSG_BGS, MSG_HLS } from '../core/ui.js';

const isRead = (mid) => (S.inboxRead || []).includes(mid);
const isRewardMsg = (m) => m.kind === 'reward' && Number.isFinite(Number(m.xp));

/* Global broadcasts mirrored as threads (same template as device mail). */
let gThreads = [];
const gReadIds = () => {
  try { return JSON.parse(localStorage.getItem('zf_global_read') || '[]'); } catch { return []; }
};
const gMarkRead = (id) => {
  try {
    const arr = gReadIds();
    if (!arr.includes(id)) localStorage.setItem('zf_global_read', JSON.stringify([...arr, id].slice(-100)));
  } catch {}
};
const isGRead = (m) => gReadIds().includes('g-' + (m.id || m.title));
const isGHidden = (m) => (S.hiddenGlobals || []).includes('g-' + (m.id || m.title));
function trueUnreadCount() {
  try {
    const hidden = new Set(S.hiddenGlobals || []);
    const g = gThreads.filter((m) => !hidden.has('g-' + (m.id || m.title)) && !isGRead(m)).length;
    const l = (S.inbox || []).filter((m) => !isRead(m.id)).length;
    return g + l;
  } catch { return null; }
}
/** Downward-only heal: the badge can only get stuck HIGH (reads that never
   decremented), so trim it to truth without ever inflating it. */
export function healUnreadCount() {
  const t = trueUnreadCount();
  if (t == null) return;
  update((s) => { if ((s.inboxUnread || 0) > t) s.inboxUnread = t; }, { silent: true });
  try { save(); } catch {}
}
const gVers = () => { try { return JSON.parse(localStorage.getItem('zf_global_versions') || '{}'); } catch { return {}; } };
// ponytail: edited globals carry updated_at — version change re-marks as unread (silent replace, fresh badge)
const gVerOf = (r) => r?.updated_at || `${r?.created_at || ''}|${(r?.title || '').length}-${(r?.body || r?.descr || r?.desc || '').length}`;
const gNoteEdited = (gid, ver) => {
  try {
    const vs = gVers();
    const prev = vs[gid];
    vs[gid] = ver;
    localStorage.setItem('zf_global_versions', JSON.stringify(vs));
    if (prev && prev !== ver) {
      const read = gReadIds().filter((id) => id !== gid);
      localStorage.setItem('zf_global_read', JSON.stringify(read.slice(-100)));
      return true;
    }
  } catch {}
  return false;
};
const IMG_RE = /^((https?:|data:image\/|blob:)[^\s"'<>]*)$/;
const okImg = (u) => IMG_RE.test(u || '') ? u : '';
/** Card background: custom image (cover + scrim for legibility) wins, else gradient preset. */
export function msgBgStyle(m) {
  const img = okImg(m?.bgImage);
  if (img) return { style: `background:linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,.55)),url('${img}') center/cover;`, light: true };
  const bg = MSG_BGS[m?.bg] || '';
  if (bg) return { style: `background:${bg};`, light: true };
  return { style: '', light: false };
}
const stripTokens = (s) => plainBody(s);
/** Mini-markup for broadcasts: **bold** *italic* __underline__ ##display## [label](url) + bare-URL cards. XSS-safe (escape first). */
export function renderRichText(s) {
  let h = escapeHtml(String(s || ''));
  h = h.replace(/\[([^\]\n]{1,80})\]\((https?:\/\/[^\s"'<>)]+)\)/g, (m, t, u) => {
    const url = u.replace(/&amp;/g, '&');
    return `<a href="${url}" target="_blank" rel="noopener" style="color:var(--info);font-weight:600">${t}</a>`;
  });
  h = h.replace(/(^|[\s>])(https?:\/\/[^\s"'<>]+)/g, (m, pre, u) => {
    const url = u.replace(/&amp;/g, '&');
    let host = '';
    try { host = new URL(url).hostname; } catch { return m; }
    const short = url.length > 60 ? `${url.slice(0, 60)}…` : url;
    return `${pre}<a href="${url}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:8px;margin:6px 0;padding:8px 10px;border:1px solid var(--border-mid);border-radius:10px;background:var(--bg-overlay);text-decoration:none">`
      + `<img src="https://www.google.com/s2/favicons?domain=${host}&sz=64" alt="" loading="lazy" referrerpolicy="no-referrer" decoding="async" onerror="this.remove()" style="width:20px;height:20px;border-radius:4px;flex-shrink:0">`
      + `<span style="min-width:0"><span style="display:block;font-size:12px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${host}</span>`
      + `<span style="display:block;font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${short}</span></span></a>`;
  });
  h = h.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  h = h.replace(/__([^_\n]+)__/g, '<u>$1</u>');
  h = h.replace(/##([^#\n]+)##/g, '<span style="font-family:var(--font-display);font-weight:700">$1</span>');
  return h.replace(/\n/g, '<br>');
}
/** Plaintext variant for list previews, search and notifications. */
export function plainBody(s) {
  return String(s || '').replace(/\[img:\d+\]/g, '')
    .replace(/\[([^\]\n]{1,80})\]\(https?:\/\/[^\s"'<>)]+\)/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1$2')
    .replace(/__([^_\n]+)__/g, '$1').replace(/##([^#\n]+)##/g, '$1');
}
const IMG_META_DEF = { fit: 'cover', h: null, w: null, align: 'center', pos: 'center', zoom: 1, x: 0, y: 0, sw: 1, sh: 1 };
/** Clamp stored per-image geometry (fit/height/width/align/position/zoom/pan/stretch). h/w null = site default. */
export function cleanImgMeta(m) {
  if (!m || typeof m !== 'object') return { ...IMG_META_DEF };
  const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  return {
    fit: ['cover', 'contain', 'fill'].includes(m.fit) ? m.fit : 'cover',
    h: m.h == null ? null : num(m.h, null, 60, 400),
    w: m.w == null ? null : num(m.w, null, 20, 100),
    align: ['left', 'center', 'right'].includes(m.align) ? m.align : 'center',
    pos: ['top', 'center', 'bottom'].includes(m.pos) ? m.pos : 'center',
    zoom: num(m.zoom, 1, 0.5, 3), x: num(m.x, 0, -300, 300), y: num(m.y, 0, -300, 300),
    sw: num(m.sw, 1, 0.3, 3), sh: num(m.sh, 1, 0.3, 3),
  };
}
const IMG_ATTRS = 'alt="" loading="lazy" referrerpolicy="no-referrer" decoding="async" onerror="this.remove()"';
/** Image with per-image geometry. Untouched meta emits the legacy markup verbatim. */
export function bodyImg(u, meta, o = {}) {
  const src = okImg(u);
  if (!src) return '';
  const m = cleanImgMeta(meta);
  const H = o.h || 220, rad = o.radius || 10, mb = o.mb || '6px 0';
  const esc = escapeHtml(src);
  const custom = (meta && (meta.h != null || (meta.w != null && meta.w !== 100))) || m.fit !== 'cover' || m.pos !== 'center' || m.zoom !== 1 || m.x || m.y || m.sw !== 1 || m.sh !== 1;
  if (!custom) return `<img src="${esc}" ${IMG_ATTRS} style="width:100%;max-height:${H}px;object-fit:cover;border-radius:${rad}px;margin:${mb}">`;
  const h = (meta && meta.h != null) ? m.h : H;
  const w = (meta && meta.w != null) ? m.w : 100;
  const mg = w >= 100 ? mb : (m.align === 'left' ? `6px auto 6px 0` : m.align === 'right' ? `6px 0 6px auto` : `6px auto`);
  const zx = (m.zoom * m.sw).toFixed(3), zy = (m.zoom * m.sh).toFixed(3);
  return `<span style="display:block;overflow:hidden;width:${w}%;height:${h}px;border-radius:${rad}px;margin:${mg}"><img src="${esc}" ${IMG_ATTRS} style="width:100%;height:100%;object-fit:${m.fit};object-position:${m.pos};transform:translate(${m.x}px,${m.y}px) scale(${zx},${zy})"></span>`;
}
/** Render body with [img:N] tokens swapped for images (allowlisted src only). */
export function renderRichBody(body, images, headerImg = '', imgMetas = null) {
  const imgs = Array.isArray(images) ? images.map(okImg).filter(Boolean) : [];
  const metas = Array.isArray(imgMetas) ? imgMetas : [];
  const used = new Set();
  const parts = String(body || '').split(/(\[img:\d+\])/g);
  let html = parts.map((p) => {
    const mt = p.match(/^\[img:(\d+)\]$/);
    if (mt) {
      const idx = Number(mt[1]) - 1;
      const u = imgs[idx];
      if (u) used.add(idx);
      return u ? bodyImg(u, metas[idx]) : '';
    }
    return renderRichText(p);
  }).join('');
  // ponytail: untokened body images were invisible — append unreferenced ones (header already shown separately)
  const rest = imgs.map((u, i) => ({ u, i })).filter(({ u, i }) => !used.has(i) && u !== headerImg);
  if (rest.length) html += rest.map(({ u, i }) => bodyImg(u, metas[i])).join('');
  return html;
}
const kindColor = (m) => {
  if (m.kind === 'reward') return Number(m.xp) < 0 ? 'var(--danger)' : 'var(--warning)';
  if (/penalty/i.test(m.title || '')) return 'var(--danger)';
  return 'var(--info)';
};

export function renderInbox(host) {
  if ((S.inbox || []).some((m) => !m.id)) {
    update((s) => { (s.inbox || []).forEach((m) => { if (!m.id) m.id = uid('msg'); }); }, { silent: true });
    try { save(); } catch {}
  }
  const msgs = (S.inbox || []).slice().reverse();
  const events = (S.events || []).filter((e) => e.status === 'live').slice().reverse();
  host.innerHTML = `
  <div class="flex-between mb8"><div class="section-title" style="margin:0">Inbox ${(S.inboxUnread || 0) > 0 ? `<span class="badge badge-danger">${S.inboxUnread} new</span>` : ''}</div>
  <button class="btn btn-sm btn-ghost" id="inbox-readall">Mark all read</button></div>
  <div class="flex gap8 mb8">
    <input type="text" id="inbox-q" placeholder="Search messages…" maxlength="60" style="flex:1">
  </div>
  <div class="flex gap8 mb12" id="inbox-filters">
    ${['all', 'unread', 'rewards'].map((f) => `<button class="btn btn-sm${f === 'all' ? ' btn-primary' : ''}" data-ifilter="${f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}
  </div>
  <div id="inbox-threads"></div>
  ${events.length ? `<div class="section-title mt12">Live missions & events (this device)</div>
    ${events.map((e) => {
      const ebg = msgBgStyle(e);
      return `<div class="card mb8" style="${ebg.style}">${bodyImg(e.image, e.imgMeta, { h: 160, mb: '0 0 8px' })}<div style="font-size:13px;font-weight:700;${ebg.light ? 'color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.5);' : ''}">${escapeHtml(e.title || 'Mission')}</div>
      <div style="font-size:12px;${ebg.light ? 'color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.45);' : 'color:var(--text-secondary)'}">${escapeHtml(e.body || e.desc || '')}</div></div>`; }).join('')}` : ''}
  <div id="inbox-global"><div style="font-size:12px;color:var(--text-muted)">Syncing global…</div></div>
  ${msgs.some((m) => isRead(m.id)) ? '<button class="btn btn-sm btn-ghost btn-full mt8" id="inbox-delread">Delete all read messages</button>' : ''}`;
  let filter = 'all';
  const allRows = () => {
    const local = msgs.map((m) => ({ m, mid: m.id, global: false, ts: m.ts || 0 }));
    const hidden = new Set(S.hiddenGlobals || []);
    const remote = gThreads.filter((m) => !hidden.has('g-' + (m.id || m.title))).map((m) => ({ m, mid: 'g-' + (m.id || m.title), global: true, ts: Date.parse(m.created_at || '') || 0 }));
    return [...local, ...remote].sort((a, b) => b.ts - a.ts);
  };
  const paint = () => {
    const q = (host.querySelector('#inbox-q').value || '').toLowerCase();
    const box = host.querySelector('#inbox-threads');
    if (!box) return;
    const rows = allRows();
    const shown = rows.filter(({ m, mid, global }) => {
      const unread = global ? !isGRead(m) : !isRead(mid);
      if (filter === 'unread' && !unread) return false;
      if (filter === 'rewards' && !isRewardMsg(m)) return false;
      if (q && !((m.title || '') + ' ' + (m.body || '')).toLowerCase().includes(q)) return false;
      return true;
    });
    box.innerHTML = shown.map(({ m, mid, global }) => {
      const unread = global ? !isGRead(m) : !isRead(mid);
      const claimed = isRewardMsg(m) && (S.claimedRewards || []).includes(mid);
      const init = escapeHtml(((m.title || 'Z')[0] || 'Z').toUpperCase());
      return `<div class="quest-card" data-open="${escapeHtml(mid)}" data-global="${global ? 1 : ''}" style="cursor:pointer;${unread ? `border-color:var(--primary);background:var(--primary-dim);` : ''}">`
        + `<span style="width:38px;height:38px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:800;font-family:var(--font-display);background:${kindColor(m)}22;color:${kindColor(m)};border:1px solid ${kindColor(m)}">${init}</span>`
        + `<div style="flex:1;min-width:0"><div class="flex-between"><div style="font-size:13px;font-weight:${unread ? 800 : 600};font-family:var(--font-display);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(m.title || 'ZenFit')}</div>`
        + `<span style="font-size:10px;color:var(--text-muted);flex-shrink:0;margin-left:6px">${escapeHtml(m.date || (m.created_at || '').slice(0, 10))}</span></div>`
        + `<div style="font-size:12px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(stripTokens(m.body || ''))}</div>`
        + `<div style="margin-top:2px">${unread ? '<span class="badge badge-purple">New</span> ' : ''}${global ? '<span class="badge badge-info">Global</span> ' : ''}${isRewardMsg(m) ? `<span class="badge ${claimed ? 'badge-green' : 'badge-amber'}">${claimed ? 'Claimed' : `${Number(m.xp) > 0 ? '+' : ''}${m.xp} XP`}</span>` : ''}${m.confetti ? ' <span class="badge badge-info">Surprise</span>' : ''}</div></div>`
        + `${unread ? '<span style="width:9px;height:9px;border-radius:50%;background:var(--danger);flex-shrink:0"></span>' : `<button class="btn btn-icon btn-sm" data-delmsg="${escapeHtml(mid)}" data-global="${global ? 1 : ''}" style="color:var(--danger);flex-shrink:0" title="${global ? 'Hide for me' : 'Delete'}">×</button>`}</div>`;
    }).join('') || '<div class="card text-center" style="color:var(--text-muted)">No messages match. Challenges and rewards from your coach appear here.</div>';
    box.querySelectorAll('[data-open]').forEach((row) => {
      row.onclick = (e) => {
        if (e.target.closest('[data-delmsg]')) return;
        openDetail(host, row.dataset.open, row.dataset.global === '1');
      };
    });
    box.querySelectorAll('[data-delmsg]').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        deleteMsg(b.dataset.delmsg, b.dataset.global === '1');
      };
    });
  };
  host._repaintInbox = paint;
  const deleteMsg = (mid, isGlobalRow) => {
    if (isGlobalRow) {
      update((s) => { s.hiddenGlobals = [...new Set([...(s.hiddenGlobals || []), mid])]; });
      showNotif('Hidden — you won\'t see this again', 'OK');
      window.ZF.rerender();
      return;
    }
    const m = (S.inbox || []).find((x) => x.id === mid);
    const wasUnread = m && !isRead(mid);
    update((s) => {
      s.inbox = (s.inbox || []).filter((x) => x.id !== mid);
      s.inboxRead = (s.inboxRead || []).filter((id) => id !== mid);
      if (wasUnread) s.inboxUnread = Math.max(0, (s.inboxUnread || 0) - 1);
    });
    healUnreadCount();
    window.ZF.rerender();
  };
  host.querySelector('#inbox-q').oninput = paint;
  host.querySelectorAll('[data-ifilter]').forEach((b) => {
    b.onclick = () => {
      filter = b.dataset.ifilter;
      host.querySelectorAll('[data-ifilter]').forEach((x) => x.classList.toggle('btn-primary', x === b));
      paint();
    };
  });
  host.querySelector('#inbox-readall')?.addEventListener('click', () => {
    update((s) => {
      s.inboxRead = [...new Set([...(s.inboxRead || []), ...(s.inbox || []).map((m) => m.id)])];
      s.inboxUnread = 0;
    });
    try {
      const gids = gThreads.map((m) => 'g-' + (m.id || m.title));
      localStorage.setItem('zf_global_read', JSON.stringify([...new Set([...gReadIds(), ...gids])].slice(-100)));
    } catch {}
    window.ZF.rerender();
  });
  host.querySelector('#inbox-delread')?.addEventListener('click', () => {
    update((s) => {
      const keep = (s.inbox || []).filter((m) => !isRead(m.id));
      s.inbox = keep;
    });
    window.ZF.rerender();
  });
  paint();
  syncGlobals(host);
}

/** Full message view: styled hero, image, claim, delete, back. */
function openDetail(host, mid, isGlobal = false) {
  const m = isGlobal
    ? gThreads.find((x) => 'g-' + (x.id || x.title) === mid)
    : (S.inbox || []).find((x) => x.id === mid);
  if (!m) { window.ZF.rerender(); return; }
  const wasUnread = isGlobal ? !isGRead(m) : !isRead(mid);
  if (isGlobal) {
    gMarkRead(mid);
    healUnreadCount();
    if (wasUnread) {
      try {
        const latest = gThreads[0];
        if (latest && mid === 'g-' + (latest.id || latest.title)) {
          try { localStorage.setItem('zf_global_seen', String(latest.id)); } catch {}
          update((s) => { s.inboxUnread = Math.max(0, (s.inboxUnread || 0) - 1); }, { silent: true });
          try { save(); } catch {}
        }
      } catch {}
    }
  } else {
    update((s) => {
      if (!(s.inboxRead || []).includes(mid)) s.inboxRead = [...(s.inboxRead || []), mid];
      if (wasUnread) s.inboxUnread = Math.max(0, (s.inboxUnread || 0) - 1);
    }, { silent: true });
    try { save(); } catch {}
    healUnreadCount();
  }
  const isReward = isRewardMsg(m);
  const claimed = (S.claimedRewards || []).includes(mid);
  const bgs = msgBgStyle(m);
  const hl = MSG_HLS[m.hl] || '';
  const img = okImg(m.image || '');
  host.innerHTML = `
  <button class="btn btn-sm btn-ghost mb12" id="inbox-back">← Back to inbox</button>
  <div class="card" style="${bgs.style}${hl ? `border-color:${hl};box-shadow:0 0 18px ${hl}55;` : ''}">
    ${bodyImg(img, (m.imgMeta || [])[0], { h: 220, mb: '0 0 10px' })}
    <div style=\"font-size:17px;font-weight:800;font-family:var(--font-display);${bgs.light ? 'color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.5);' : ''}\">${escapeHtml(m.title || 'ZenFit')}</div>
    <div style="font-size:10px;${bgs.light ? 'color:rgba(255,255,255,.8)' : 'color:var(--text-muted)'};margin:2px 0 8px">${escapeHtml(m.date || (m.created_at || '').slice(0, 10))}${isGlobal ? ' · Global' : ''}</div>
    <div style="font-size:13px;line-height:1.7;${bgs.light ? 'color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.45);' : 'color:var(--text-secondary)'}">${renderRichBody(m.body, m.images, img, m.imgMeta)}</div>
    ${isReward ? `<button class="btn ${claimed ? '' : 'btn-primary'} mt12" id="inbox-dclaim" ${claimed ? 'disabled' : ''}>${claimed ? 'Claimed ✓' : `Claim ${Number(m.xp) > 0 ? '+' : ''}${m.xp} XP`}</button>` : ''}
  </div>
  ${isGlobal ? '' : '<button class="btn btn-sm btn-danger btn-full mt8" id="inbox-ddel">Delete message</button>'}`;
  if (wasUnread && m.confetti) setTimeout(() => { try { celebrateBurst(90); } catch {} }, 250);
  host.querySelector('#inbox-back').onclick = () => window.ZF.rerender();
  !isGlobal && (host.querySelector('#inbox-ddel').onclick = () => {
    update((s) => {
      s.inbox = (s.inbox || []).filter((x) => x.id !== mid);
      s.inboxRead = (s.inboxRead || []).filter((id) => id !== mid);
    });
    window.ZF.rerender();
  });
  host.querySelector('#inbox-dclaim')?.addEventListener('click', () => {
    if ((S.claimedRewards || []).includes(mid)) return;
    const xp = Number(m.xp) || 0;
    update((s) => { s.claimedRewards = [...(s.claimedRewards || []), mid]; });
    if (xp > 0) awardXP(xp, m.title || 'Reward');
    else if (xp < 0) { deductXP(Math.abs(xp), m.title || 'Penalty'); showNotif(`${xp} XP — ${m.title || 'Penalty'}`, '!'); }
    window.ZF.rerender();
  });
}

async function syncGlobals(host) {
  try {
    const { GlobalBoard } = await import('../core/cloud.js');
    const mine = [S.deviceId, S.profile?.name, S.player?.name].filter(Boolean).map(String);
    const forMe = (r) => !r?.target || r.target === 'all' || mine.includes(String(r.target));
    const [casts, evts, rewards] = await Promise.all([
      GlobalBoard.fetchBroadcasts(), GlobalBoard.fetchEvents(), GlobalBoard.fetchRewards(),
    ]);
    const box = host.querySelector('#inbox-global');
    if (!box) return;
    const myCasts = (casts || []).filter(forMe);
    const myEvts = (evts || []).filter(forMe);
    const myRewards = (rewards || []).filter(forMe);
    const claimed = new Set(S.claimedRewards || []);
    let html = '';
    gThreads = myCasts.slice(0, 20).map((b) => ({
      id: b.id, title: b.title || 'Broadcast', body: b.body || '',
      date: (b.updated_at || b.created_at || '').slice(0, 10), created_at: b.created_at || '', updated_at: b.updated_at || '',
      bg: b.bg || 'none', hl: b.hl || 'none', bgImage: b.bgImage || '', image: b.image || '', images: Array.isArray(b.images) ? b.images.slice(0, 5) : [], imgMeta: Array.isArray(b.imgMeta) ? b.imgMeta.slice(0, 5) : [], confetti: !!b.confetti,
    }));
    // edited globals → silent replace (same id) but fresh + unread
    try {
      let edited = 0;
      [...(myCasts || []), ...(myEvts || []), ...(myRewards || [])].forEach((r) => {
        const gid = 'g-' + (r.id || r.code || r.title);
        if (gNoteEdited(gid, gVerOf(r))) edited++;
      });
      if (edited) {
        update((s) => { s.inboxUnread = (s.inboxUnread || 0) + edited; }, { silent: true });
        try { save(); } catch {}
        showNotif(edited === 1 ? '📣 Updated broadcast — marked unread' : `📣 ${edited} updated — marked unread`, 'OK');
      }
    } catch {}
    try { host._repaintInbox && host._repaintInbox(); } catch {}
    if (myCasts?.length) {
      try {
        const latest = myCasts[0];
        const seenKey = 'zf_global_notified';
        const seen = localStorage.getItem(seenKey);
        if (latest?.id && seen !== String(latest.id)) {
          localStorage.setItem(seenKey, String(latest.id));
          update((s) => { s.inboxUnread = (s.inboxUnread || 0) + 1; }, { silent: true });
          try { save(); } catch {}
          showNotif(`📣 ${latest.title || 'New broadcast'}`, 'OK');
          try { host._repaintInbox && host._repaintInbox(); } catch {}
        }
      } catch {}
    }
    if (myEvts?.length) {
      const hidden = new Set(S.hiddenGlobals || []);
      const visEvts = myEvts.filter((e) => !hidden.has('g-' + (e.id || e.code || e.title)));
      html += visEvts.length ? `<div class="section-title mt12">Global missions</div>` + visEvts.slice(0, 5).map((e) => {
        const gid = e.id || e.code || e.title;
        const tracked = (S.events || []).some((x) => x.globalId === gid);
        const canTrack = Array.isArray(e.rules) && e.rules.length && !tracked;
        const rules = Array.isArray(e.rules) ? e.rules : [];
        const ebg = msgBgStyle(e);
        return `<div class="card mb12" style="border-color:var(--primary);${ebg.style}"><div class="flex-between">`
        + `<div style="font-size:14px;font-weight:800;font-family:var(--font-display);${ebg.light ? 'color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.5);' : ''}">${escapeHtml(e.title || 'Event')}</div>`
        + `<span style="display:flex;gap:4px;align-items:center"><span class="badge badge-purple">Mission</span><button class="btn btn-icon btn-sm" data-ghide="${escapeHtml('g-' + gid)}" style="color:var(--danger)" title="Hide for me">×</button></span></div>`
        + `${bodyImg(e.image, e.imgMeta, { h: 180 })}`
        + `<div style="font-size:12px;${ebg.light ? 'color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.45);' : 'color:var(--text-secondary)'};margin:4px 0">${escapeHtml(e.descr || e.desc || '')}</div>`
        + (e.xp ? `<div style="font-size:12px;color:var(--warning);font-weight:700;margin-bottom:6px">Reward: +${e.xp} XP on completion</div>` : '')
        + (rules.length ? `<div style="display:flex;flex-direction:column;gap:6px;margin:6px 0">` + rules.map((r) => {
          const cat = r.cat || 'task';
          const catLabel = cat[0].toUpperCase() + cat.slice(1);
          let lines = [];
          if (cat === 'workout') {
            if (r.exercise) lines.push(`Exercise: ${r.exercise}`);
            if (r.sets) lines.push(`Sets: ${r.sets}`);
            if (r.reps) lines.push(`Reps: ${r.reps}`);
          } else if (cat === 'streak') lines.push(`Reach a ${r.target || '?'}-day streak`);
          else {
            const unit = cat === 'water' ? 'ml' : (cat === 'study' || cat === 'zen' || cat === 'screentime') ? 'min' : 'count';
            const verb = cat === 'screentime' ? 'at most' : 'at least';
            lines.push(`${verb} ${r.target ?? '?'} ${unit} per day`);
          }
          lines.push(`Consistency: ${r.days || 1} day${(r.days || 1) > 1 ? 's' : ''} in a row`);
          return `<div class="card-sm" style="padding:10px"><div style="font-size:11px;font-weight:800;letter-spacing:1px;color:var(--primary);margin-bottom:4px">${escapeHtml(String(catLabel).toUpperCase())}</div>`
            + lines.map((l) => `<div style="font-size:12px;color:var(--text-secondary)">• ${escapeHtml(l)}</div>`).join('') + `</div>`;
        }).join('') + `</div>` : '')
        + (canTrack ? `<button class="btn btn-sm btn-primary mt8" data-track="${escapeHtml(String(gid))}">Track this mission</button>` : tracked ? `<div style="font-size:11px;color:var(--success);margin-top:4px">Tracked ✓ your logs are auto-checked</div>` : '') + `</div>`;
      }).join('') : '';
    }
    if (myRewards?.length) {
      const hiddenR = new Set(S.hiddenGlobals || []);
      const visRewards = myRewards.filter((r) => !hiddenR.has('g-' + (r.id || r.code)));
      html += visRewards.length ? `<div class="section-title mt12">Claimable rewards</div>` + visRewards.slice(0, 5).map((r) => {
        const done = claimed.has(r.id || r.code);
        return `<div class="card mb8"><div class="flex-between"><div><div style="font-size:13px;font-weight:700">${escapeHtml(r.title || 'Reward')}</div>`
          + `<div style="font-size:11px;color:var(--warning)">${Number(r.xp) < 0 ? '' : '+'}${r.xp || 0} XP${r.code ? ` · ${escapeHtml(r.code)}` : ''}</div></div>`
          + `<span style="display:flex;gap:4px"><button class="btn btn-sm ${done ? '' : 'btn-primary'}" data-claim="${escapeHtml(r.id || r.code || '')}" ${done ? 'disabled' : ''}>${done ? 'Claimed ✓' : 'Claim'}</button><button class="btn btn-icon btn-sm" data-ghide="${escapeHtml('g-' + (r.id || r.code))}" style="color:var(--danger)" title="Hide for me">×</button></span></div></div>`;
      }).join('') : '';
    }
    box.innerHTML = html || '';
    box.querySelectorAll('[data-ghide]').forEach((b) => {
      b.onclick = () => {
        update((s) => { s.hiddenGlobals = [...new Set([...(s.hiddenGlobals || []), b.dataset.ghide])]; });
        showNotif('Hidden — you won\'t see this again', 'OK');
        window.ZF.rerender();
      };
    });
    box.querySelectorAll('[data-track]').forEach((b) => {
      b.onclick = () => {
        const gid = b.dataset.track;
        const e = (myEvts || []).find((x) => String(x.id || x.code || x.title) === gid);
        if (!e || (S.events || []).some((x) => x.globalId === gid)) return;
        update((s) => {
          s.events = [...(s.events || []), {
            id: `g-${Date.now()}`, globalId: gid, kind: 'mission', title: String(e.title || 'Mission').slice(0, 60),
            icon: '📯', body: String(e.descr || e.desc || '').slice(0, 200),
            image: /^((https?:|data:image\/|blob:)[^\s"'<>]*)$/.test(e.image || '') ? e.image : '',
            bgImage: /^((https?:|data:image\/|blob:)[^\s"'<>]*)$/.test(e.bgImage || '') ? e.bgImage : '',
            xp: Math.min(500, Math.max(1, Number(e.xp) || 25)),
            rules: (e.rules || []).slice(0, 5).map((r) => {
              if (r.cat === 'workout') return { cat: 'workout', exercise: String(r.exercise || '').slice(0, 40), sets: Number(r.sets) || 0, reps: Number(r.reps) || 0, days: Number(r.days) || 1 };
              if (r.cat === 'streak') return { cat: 'streak', target: Number(r.target) || 1, days: 1 };
              return { cat: String(r.cat || r.metric || 'water').slice(0, 20), target: Number(r.target) || 1, days: Number(r.days) || 1 };
            }),
            status: 'live', ts: Date.now(),
          }];
        });
        showNotif('Mission tracked — logs auto-checked', 'OK');
        import('../core/missions.js').then((m) => { try { m.checkMissions(); } catch {} }).catch(() => {});
        window.ZF.rerender();
      };
    });
    box.querySelectorAll('[data-claim]').forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.claim;
        const r = (myRewards || []).find((x) => (x.id || x.code) === id);
        if (!r || (S.claimedRewards || []).includes(id)) return;
        const xp = Number(r.xp) || 0;
        update((s) => { s.claimedRewards = [...(s.claimedRewards || []), id]; });
        if (xp > 0) awardXP(xp, `Global reward: ${r.title || ''}`);
        else if (xp < 0) { deductXP(Math.abs(xp), `Global penalty: ${r.title || ''}`); showNotif(`${xp} XP — ${r.title || 'Penalty'}`, '!'); }
        window.ZF.rerender();
      };
    });
    healUnreadCount();
  } catch {
    host.querySelector('#inbox-global') && (host.querySelector('#inbox-global').innerHTML = '');
  }
}

/** Background poll: new/edited broadcasts notify even when inbox was never
   opened (in-app toast + OS notification + unread bump). No server push exists. */
function notifyGlobal(title, body) {
  try { showNotif(`📣 ${title || 'New broadcast'}`, 'OK'); } catch {}
  try {
    const b = plainBody(body || '').slice(0, 120);
    if (navigator.serviceWorker?.controller) navigator.serviceWorker.controller.postMessage({ type: 'SHOW_NOTIFICATION', payload: { title: `📣 ${title || 'New broadcast'}`, body: b } });
    else if ('Notification' in window && Notification.permission === 'granted') new Notification(`📣 ${title || 'New broadcast'}`, { body: b });
  } catch {}
}
export async function checkGlobalUpdates() {
  try {
    const { GlobalBoard } = await import('../core/cloud.js');
    const casts = await GlobalBoard.fetchBroadcasts().catch(() => []);
    if (!casts?.length) return false;
    const mine = [S.deviceId, S.profile?.name, S.player?.name].filter(Boolean).map(String);
    const myCasts = casts.filter((r) => !r?.target || r.target === 'all' || mine.includes(String(r.target)));
    if (!myCasts.length) return false;
    let fresh = 0;
    try {
      const latest = myCasts[0];
      const seen = localStorage.getItem('zf_global_notified');
      if (latest?.id && seen !== String(latest.id)) {
        localStorage.setItem('zf_global_notified', String(latest.id));
        fresh++;
        notifyGlobal(latest.title, latest.body);
      }
    } catch {}
    myCasts.slice(0, 20).forEach((r) => {
      if (gNoteEdited('g-' + (r.id || r.title), gVerOf(r))) {
        fresh++;
        notifyGlobal('Updated: ' + (r.title || 'broadcast'), r.body);
      }
    });
    if (fresh) {
      update((s) => { s.inboxUnread = (s.inboxUnread || 0) + fresh; }, { silent: true });
      try { save(); } catch {}
      try { window.ZF?.rerender(); } catch {}
    }
    return fresh > 0;
  } catch { return false; }
}
