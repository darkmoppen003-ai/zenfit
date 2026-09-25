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
      const eimg = /^((https?:|data:image\/|blob:)[^\s"'<>]*)$/.test(e.image || '') ? e.image : '';
      return `<div class="card mb8">${eimg ? `<img src="${escapeHtml(eimg)}" alt="" loading="lazy" style="width:100%;max-height:160px;object-fit:cover;border-radius:10px;margin-bottom:8px">` : ''}<div style="font-size:13px;font-weight:700">${escapeHtml(e.title || 'Mission')}</div>
      <div style="font-size:12px;color:var(--text-secondary)">${escapeHtml(e.body || e.desc || '')}</div></div>`; }).join('')}` : ''}
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
        + `<div style="flex:1;min-width:0"><div class="flex-between"><div style="font-size:13px;font-weight:${unread ? 800 : 600};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(m.title || 'ZenFit')}</div>`
        + `<span style="font-size:10px;color:var(--text-muted);flex-shrink:0;margin-left:6px">${escapeHtml(m.date || (m.created_at || '').slice(0, 10))}</span></div>`
        + `<div style="font-size:12px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(m.body || '')}</div>`
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
  }
  const isReward = isRewardMsg(m);
  const claimed = (S.claimedRewards || []).includes(mid);
  const bg = MSG_BGS[m.bg] || '';
  const hl = MSG_HLS[m.hl] || '';
  const img = /^((https?:|data:image\/|blob:)[^\s"'<>]*)$/.test(m.image || '') ? m.image : '';
  host.innerHTML = `
  <button class="btn btn-sm btn-ghost mb12" id="inbox-back">← Back to inbox</button>
  <div class="card" style="${bg ? `background:${bg};` : ''}${hl ? `border-color:${hl};box-shadow:0 0 18px ${hl}55;` : ''}">
    ${img ? `<img src=\"${escapeHtml(img)}\" alt=\"\" loading=\"lazy\" style=\"width:100%;max-height:220px;object-fit:cover;border-radius:10px;margin-bottom:10px\">` : ''}
    <div style=\"font-size:17px;font-weight:800;font-family:var(--font-display);${bg ? 'color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.5);' : ''}\">${escapeHtml(m.title || 'ZenFit')}</div>
    <div style="font-size:10px;${bg ? 'color:rgba(255,255,255,.8)' : 'color:var(--text-muted)'};margin:2px 0 8px">${escapeHtml(m.date || (m.created_at || '').slice(0, 10))}${isGlobal ? ' · Global' : ''}</div>
    <div style="font-size:13px;line-height:1.7;${bg ? 'color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.45);' : 'color:var(--text-secondary)'}">${escapeHtml(m.body || '')}</div>
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
      date: (b.created_at || '').slice(0, 10), created_at: b.created_at || '',
      bg: b.bg || 'none', hl: b.hl || 'none', image: b.image || '', confetti: !!b.confetti,
    }));
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
        const eimg = /^((https?:|data:image\/|blob:)[^\s"'<>]*)$/.test(e.image || '') ? e.image : '';
        return `<div class="card mb12" style="border-color:var(--primary)"><div class="flex-between">`
        + `<div style="font-size:14px;font-weight:800;font-family:var(--font-display)">${escapeHtml(e.title || 'Event')}</div>`
        + `<span style="display:flex;gap:4px;align-items:center"><span class="badge badge-purple">Mission</span><button class="btn btn-icon btn-sm" data-ghide="${escapeHtml('g-' + gid)}" style="color:var(--danger)" title="Hide for me">×</button></span></div>`
        + `${eimg ? `<img src="${escapeHtml(eimg)}" alt="" loading="lazy" style="width:100%;max-height:180px;object-fit:cover;border-radius:10px;margin:6px 0">` : ''}`
        + `<div style="font-size:12px;color:var(--text-secondary);margin:4px 0">${escapeHtml(e.descr || e.desc || '')}</div>`
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
  } catch {
    host.querySelector('#inbox-global') && (host.querySelector('#inbox-global').innerHTML = '');
  }
}
