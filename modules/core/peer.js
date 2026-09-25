/* ── ZenFit V2 · core/peer.js ──────────────────────────────
   V1 P2P layer, ported: PeerJS dynamic load, stable device peer
   ID, connect request handshake (accept/reject), live chat,
   high-fives, detail/stats exchange, challenge invites +
   progress broadcast. All state lives in the shared store.
────────────────────────────────────────────────────────────── */
import { S, update, save } from './store.js';
import { rankForLevel } from './utils.js';
import { escapeHtml, sanitizeText } from './sanitize.js';
import { showNotif, openOverlay } from './ui.js';

export const peerConnections = {};
export const peerChatHistory = {};
let peer = null;

export function initPeerJS() {
  if (typeof window.Peer !== 'undefined') { startPeer(); return; }
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js';
  script.integrity = 'sha384-PMNj1TmCgXfW24/rfIyxYSAWwj2mffkMfguUWv08iNFcy0kTC0JN7E/tE+pJ7+fa';
  script.crossOrigin = 'anonymous';
  script.onload = () => startPeer();
  script.onerror = () => showNotif('P2P library failed to load (offline?)', '!');
  document.head.appendChild(script);
}

export function startPeer() {
  if (typeof window.Peer === 'undefined') return;
  if (peer && !peer.destroyed) return;
  const pid = S.deviceId;
  update((s) => { s.peerId = pid; }, { silent: true });
  save();
  try {
    peer = new window.Peer(pid, { debug: 0 });
  } catch { return; }
  peer.on('open', () => {
    update((s) => { s.peerId = pid; }, { silent: true });
    save();
    showNotif('Connected! Your ID: ' + pid, 'OK');
    window.ZF.rerender();
  });
  peer.on('connection', (conn) => setupConn(conn));
  peer.on('error', (err) => showNotif('P2P error: ' + (err.type || 'unknown'), '!'));
}

export function peerStatus() {
  if (typeof window.Peer === 'undefined') return 'offline';
  if (peer && !peer.destroyed) return 'online';
  return 'ready';
}

function setupConn(conn) {
  conn.on('open', () => {
    peerConnections[conn.peer] = conn;
    showNotif(String(conn.peer).split('-')[1] + ' channel open', 'OK');
    window.ZF.rerender();
  });
  conn.on('data', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'connect_request') {
        update((s) => { s.pendingRequests = s.pendingRequests || []; });
        const c = msg.data || {};
        c.peerId = conn.peer;
        const dup = S.pendingRequests.findIndex((p) => p.name === c.name);
        if (dup > -1) S.pendingRequests[dup] = { ...c, ts: Date.now() };
        else S.pendingRequests.push({ ...c, ts: Date.now() });
        if ((S.partners || []).some((p) => p.name === c.name)) {
          const idx = S.pendingRequests.findIndex((p) => p.name === c.name);
          if (idx > -1) acceptRequest(idx);
        } else {
          save();
          showNotif(c.name + ' wants to connect — check Leaderboard', '🔔');
          window.ZF.rerender();
        }
      } else if (msg.type === 'connect_accept') {
        const card = msg.data || {};
        card.peerId = conn.peer;
        update((s) => {
          s.partners = s.partners || [];
          const pIdx = s.partners.findIndex((p) => p.name === card.name);
          if (pIdx > -1) s.partners[pIdx] = card;
          else s.partners.push(card);
          if (s.sentRequests) {
            const sIdx = s.sentRequests.findIndex((p) => p.name === card.name);
            if (sIdx > -1) s.sentRequests.splice(sIdx, 1);
          }
        });
        showNotif(card.name + ' accepted your request!', 'OK');
        window.ZF.rerender();
      } else if (msg.type === 'connect_reject') {
        update((s) => {
          if (s.sentRequests) {
            const rIdx = s.sentRequests.findIndex((p) => p.name === msg.name);
            if (rIdx > -1) s.sentRequests.splice(rIdx, 1);
          }
        });
        showNotif((msg.name || 'Request') + ' declined your connection', '!');
        window.ZF.rerender();
      } else if (msg.type === 'card') {
        if ((S.partners || []).some((p) => p.peerId === conn.peer || p.name === (msg.data || {}).name)) {
          importFromPeer(conn.peer, msg.data || {});
        }
      } else if (msg.type === 'chat') {
        if (!peerChatHistory[conn.peer]) peerChatHistory[conn.peer] = [];
        peerChatHistory[conn.peer].push({ from: msg.name || 'Partner', text: msg.text, ts: Date.now(), mine: false });
        peerChatHistory[conn.peer] = peerChatHistory[conn.peer].filter((m) => Date.now() - m.ts < 86400000);
        window.ZF.rerender();
      } else if (msg.type === 'highfive') {
        showNotif(`✋ High five from ${msg.name || 'partner'}!`, 'OK');
      } else if (msg.type === 'detail' || msg.type === 'public_stats') {
        update((s) => {
          s.partnerStats = s.partnerStats || {};
          s.partnerStats[(msg.data || {}).name || conn.peer] = msg.data;
        });
        window.ZF.rerender();
      } else if (msg.type === 'challenge_invite') {
        const ci = msg.data || {};
        update((s) => {
          s.challenges = s.challenges || [];
          if (!s.challenges.some((c) => c.id === ci.id)) {
            const days = ci.durationDays || 7;
            const now = Date.now();
            s.challenges.push({
              id: ci.id, type: 'workouts', title: ci.title, desc: ci.desc || '',
              durationDays: days, startsAt: now, endsAt: now + days * 86400000,
              createdBy: ci.createdBy || 'Partner', status: 'active',
              participants: [{ peerId: S.deviceId, name: S.player.name, progress: 0 }],
              winnerId: null,
            });
          }
        });
        showNotif(`⚔️ ${ci.createdBy} invited you to "${ci.title}" (${ci.durationDays || 7} days)!`, 'OK');
        window.ZF.rerender();
      } else if (msg.type === 'challenge_progress') {
        handleChallengeProgress(msg.data);
      } else if (msg.type === 'request_detail' || msg.type === 'request_public_stats') {
        const fromName = msg.from || '';
        const allowed = (S.partners || []).some((p) => p.peerId === conn.peer || p.name === fromName);
        try {
          conn.send(JSON.stringify({
            type: msg.type === 'request_detail' ? 'detail' : 'public_stats',
            data: allowed ? getDetailedCard() : getMyCard(),
          }));
        } catch {}
      }
    } catch {}
  });
  conn.on('close', () => {
    delete peerConnections[conn.peer];
    window.ZF.rerender();
  });
}

export function connectToPeer(peerId) {
  if (!peer) { showNotif('Start P2P first', '!'); return; }
  if (!peerId || peerId.trim().length < 4) { showNotif('Enter a valid Peer ID', '!'); return; }
  const pid = peerId.trim();
  const alreadyPartner = (S.partners || []).some((p) => p.peerId === pid);
  const conn = peer.connect(pid, { reliable: true });
  setupConn(conn);
  if (!alreadyPartner) {
    conn.on('open', () => {
      try { conn.send(JSON.stringify({ type: 'connect_request', data: getMyCard() })); } catch {}
      update((s) => {
        s.sentRequests = s.sentRequests || [];
        const displayName = pid.split('-').slice(1).join('-') || pid;
        if (!s.sentRequests.some((p) => p.peerId === pid)) {
          s.sentRequests.push({ name: displayName, level: '?', xp: 0, peerId: pid, ts: Date.now() });
        }
      });
      showNotif('Connection request sent to ' + pid.split('-').slice(1).join('-'), 'OK');
      window.ZF.rerender();
    });
  }
}

export function importFromPeer(peerId, card) {
  update((s) => {
    s.partners = s.partners || [];
    card.peerId = peerId;
    const idx = s.partners.findIndex((p) => p.peerId === peerId || p.name === card.name);
    if (idx > -1) s.partners[idx] = card;
    else s.partners.push(card);
  });
}

export function getMyCard() {
  return {
    name: S.player.name || 'Warrior',
    level: S.player.level || 1,
    xp: S.player.xp || 0,
    rank: rankForLevel(S.player.level || 1),
    streak: (S.habits || []).reduce((a, h) => a + (h.streak || 0), 0),
    habits: (S.habits || []).length,
    workouts: S.workouts ? S.workouts.length : 0,
    peerId: S.peerId || null,
    avatar: S.profilePic || null,
    timestamp: Date.now(),
  };
}

export function getDetailedCard() {
  return { ...getMyCard(), stats: S.player.stats || {} };
}

export function getShareCode() {
  return btoa(unescape(encodeURIComponent(JSON.stringify(getMyCard()))));
}

export function sendConnectRequest(code) {
  try {
    if (!code?.trim()) { showNotif('Paste a share code first', '!'); return; }
    const card = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    if (!card.name || card.level == null) { showNotif('Invalid share code', '!'); return; }
    if ((S.partners || []).some((p) => p.name === card.name)) { showNotif(card.name + ' is already in your leaderboard', '!'); return; }
    if ((S.sentRequests || []).some((p) => p.name === card.name)) { showNotif('Request to ' + card.name + ' is already pending', '!'); return; }
    const incomingIdx = (S.pendingRequests || []).findIndex((p) => p.name === card.name);
    if (incomingIdx > -1) { acceptRequest(incomingIdx); return; }
    let sentLive = false;
    if (card.peerId && peer && !peer.destroyed) {
      try {
        const conn = peer.connect(card.peerId, { reliable: true });
        conn.on('open', () => conn.send(JSON.stringify({ type: 'connect_request', data: getMyCard() })));
        setupConn(conn);
        sentLive = true;
      } catch {}
    }
    update((s) => {
      s.sentRequests = [...(s.sentRequests || []), { ...card, ts: Date.now() }];
    });
    showNotif('Request sent to ' + card.name + (sentLive ? ' (live)' : ' — they must accept'), 'OK');
  } catch (e) { showNotif('Invalid code: ' + e.message, '!'); }
}

export function acceptRequest(i) {
  const req = (S.pendingRequests || [])[i];
  if (!req) { showNotif('Request not found', '!'); return; }
  const partnerCard = { ...req };
  delete partnerCard.ts;
  update((s) => {
    s.partners = s.partners || [];
    const existing = s.partners.findIndex((p) => p.name === req.name);
    if (existing > -1) s.partners[existing] = partnerCard;
    else s.partners.push(partnerCard);
    s.pendingRequests.splice(i, 1);
  });
  if (req.peerId && peerConnections[req.peerId]?.open) {
    try { peerConnections[req.peerId].send(JSON.stringify({ type: 'connect_accept', data: getMyCard() })); } catch {}
  } else if (req.peerId && peer && !peer.destroyed) {
    try {
      const conn = peer.connect(req.peerId, { reliable: true });
      conn.on('open', () => conn.send(JSON.stringify({ type: 'connect_accept', data: getMyCard() })));
      setupConn(conn);
    } catch {}
  }
  showNotif(req.name + ' is now in your leaderboard!', 'OK');
}

export function rejectRequest(i) {
  const req = (S.pendingRequests || [])[i];
  if (!req) return;
  if (req.peerId && peerConnections[req.peerId]?.open) {
    try { peerConnections[req.peerId].send(JSON.stringify({ type: 'connect_reject', name: S.player.name || 'Warrior' })); } catch {}
  }
  update((s) => { s.pendingRequests.splice(i, 1); });
  showNotif('Request from ' + req.name + ' rejected', 'OK');
}

export function cancelSentRequest(i) {
  update((s) => { (s.sentRequests || []).splice(i, 1); });
}

export function removePartner(i) {
  const p = (S.partners || [])[i];
  if (!p) return;
  openOverlay(`<p style="font-size:14px">Remove ${escapeHtml(p.name)} from your leaderboard?</p>
    <div class="flex gap8 mt12" style="justify-content:center">
    <button class="btn btn-ghost" id="rp-no">Cancel</button>
    <button class="btn btn-danger" id="rp-yes">Remove</button></div>`);
  document.getElementById('rp-no').onclick = () => document.getElementById('zf-overlay')?.remove();
  document.getElementById('rp-yes').onclick = () => {
    document.getElementById('zf-overlay')?.remove();
    update((s) => {
      s.partners.splice(i, 1);
      if (s.partnerStats?.[p.name]) delete s.partnerStats[p.name];
    });
  };
}

export function sendChat(peerId, text) {
  const conn = peerConnections[peerId];
  if (!conn?.open) { showNotif('Not connected to this partner', '!'); return; }
  text = sanitizeText(text, 500);
  if (!text) return;
  if (!peerChatHistory[peerId]) peerChatHistory[peerId] = [];
  peerChatHistory[peerId].push({ from: 'You', text, ts: Date.now(), mine: true });
  peerChatHistory[peerId] = peerChatHistory[peerId].filter((m) => Date.now() - m.ts < 86400000);
  conn.send(JSON.stringify({ type: 'chat', name: S.player.name || 'Warrior', text }));
  window.ZF.rerender();
}

export function requestDetail(peerId) {
  const conn = peerConnections[peerId];
  if (conn?.open) conn.send(JSON.stringify({ type: 'request_detail' }));
  else showNotif('Not connected live — view their shared card', '!');
}

export function sendHighFive(peerId) {
  const conn = peerConnections[peerId];
  if (!conn?.open) { showNotif('Not connected to this partner', '!'); return; }
  conn.send(JSON.stringify({ type: 'highfive', name: S.player.name || 'Warrior' }));
  showNotif('✋ High five sent!', 'OK');
}

/** Partner stats modal — shared card only, never private logs. */
export function viewPartnerStats(i) {
  const p = (S.partners || [])[i];
  if (!p) { showNotif('Partner not found', '!'); return; }
  if (p.peerId && peerConnections[p.peerId]?.open) {
    try { peerConnections[p.peerId].send(JSON.stringify({ type: 'request_public_stats' })); } catch {}
  }
  const cached = (S.partnerStats || {})[p.name] || {};
  const allUsers = [...(S.partners || []), { ...getMyCard(), isMe: true }].sort((a, b) => b.xp - a.xp);
  const pos = allUsers.findIndex((u) => u.name === p.name) + 1;
  openOverlay(`<div style="text-align:left;max-height:70vh;overflow-y:auto">
    <div class="flex gap12 mb12"><div class="rank-badge">${escapeHtml((p.name || '?')[0])}</div>
    <div><div style="font-size:16px;font-weight:700">${escapeHtml(p.name)} ${p.peerId && peerConnections[p.peerId] ? '<span class="badge badge-green">● live</span>' : ''}</div>
    <div style="font-size:12px;color:var(--text-muted)">Rank #${pos} among friends · Lv ${p.level} · ${escapeHtml(p.rank || '')}</div></div></div>
    <div class="grid2 gap8">
      <div class="card-sm text-center"><div style="font-size:18px;font-weight:800">${cached.level ?? p.level}</div><div style="font-size:10px;color:var(--text-muted)">Level</div></div>
      <div class="card-sm text-center"><div style="font-size:18px;font-weight:800">${cached.xp ?? p.xp ?? 0}</div><div style="font-size:10px;color:var(--text-muted)">XP</div></div>
      <div class="card-sm text-center"><div style="font-size:18px;font-weight:800">${cached.streak ?? p.streak ?? 0}</div><div style="font-size:10px;color:var(--text-muted)">Streak</div></div>
      <div class="card-sm text-center"><div style="font-size:18px;font-weight:800">${cached.workouts ?? p.workouts ?? 0}</div><div style="font-size:10px;color:var(--text-muted)">Workouts</div></div>
    </div>
    <div class="flex gap8 mt12">
      ${p.peerId ? '<button class="btn btn-sm btn-primary" id="ps-chat">Chat</button>' : ''}
      ${p.peerId && peerConnections[p.peerId]?.open ? '<button class="btn btn-sm" id="ps-hi">✋ High-five</button>' : ''}
      <button class="btn btn-ghost btn-sm" id="ps-close">Close</button>
    </div></div>`);
  document.getElementById('ps-close').onclick = () => document.getElementById('zf-overlay')?.remove();
  document.getElementById('ps-chat') && (document.getElementById('ps-chat').onclick = () => {
    document.getElementById('zf-overlay')?.remove();
    window.ZF.go('leaderboard', 'friends');
  });
  document.getElementById('ps-hi') && (document.getElementById('ps-hi').onclick = () => sendHighFive(p.peerId));
}

/* ── Challenges ── */
export function trackChallengeProgress() {
  if (!S.challenges?.length) return;
  const active = S.challenges.filter((c) => c.status === 'active');
  if (!active.length) return;
  const deviceId = S.deviceId;
  let changed = false;
  active.forEach((c) => {
    const me = c.participants.find((p) => p.peerId === deviceId);
    if (!me) return;
    let val = 0;
    if (c.type === 'workouts') val = (S.workouts || []).filter((w) => new Date(w.date || 0).getTime() >= c.startsAt && new Date(w.date || 0).getTime() <= c.endsAt).length;
    else if (c.type === 'habits') val = (S.habits || []).filter((h) => (h.completedDates || []).filter((d) => new Date(d).getTime() >= c.startsAt && new Date(d).getTime() <= c.endsAt).length).length;
    else if (c.type === 'water') val = (S.water?.entries || []).filter((w) => new Date(w.date || 0).getTime() >= c.startsAt && new Date(w.date || 0).getTime() <= c.endsAt).reduce((a, w) => a + ((w.ml || 0) >= 200 ? 1 : 0), 0);
    else if (c.type === 'xp') val = S.player.xp || 0;
    if (val !== me.progress) { me.progress = val; changed = true; }
    const liveIds = Object.keys(peerConnections);
    c.participants.forEach((pt) => {
      if (pt.peerId !== deviceId && liveIds.includes(pt.peerId)) {
        const conn = peerConnections[pt.peerId];
        if (conn?.open) {
          try { conn.send(JSON.stringify({ type: 'challenge_progress', data: { challengeId: c.id, deviceId, progress: val } })); } catch {}
        }
      }
    });
  });
  if (changed) save();
}

export function handleChallengeProgress(data) {
  if (!data?.challengeId || !S.challenges) return;
  const c = S.challenges.find((ch) => ch.id === data.challengeId);
  if (!c) return;
  update((s) => {
    const ch = s.challenges.find((x) => x.id === data.challengeId);
    const p = ch.participants.find((part) => part.peerId === data.deviceId);
    if (p) p.progress = data.progress;
    else ch.participants.push({ peerId: data.deviceId, name: data.name || 'Partner', progress: data.progress });
  });
}

export function createChallenge({ type, title, days, desc, inviteIds }) {
  const titles = { workouts: '💪 Most Workouts', habits: '✅ Most Habits', water: '💧 Most Hydration Days', xp: '⚡ Most XP' };
  const customTitle = (title || '').trim() || titles[type] || 'Challenge';
  const now = Date.now();
  const challenge = {
    id: `ch_${now}_${Math.random().toString(36).slice(2, 6)}`,
    type, title: customTitle, desc: desc || '', durationDays: days,
    startsAt: now, endsAt: now + days * 86400000,
    createdBy: S.player.name || 'Warrior', status: 'active',
    participants: [{ peerId: S.deviceId, name: S.player.name || 'Warrior', progress: 0 }],
    winnerId: null,
  };
  (inviteIds || []).forEach((pid) => {
    const p = (S.partners || []).find((x) => x.peerId === pid);
    if (p) challenge.participants.push({ peerId: p.peerId, name: p.name, progress: 0 });
  });
  update((s) => { s.challenges = [...(s.challenges || []), challenge]; });
  showNotif(`Challenge "${customTitle}" created! (${days} days)`, '⚔️');
  (inviteIds || []).forEach((pid) => {
    const conn = peerConnections[pid];
    if (conn?.open) {
      try {
        conn.send(JSON.stringify({
          type: 'challenge_invite',
          data: { id: challenge.id, title: customTitle, type, desc, durationDays: days, createdBy: S.player.name || 'Warrior', deviceId: S.deviceId },
        }));
      } catch {}
    }
  });
}

export function completeChallenge(id) {
  const c = (S.challenges || []).find((x) => x.id === id);
  if (!c || c.status !== 'active') return;
  const sorted = [...c.participants].sort((a, b) => (b.progress || 0) - (a.progress || 0));
  update((s) => {
    const ch = s.challenges.find((x) => x.id === id);
    ch.status = 'completed';
    ch.winnerId = sorted[0]?.peerId || null;
  });
  const won = sorted[0]?.peerId === S.deviceId;
  showNotif(won ? `🏆 You won "${c.title}"!` : `"${c.title}" complete — winner: ${sorted[0]?.name || '?'}`, won ? '★' : 'OK');
}
