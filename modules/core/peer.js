/* ── ZenFit V2 · core/peer.js ──────────────────────────────
   V1 P2P layer, ported: PeerJS dynamic load, stable device peer
   ID, connect request handshake (accept/reject), live chat,
   high-fives, detail/stats exchange, challenge invites +
   progress broadcast. All state lives in the shared store.
────────────────────────────────────────────────────────────── */
import { S, update, save } from './store.js';
import { rankForLevel } from './utils.js';
import { escapeHtml, sanitizeText, sanitizeNumber } from './sanitize.js';
import { showNotif, openOverlay } from './ui.js';

export const peerConnections = {};
export const peerChatHistory = {};
let peer = null;
let connecting = false;
export const peerConnecting = () => connecting;

export function initPeerJS() {
  connecting = true;
  try { window.ZF?.rerender(); } catch {}
  if (typeof window.Peer !== 'undefined') { startPeer(); return; }
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js';
  script.integrity = 'sha384-PMNj1TmCgXfW24/rfIyxYSAWwj2mffkMfguUWv08iNFcy0kTC0JN7E/tE+pJ7+fa';
  script.crossOrigin = 'anonymous';
  script.onload = () => startPeer();
  script.onerror = () => { connecting = false; showNotif('P2P library failed to load (offline?)', '!'); try { window.ZF?.rerender(); } catch {} };
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
    connecting = false;
    update((s) => { s.peerId = pid; }, { silent: true });
    save();
    showNotif('Connected! Your ID: ' + pid, 'OK');
    window.ZF.rerender();
    broadcastCard();
  });
  peer.on('connection', (conn) => setupConn(conn));
  peer.on('error', (err) => { connecting = false; showNotif('P2P error: ' + (err.type || 'unknown'), '!'); try { window.ZF?.rerender(); } catch {} });
}

export function peerStatus() {
  if (typeof window.Peer === 'undefined') return 'offline';
  if (peer && !peer.destroyed) return 'online';
  return 'ready';
}

/* Go offline: close live channels, destroy the peer, keep identity + partners. */
export function stopPeer() {
  connecting = false;
  try {
    Object.keys(peerConnections).forEach((id) => {
      try { peerConnections[id].close(); } catch {}
      delete peerConnections[id];
    });
  } catch {}
  try { peer?.destroy(); } catch {}
  peer = null;
  save();
  showNotif('P2P disconnected', 'OK');
  try { window.ZF?.rerender(); } catch {}
}

/* Change reflection: on (re)connect, push our live card to every known
   partner peer so levels/XP/streaks converge without manual re-adds. */
export function broadcastCard() {
  if (!peer || peer.destroyed) return;
  (S.partners || []).filter((p) => p.peerId).forEach((p) => {
    try {
      if (peerConnections[p.peerId]?.open) {
        peerConnections[p.peerId].send(JSON.stringify({ type: 'card', data: getMyCard() }));
        return;
      }
      const conn = peer.connect(p.peerId, { reliable: true });
      conn.on('open', () => { try { conn.send(JSON.stringify({ type: 'card', data: getMyCard() })); } catch {} });
      setupConn(conn);
    } catch {}
  });
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
        c.name = sanitizeText(c.name, 60) || conn.peer;
        // F3: bind on the channel. Matching by name let any peer overwrite a record
        // (and its peerId) by guessing a display name.
        const dup = S.pendingRequests.findIndex((p) => p.peerId === conn.peer);
        if (dup > -1) S.pendingRequests[dup] = { ...c, ts: Date.now() };
        else S.pendingRequests.push({ ...c, ts: Date.now() });
        if ((S.partners || []).some((p) => p.peerId === conn.peer)) {
          const idx = S.pendingRequests.findIndex((p) => p.peerId === conn.peer);
          if (idx > -1) acceptRequest(idx);
        } else {
          save();
          showNotif(c.name + ' wants to connect — check Leaderboard', '🔔');
          window.ZF.rerender();
        }
      } else if (msg.type === 'connect_accept') {
        const card = msg.data || {};
        card.peerId = conn.peer;
        // F3: identity is the channel, never the body name. A name from the message
        // must not select which record we overwrite, and an acceptance from a channel
        // we never asked must not create a partner at all.
        card.name = sanitizeText(card.name, 60) || conn.peer;
        const known = (S.partners || []).some((p) => p.peerId === conn.peer)
          || (S.sentRequests || []).some((p) => p.peerId === conn.peer);
        if (!known) return; // unsolicited acceptance — ignore
        update((s) => {
          s.partners = s.partners || [];
          const pIdx = s.partners.findIndex((p) => p.peerId === conn.peer);
          if (pIdx > -1) s.partners[pIdx] = card;
          else s.partners.push(card);
          if (s.sentRequests) {
            s.sentRequests = s.sentRequests.filter((p) => p.peerId !== conn.peer);
          }
        });
        showNotif(card.name + ' accepted your request!', 'OK');
        window.ZF.rerender();
      } else if (msg.type === 'connect_reject') {
        // F3: a rejection is only ours to apply if it arrives on a channel we asked.
        const rName = sanitizeText(msg.name, 60);
        update((s) => {
          if (s.sentRequests) {
            const rIdx = s.sentRequests.findIndex((p) => p.peerId === conn.peer);
            if (rIdx > -1) s.sentRequests.splice(rIdx, 1);
          }
        });
        showNotif((rName || 'Request') + ' declined your connection', '!');
        window.ZF.rerender();
      } else if (msg.type === 'card') {
        const d = msg.data || {};
        d.name = sanitizeText(d.name, 60) || conn.peer;
        if ((S.partners || []).some((p) => p.peerId === conn.peer)) {
          importFromPeer(conn.peer, d);
        } else if ((S.sentRequests || []).some((p) => p.peerId === conn.peer)) {
          // ponytail: offline-accepted handshake completes on next live contact —
          // they accepted while we were away; their card promotes us to partners
          update((s) => {
            s.partners = s.partners || [];
            const card = { ...d, peerId: conn.peer };
            const idx = s.partners.findIndex((p) => p.peerId === conn.peer);
            if (idx > -1) s.partners[idx] = card;
            else s.partners.push(card);
            s.sentRequests = (s.sentRequests || []).filter((p) => p.peerId !== conn.peer);
          });
          save();
          showNotif((d.name || 'Partner') + ' is now in your leaderboard!', 'OK');
          window.ZF.rerender();
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
        // F5: only a peer we actually know may push a challenge into our state.
        // Any inbound P2P channel can send this frame, so gate on the channel.
        if (!knownPeer(conn.peer)) return;
        const ci = msg.data || {};
        // A connected peer chooses this whole frame. Coerce at ingest so no later
        // render site has to re-validate: durationDays feeds a challenge template and
        // a toast, and the text fields are rendered in the challenge list.
        const cid = sanitizeText(String(ci.id || ''), 60) || `ch_${Date.now()}`;
        const ctitle = sanitizeText(ci.title, 80) || 'Challenge';
        const cdesc = sanitizeText(ci.desc, 200);
        const cby = sanitizeText(ci.createdBy, 60) || 'Partner';
        update((s) => {
          s.challenges = s.challenges || [];
          if (!s.challenges.some((c) => c.id === cid)) {
            const days = sanitizeNumber(ci.durationDays, { min: 1, max: 3650, fallback: 7, integer: true });
            const now = Date.now();
            s.challenges.push({
              id: cid, type: 'workouts', title: ctitle, desc: cdesc,
              durationDays: days, startsAt: now, endsAt: now + days * 86400000,
              createdBy: cby, status: 'active',
              participants: [{ peerId: S.deviceId, name: S.player.name, progress: 0 }],
              winnerId: null,
            });
          }
        });
        showNotif(`⚔️ ${cby} invited you to "${ctitle}" (${sanitizeNumber(ci.durationDays, { min: 1, max: 3650, fallback: 7, integer: true })} days)!`, 'OK');
        window.ZF.rerender();
      } else if (msg.type === 'challenge_progress') {
        // F5: the participant is the channel, never a body-supplied deviceId.
        handleChallengeProgress(msg.data, conn.peer);
      } else if (msg.type === 'request_detail' || msg.type === 'request_public_stats') {
        // F3: authorisation binds to the channel. Matching on a caller-supplied
        // display name let any peer read the detailed card by guessing a partner name.
        const allowed = (S.partners || []).some((p) => p.peerId === conn.peer);
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

/** Do we know this peer? Any inbound P2P channel can send any frame, so anything
 *  that mutates shared state is gated on the channel being someone we connected
 *  with (a partner, or a handshake still in flight). */
export function knownPeer(peerId) {
  if (!peerId) return false;
  return (S.partners || []).some((p) => p.peerId === peerId)
    || (S.pendingRequests || []).some((p) => p.peerId === peerId)
    || (S.sentRequests || []).some((p) => p.peerId === peerId);
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
    card.name = sanitizeText(card.name, 60) || peerId;
    const idx = s.partners.findIndex((p) => p.peerId === peerId);
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
  // ponytail: QR capacity — profile pics are base64 bloat, share the card without them
  const card = { ...getMyCard(), avatar: null };
  return btoa(unescape(encodeURIComponent(JSON.stringify(card))));
}

export function sendConnectRequest(code) {
  try {
    if (!code?.trim()) { showNotif('Paste a share code first', '!'); return; }
    const card = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    if (!card.name || card.level == null) { showNotif('Invalid share code', '!'); return; }
    // F4: dedupe on identity (peerId), not on a display name that anyone can choose.
    if (card.peerId && (S.partners || []).some((p) => p.peerId === card.peerId)) { showNotif(card.name + ' is already in your leaderboard', '!'); return; }
    if (card.peerId && (S.sentRequests || []).some((p) => p.peerId === card.peerId)) { showNotif('Request to ' + card.name + ' is already pending', '!'); return; }
    // F4: promote only a pending entry whose channel matches the code we scanned.
    // Matching by display name let a scanned code bind a friend's record to a
    // different peer's channel — the list would show the friend, sends would go to
    // the other peer. The code's own peerId is already trusted two lines above.
    const incomingIdx = (S.pendingRequests || []).findIndex((p) => card.peerId && p.peerId === card.peerId);
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
    const existing = s.partners.findIndex((p) => p.peerId === partnerCard.peerId);
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
    <div><div style="font-size:16px;font-weight:700;font-family:var(--font-display);">${escapeHtml(p.name)} ${p.peerId && peerConnections[p.peerId] ? '<span class="badge badge-green">● live</span>' : ''}</div>
    <div style="font-size:12px;color:var(--text-muted)">Rank #${pos} among friends · Lv ${sanitizeNumber(p.level, { max: 9999, fallback: 1, integer: true })} · ${escapeHtml(p.rank || '')}</div></div></div>
    <div class="grid2 gap8">
      <div class="card-sm text-center"><div style="font-size:18px;font-weight:800;font-family:var(--font-display);">${sanitizeNumber(cached.level ?? p.level, { max: 9999, fallback: 1, integer: true })}</div><div style="font-size:10px;color:var(--text-muted)">Level</div></div>
      <div class="card-sm text-center"><div style="font-size:18px;font-weight:800;font-family:var(--font-display);">${sanitizeNumber(cached.xp ?? p.xp, { max: 99999999, fallback: 0, integer: true })}</div><div style="font-size:10px;color:var(--text-muted)">XP</div></div>
      <div class="card-sm text-center"><div style="font-size:18px;font-weight:800;font-family:var(--font-display);">${sanitizeNumber(cached.streak ?? p.streak, { max: 100000, fallback: 0, integer: true })}</div><div style="font-size:10px;color:var(--text-muted)">Streak</div></div>
      <div class="card-sm text-center"><div style="font-size:18px;font-weight:800;font-family:var(--font-display);">${sanitizeNumber(cached.workouts ?? p.workouts, { max: 1000000, fallback: 0, integer: true })}</div><div style="font-size:10px;color:var(--text-muted)">Workouts</div></div>
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

export function handleChallengeProgress(data, fromPeer) {
  if (!data?.challengeId || !S.challenges) return;
  // F5: the participant is identified by the transport channel, not by a value the
  // peer put in the body. The PeerJS peer id IS the device id, so the channel is a
  // real identity here — a stranger could otherwise forge any participant's result
  // (including ours) by naming their deviceId in the frame.
  if (!fromPeer) return;
  if (data.deviceId && data.deviceId !== fromPeer) return;
  if (!knownPeer(fromPeer)) return;
  const c = S.challenges.find((ch) => ch.id === data.challengeId);
  if (!c) return;
  update((s) => {
    const ch = s.challenges.find((x) => x.id === data.challengeId);
    const p = ch.participants.find((part) => part.peerId === fromPeer);
    // Remote-chosen progress: coerced on arrival, not at each render site.
    const prog = sanitizeNumber(data.progress, { max: 1000000, fallback: 0, integer: true });
    if (p) p.progress = prog;
    else ch.participants.push({ peerId: fromPeer, name: sanitizeText(data.name || 'Partner', 60), progress: prog });
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
