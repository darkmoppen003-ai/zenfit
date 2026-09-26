/* ── ZenFit V2 · features/leaderboard.js ───────────────────
   V1 ranks board: Global / Friends / Challenges tabs plus the
   43-achievement journey grid. Local-first: global works when
   Supabase is configured (Admin → Content), otherwise the
   board runs fully offline.
────────────────────────────────────────────────────────────── */
import { S, update } from '../core/store.js';
import { escapeHtml, sanitizeText, sanitizeNumber } from '../core/sanitize.js';
import { showNotif } from '../core/ui.js';
import { checkAchievements } from '../core/achievements.js';
import {
  peerConnections, peerChatHistory, initPeerJS, peerStatus,
  connectToPeer, sendConnectRequest, acceptRequest, rejectRequest,
  cancelSentRequest, removePartner, sendChat, requestDetail,
  sendHighFive, viewPartnerStats, getShareCode,
  createChallenge, completeChallenge,
} from '../core/peer.js';
import { LeaderboardAPI, toggleGlobalOptIn } from '../core/cloud.js';

let tab = 'global';
export function renderLeaderboard(host, subTab) {
  if (subTab) tab = subTab;
  host.innerHTML = `
  <div class="chart-tab-bar">
    ${[['global', '🌐 Global'], ['friends', 'Friends'], ['challenges', '⚔️ Challenges']].map(([t, label]) =>
      `<div class="chart-tab${tab === t ? ' active' : ''}" data-lb="${t}">${label}</div>`).join('')}
  </div>
  <div id="lb-body"></div>`;

  host.querySelectorAll('[data-lb]').forEach((b) => { b.onclick = () => window.ZF.go('leaderboard', b.dataset.lb); });
  const body = host.querySelector('#lb-body');
  if (tab === 'global') renderGlobal(body);
  else if (tab === 'friends') renderFriends(body);
  else renderChallengesTab(body);
}

let globalRows = null;
let globalLoading = false;

function renderGlobal(body) {
  const optedIn = !!S.globalLeaderboardOptIn;
  const profileOk = !!(S.profile?.name && S.profile?.filled);
  body.innerHTML = `<div class="card mb12" style="border:1px solid ${optedIn ? 'var(--success)' : 'var(--border-strong)'}">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
      <div><div style="font-size:13px;font-weight:600;margin-bottom:3px">${optedIn ? '🌐 Visible on Global Leaderboard' : '🌐 Join Global Leaderboard'}</div>
      <div style="font-size:11px;color:var(--text-muted)">${optedIn ? 'Your name, level, rank, streak & profile picture are visible to all users.' : 'Share your name, level, rank, streak & profile picture with all ZenFit users.'}</div>
      <div style="font-size:11px;color:var(--primary);margin-top:4px">By joining the global leaderboard you will also be able to join and receive missions and get additional XP rewards.</div>
      ${!profileOk ? '<div style="font-size:10px;color:var(--warning);margin-top:4px">⚠️ Complete your profile first</div>' : ''}</div>
      <label style="position:relative;display:inline-block;width:46px;height:26px;flex-shrink:0">
        <input type="checkbox" id="lb-opt" ${optedIn ? 'checked' : ''} ${!profileOk ? 'disabled' : ''} style="opacity:0;width:0;height:0">
        <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${optedIn ? 'var(--success)' : 'var(--bg-overlay)'};border-radius:26px;transition:.3s;border:1px solid var(--border-strong)">
        <span style="position:absolute;height:20px;width:20px;left:${optedIn ? '22px' : '3px'};bottom:2px;background:#fff;border-radius:50%;transition:.3s"></span></span>
      </label></div></div>
    <div id="lb-global-list"></div>`;
  body.querySelector('#lb-opt').onchange = (e) => toggleGlobalOptIn(e.target.checked);
  const list = body.querySelector('#lb-global-list');
  if (globalLoading) {
    list.innerHTML = '<div class="card" style="text-align:center;padding:40px 16px"><div style="font-size:24px;margin-bottom:10px">⚡</div><div style="font-size:13px">Fetching global rankings…</div></div>';
    return;
  }
  if (!globalRows) {
    globalLoading = true;
    LeaderboardAPI.fetch().then((rows) => { globalRows = rows || []; }).catch(() => { globalRows = []; })
      .finally(() => { globalLoading = false; window.ZF.rerender(); });
    list.innerHTML = '<div class="card" style="text-align:center;padding:40px 16px"><div style="font-size:24px;margin-bottom:10px">⚡</div><div style="font-size:13px">Fetching global rankings…</div></div>';
    return;
  }
  list.innerHTML = globalRows.length ? `<div class="card"><div class="section-title">Top Hunters Worldwide</div>` + globalRows.slice(0, 50).map((u, i) => `
    <div class="flex-between mb8"${u.device_id && u.device_id === S.deviceId ? ' style="background:var(--primary-dim);border:1px solid var(--primary);border-radius:10px;padding:6px 8px"' : ''}><div class="flex gap8">
      <span style="font-size:12px;color:var(--text-muted);width:26px">#${i + 1}</span>
      <div><div style="font-size:13px;font-weight:600">${escapeHtml(u.name || 'Hunter')}${u.device_id && u.device_id === S.deviceId ? ' <span class="badge badge-purple">You</span>' : ''}</div>
      <div style="font-size:10px;color:var(--text-muted)">🔥 ${u.streak || 0} streak</div></div></div>
      <span class="badge">Lv ${u.level} · ${escapeHtml(u.rank || '')}</span></div>`).join('') + `</div>`
    : '<div class="card text-center" style="color:var(--text-muted)">Board is empty — be the first.</div>';
  const myIdx = globalRows.findIndex((u) => u.device_id && u.device_id === S.deviceId);
  const myRow = myIdx >= 0 ? globalRows[myIdx] : null;
  const myAvatar = myRow?.avatar_b64 || S.profilePic || '';
  const myInit = escapeHtml(((myRow?.name || S.profile?.name || S.player?.name || 'H')[0] || 'H').toUpperCase());
  list.innerHTML += `<div class="card mt12" style="border:2px solid var(--primary);box-shadow:0 0 18px var(--primary-dim)">
    <div class="section-title">Your standing</div>
    <div class="flex-between" style="gap:10px">
      <div class="flex gap8" style="align-items:center;min-width:0">
      ${/^data:image\/[a-zA-Z+.\-]+;base64,[A-Za-z0-9+/=]+$/.test(myAvatar) ? `<img src="${myAvatar}" alt="" style="width:46px;height:46px;border-radius:50%;object-fit:cover;border:2px solid var(--primary);flex-shrink:0">`
        : `<span style="width:46px;height:46px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;font-family:var(--font-display);background:var(--primary-dim);color:var(--primary);border:2px solid var(--primary)">${myInit}</span>`}
      <div style="min-width:0"><div style="font-size:15px;font-weight:800;font-family:var(--font-display);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(myRow?.name || S.profile?.name || S.player?.name || 'Hunter')}</div>
      <div style="font-size:11px;color:var(--text-muted)">${myRow ? `Rank #${myIdx + 1} worldwide · 🔥 ${myRow.streak || 0} streak` : (optedIn ? 'Climbing — outside the top 50' : 'Join above to enter the ranks')}</div></div></div>
      <div style="text-align:right;flex-shrink:0"><div style="font-size:20px;font-weight:800;font-family:var(--font-display);color:var(--primary)">${myRow ? `#${myIdx + 1}` : `Lv ${S.player?.level || 1}`}</div>
      <div style="font-size:11px;color:var(--text-muted)">${myRow ? `Lv ${myRow.level} · ${escapeHtml(myRow.rank || '')}` : `${S.player?.xp || 0} XP`}</div></div></div></div>`;
}


function renderFriends(body) {
  const partners = S.partners || [];
  const pending = S.pendingRequests || [];
  const sent = S.sentRequests || [];
  const liveIds = Object.keys(peerConnections);
  const myCard = [...partners, { name: S.player.name || 'Warrior', level: S.player.level, xp: S.player.xp, rank: S.player.rank, isMe: true }]
    .sort((a, b) => (b.xp || 0) - (a.xp || 0));
  const myPos = myCard.findIndex((u) => u.isMe) + 1;
  const status = peerStatus();

  body.innerHTML = `
  <div class="card mb12"><div class="flex-between">
    <div><div style="font-size:13px;font-weight:600">P2P Status: ${status === 'online' ? '<span class="badge badge-green">● Online</span>' : '<span class="badge">Offline</span>'}</div>
    <div style="font-size:11px;color:var(--text-muted)" class="mt8">Your Peer ID:<br><strong style="color:var(--primary);font-size:12px">${escapeHtml(S.peerId || S.deviceId || '')}</strong></div></div>
    <button class="btn btn-sm btn-primary" id="fr-start">${status === 'online' ? 'Reconnect' : 'Start P2P'}</button></div></div>
  ${pending.map((r, i) => `<div class="quest-card" style="border-color:var(--warning)"><div style="font-size:22px">🔔</div>
    <div style="flex:1"><div style="font-size:13px"><strong>${escapeHtml(r.name)}</strong> wants to connect</div>
    <div style="font-size:11px;color:var(--text-muted)">Lv ${r.level ?? '?'} · ${escapeHtml(r.rank || '')}</div></div>
    <button class="btn btn-sm btn-success" data-fracc="${i}">Accept</button>
    <button class="btn btn-sm btn-ghost" data-frrej="${i}">Decline</button></div>`).join('')}
  ${sent.map((r, i) => `<div class="quest-card"><div style="font-size:22px">📨</div>
    <div style="flex:1"><div style="font-size:13px">Request to <strong>${escapeHtml(r.name)}</strong> pending…</div></div>
    <button class="btn btn-sm btn-ghost" data-frcancel="${i}">Cancel</button></div>`).join('')}
  <div class="card mb12"><div class="section-title">Connect (share code or Peer ID)</div>
    <div class="flex gap8 mb8"><input type="text" id="fr-code" placeholder="Paste partner share code…" style="flex:1">
    <button class="btn btn-sm btn-primary" id="fr-connect">Connect</button></div>
    <div class="flex gap8"><input type="text" id="fr-peer" placeholder="Or Peer ID (zenfit-user-…)" style="flex:1">
    <button class="btn btn-sm" id="fr-peerbtn">Add live</button></div>
    <div class="flex gap8 mt8"><button class="btn btn-sm btn-ghost" id="fr-mycode">My share code</button></div>
    <div id="fr-codebox" style="display:none" class="mt8"><textarea id="fr-code-out" readonly style="font-size:10px;height:64px"></textarea>
    <div style="font-size:10px;color:var(--text-muted)">Send this code to a friend — they paste it above.</div></div></div>
  <div class="section-title">Friends Leaderboard — you are #${myPos}</div>
  <div id="fr-list">${myCard.map((u) => {
    const idx = partners.indexOf(u);
    const live = u.peerId && liveIds.includes(u.peerId);
    return `<div class="quest-card${u.isMe ? ' done' : ''}" style="${u.isMe ? 'border-color:var(--primary)' : ''}">
      <div class="rank-badge" style="width:36px;height:36px;font-size:15px">${escapeHtml((u.name || '?')[0])}${live ? '<span style="color:var(--success);font-size:9px"> ●</span>' : ''}</div>
      <div style="flex:1"><div style="font-size:13px">${escapeHtml(u.name)}${u.isMe ? ' (you)' : ''}</div>
      <div style="font-size:11px;color:var(--text-muted)">Lv ${u.level ?? 1} · ${u.xp ?? 0} XP · ${escapeHtml(u.rank || '')}</div></div>
      ${!u.isMe ? `<button class="btn btn-sm btn-ghost" data-frstats="${idx}">Stats</button>
      ${u.peerId ? `<button class="btn btn-sm" data-frchat="${idx}" style="border-color:var(--info);color:var(--info)">Chat</button>` : ''}
      <button class="btn btn-sm btn-ghost" data-frdel="${idx}">✕</button>` : '<span class="badge">YOU</span>'}</div>`;
  }).join('')}</div>
  <div id="fr-chatbox"></div>`;

  body.querySelector('#fr-start').onclick = () => initPeerJS();
  body.querySelector('#fr-connect').onclick = () => sendConnectRequest(body.querySelector('#fr-code').value);
  body.querySelector('#fr-peerbtn').onclick = () => connectToPeer(body.querySelector('#fr-peer').value);
  body.querySelector('#fr-mycode').onclick = () => {
    const box = body.querySelector('#fr-codebox');
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
    body.querySelector('#fr-code-out').value = getShareCode();
  };
  body.querySelectorAll('[data-fracc]').forEach((b) => { b.onclick = () => acceptRequest(Number(b.dataset.fracc)); });
  body.querySelectorAll('[data-frrej]').forEach((b) => { b.onclick = () => rejectRequest(Number(b.dataset.frrej)); });
  body.querySelectorAll('[data-frcancel]').forEach((b) => { b.onclick = () => cancelSentRequest(Number(b.dataset.frcancel)); });
  body.querySelectorAll('[data-frdel]').forEach((b) => { b.onclick = () => removePartner(Number(b.dataset.frdel)); });
  body.querySelectorAll('[data-frstats]').forEach((b) => { b.onclick = () => viewPartnerStats(Number(b.dataset.frstats)); });
  body.querySelectorAll('[data-frchat]').forEach((b) => { b.onclick = () => openChat(body, partners[Number(b.dataset.frchat)]); });
}

function openChat(body, p) {
  if (!p?.peerId) return;
  const box = body.querySelector('#fr-chatbox');
  const msgs = (peerChatHistory[p.peerId] || []).slice(-20);
  box.innerHTML = `<div class="card mt12" style="border-color:var(--success)">
    <div class="flex-between mb8"><div style="font-size:13px;font-weight:600">● ${escapeHtml(p.name)}</div>
    <div class="flex gap8"><button class="btn btn-sm btn-ghost" id="fr-hi">✋</button>
    <button class="btn btn-sm btn-ghost" id="fr-detail">Stats</button>
    <button class="btn btn-sm btn-ghost" id="fr-x">✕</button></div></div>
    <div style="max-height:140px;overflow-y:auto;margin-bottom:6px;display:flex;flex-direction:column;gap:3px">`
    + (msgs.length ? msgs.map((m) => `<div style="padding:4px 8px;border-radius:6px;font-size:11px;max-width:85%;${m.mine ? 'align-self:flex-end;background:var(--primary-dark);color:#fff' : 'align-self:flex-start;background:var(--bg-raised);color:var(--text-secondary)'}">${escapeHtml(m.text)}</div>`).join('')
      : '<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:8px">No messages yet</div>') + `</div>
    <div style="display:flex;gap:6px"><input type="text" id="fr-msg" placeholder="Message..." style="flex:1;font-size:12px" maxlength="500">
    <button class="btn btn-primary btn-sm" id="fr-send">Send</button></div></div>`;
  const send = () => {
    const inp = box.querySelector('#fr-msg');
    if (inp.value.trim()) { sendChat(p.peerId, inp.value); openChat(body, (S.partners || []).find((x) => x.peerId === p.peerId) || p); }
  };
  box.querySelector('#fr-send').onclick = send;
  box.querySelector('#fr-msg').onkeydown = (e) => { if (e.key === 'Enter') send(); };
  box.querySelector('#fr-x').onclick = () => { box.innerHTML = ''; };
  box.querySelector('#fr-hi').onclick = () => sendHighFive(p.peerId);
  box.querySelector('#fr-detail').onclick = () => requestDetail(p.peerId);
}

function renderChallengesTab(body) {
  const challenges = S.challenges || [];
  const active = challenges.filter((c) => c.status === 'active');
  const done = challenges.filter((c) => c.status === 'completed');
  const liveIds = Object.keys(peerConnections);
  const livePartners = (S.partners || []).filter((p) => p.peerId && liveIds.includes(p.peerId));
  body.innerHTML = `<div class="card mb12" style="background:linear-gradient(135deg,var(--bg-surface),var(--bg-raised));border:1px solid var(--info);text-align:center;padding:14px">
    <div style="font-size:28px;margin-bottom:6px">⚔️</div>
    <div style="font-size:14px;font-weight:700">Weekly Challenges</div>
    <div style="font-size:11px;color:var(--text-muted)">Compete with friends — most ${active.length ? 'activity this week wins!' : 'activity wins!'}</div></div>
  <div class="card mb12"><div class="section-title">Create Custom Challenge</div>
    <input type="text" id="ch-title" placeholder="Challenge title (e.g. 'Most Pushups This Week')" style="font-size:12px;margin-bottom:8px" maxlength="80">
    <div style="display:grid;grid-template-columns:1fr auto 80px auto;gap:6px;align-items:center;margin-bottom:8px">
      <select id="ch-type" style="font-size:12px;width:100%">
        <option value="workouts">💪 Count Workouts</option><option value="habits">✅ Count Habits</option>
        <option value="water">💧 Count Hydration Days</option><option value="xp">⚡ XP Earned</option></select>
      <span style="font-size:11px;color:var(--text-muted)">for</span>
      <input type="number" id="ch-days" value="7" min="1" max="90" style="width:100%;font-size:12px;text-align:center" aria-label="Duration in days">
      <span style="font-size:11px;color:var(--text-muted)">days</span></div>
    <textarea id="ch-desc" placeholder="Optional: describe the rules or scoring..." style="font-size:11px;min-height:40px;margin-bottom:8px" maxlength="200"></textarea>
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">
      <div style="font-size:11px;color:var(--text-muted)">Invite friends:</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${livePartners.length ? livePartners.map((p) => {
          const safeId = (p.peerId || '').replace(/-/g, '');
          return `<label style="display:flex;align-items:center;gap:4px;font-size:11px;background:var(--bg-raised);padding:3px 8px;border-radius:6px;border:1px solid var(--border-mid);cursor:pointer"><input type="checkbox" id="ch-inv-${safeId}" style="width:auto"> ${escapeHtml(p.name)}</label>`;
        }).join('') : '<span style="font-size:11px;color:var(--text-muted)">No live partners — go Friends → Start P2P</span>'}
      </div></div>
    <button class="btn btn-primary btn-full mt8" id="ch-create">Create Challenge</button></div>
  <div id="ch-list"></div>`;

  body.querySelector('#ch-create').onclick = () => {
    const type = body.querySelector('#ch-type').value;
    const days = Math.max(1, Math.min(90, sanitizeNumber(body.querySelector('#ch-days').value, { min: 1, max: 90, fallback: 7, integer: true })));
    const invited = livePartners.filter((p) => body.querySelector(`#ch-inv-${(p.peerId || '').replace(/-/g, '')}`)?.checked).map((p) => p.peerId);
    if (!invited.length && !(S.partners || []).length) { showNotif('Add partners first!', '!'); return; }
    createChallenge({
      type, title: sanitizeText(body.querySelector('#ch-title').value, 80),
      days, desc: sanitizeText(body.querySelector('#ch-desc').value, 200), inviteIds: invited,
    });
    checkAchievements();
  };

  const chList = body.querySelector('#ch-list');
  const paint = (arr, label) => {
    if (!arr.length) return;
    const sec = document.createElement('div');
    sec.innerHTML = `<div class="section-title mt12">${label} (${arr.length})</div>`;
    chList.appendChild(sec);
    arr.forEach((c) => {
      const me = (c.participants || []).find((p) => p.peerId === S.deviceId);
      const lead = [...(c.participants || [])].sort((a, b) => (b.progress || 0) - (a.progress || 0))[0];
      const d = document.createElement('div');
      d.className = 'plan-card';
      d.innerHTML = `<div class="flex-between mb8"><div style="font-size:14px;font-weight:600">${escapeHtml(c.title)}</div>
        <span class="badge ${c.status === 'active' ? 'badge-info' : 'badge-green'}">${c.status}</span></div>
        ${c.desc ? `<div style="font-size:12px;color:var(--text-muted)" class="mb8">${escapeHtml(c.desc)}</div>` : ''}
        <div style="font-size:11px;color:var(--text-muted)" class="mb8">${escapeHtml(c.type)} · ${c.durationDays || '?'} days · ends ${escapeHtml(new Date(c.endsAt || Date.now()).toLocaleDateString())}</div>
        ${(c.participants || []).map((p) => `<div class="flex-between mb8" style="font-size:12px"><span>${escapeHtml(p.name)}${p.peerId === S.deviceId ? ' (you)' : ''}</span><strong>${p.progress || 0}</strong></div>`).join('')}
        <div style="font-size:11px;color:var(--warning)" class="mb8">Leader: ${escapeHtml(lead?.name || '—')}</div>
        <div class="flex gap8">
          ${c.status === 'active' ? '<button class="btn btn-sm btn-success" data-chdone>Finish & declare winner</button>' : `<div style="font-size:12px">🏆 Winner: <strong>${escapeHtml((c.participants || []).find((p) => p.peerId === c.winnerId)?.name || '—')}</strong></div>`}
          <button class="btn btn-sm btn-ghost" data-chdel>✕</button></div>`;
      const doneBtn = d.querySelector('[data-chdone]');
      if (doneBtn) doneBtn.onclick = () => { completeChallenge(c.id); checkAchievements(); };
      d.querySelector('[data-chdel]').onclick = () => update((s) => { s.challenges = s.challenges.filter((x) => x.id !== c.id); });
      chList.appendChild(d);
    });
  };
  paint(active, 'Active');
  paint(done, 'Completed');
}
