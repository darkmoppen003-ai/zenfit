/* ── ZenFit V2 · features/admin.js ─────────────────────────
   STEP 10 — Admin console (local-first, scalable).
   Hidden + owner-only: no nav entry (open with 5 taps on the
   dashboard rank badge), gated by the owner password whose
   SHA-256 lives in core/secrets.js (plaintext only in the
   gitignored admin.env on your machine).
────────────────────────────────────────────────────────────── */
import { S, update, idbDeleteImage } from '../core/store.js';
import { uid } from '../core/utils.js';
import { escapeHtml, sanitizeText, sanitizeNumber } from '../core/sanitize.js';
import { getTodayStr } from '../core/utils.js';
import { showNotif, awardXP, MSG_BGS, openOverlay } from '../core/ui.js';
import { MISSION_CATS, missionProgress } from '../core/missions.js';
import { THEMES, PRESET_WALLPAPERS, normalizeTheme, getCustomThemes, applyTheme, applyThemeObject } from '../core/themes.js';
import { verifyAdminPassword } from '../core/secrets.js';

let unlocked = false;
let tab = 'overview';

export function renderAdmin(host) {
  if (!unlocked) return renderLock(host);

  const rewards = (S.adminRewards || []).slice().reverse().slice(0, 10);
  host.innerHTML = `
  <div class="chart-tab-bar">${['overview', 'users', 'rewards', 'missions', 'broadcast', 'content'].map((t) =>
    `<div class="chart-tab${tab === t ? ' active' : ''}" data-atab="${t}">${t[0].toUpperCase() + t.slice(1)}</div>`).join('')}</div>
  <div id="admin-body"></div>
  <button class="btn btn-sm btn-ghost mt12" id="admin-lock">Lock console</button>`;

  host.querySelectorAll('[data-atab]').forEach((b) => { b.onclick = () => { tab = b.dataset.atab; window.ZF.rerender(); }; });
  host.querySelector('#admin-lock').onclick = () => { unlocked = false; window.ZF.rerender(); };
  const body = host.querySelector('#admin-body');
  if (tab === 'overview') {
    body.innerHTML = `<div class="grid2">
      <div class="card-sm text-center"><div style="font-size:11px;color:var(--text-muted)">LEVEL</div><div style="font-size:22px;font-weight:800">${S.player.level} · ${escapeHtml(S.player.rank)}</div></div>
      <div class="card-sm text-center"><div style="font-size:11px;color:var(--text-muted)">TOTAL XP EARNED</div><div style="font-size:22px;font-weight:800">${totalXp()}</div></div>
      <div class="card-sm text-center"><div style="font-size:11px;color:var(--text-muted)">WORKOUTS</div><div style="font-size:22px;font-weight:800">${S.workouts.length}</div></div>
      <div class="card-sm text-center"><div style="font-size:11px;color:var(--text-muted)">MEALS LOGGED</div><div style="font-size:22px;font-weight:800">${S.nutrition.entries.length}</div></div>
      <div class="card-sm text-center"><div style="font-size:11px;color:var(--text-muted)">HABITS</div><div style="font-size:22px;font-weight:800">${(S.habits || []).length}</div></div>
      <div class="card-sm text-center"><div style="font-size:11px;color:var(--text-muted)">ZEN SESSIONS</div><div style="font-size:22px;font-weight:800">${S.zen.totalSessions}</div></div>
    </div>
    <div class="card mt12"><div class="section-title">Recent rewards granted</div>
    ${rewards.map((r) => `<div style="font-size:12px" class="mb8">+${r.xp} XP — ${escapeHtml(r.reason)} <span style="color:var(--text-muted)">(${escapeHtml(r.date)})</span></div>`).join('') || '<div style="font-size:12px;color:var(--text-muted)">None yet.</div>'}</div>`;
  } else if (tab === 'users') renderUsers(body);
  else if (tab === 'rewards') renderRewards(body);
  else if (tab === 'missions') renderMissions(body);
  else if (tab === 'broadcast') renderBroadcast(body);
  else renderContent(body);
}

function totalXp() {
  return (S.workouts.length * 10) + (S.nutrition.entries.length * 5) + ((S.questsDoneTotal || 0) * 10) + S.player.xp;
}

/* ── Owner password gate (hash-compared, never plaintext) ── */
function renderLock(host) {
  host.innerHTML = `
  <div class="card text-center"><div style="width:40px;height:40px;margin:0 auto 12px;color:var(--primary)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:100%;height:100%"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
  <div style="font-size:13px;font-weight:600;margin-bottom:4px">Restricted Console</div>
  <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Owner password required.</p>
  <input type="password" id="ad-pass" placeholder="Owner password" maxlength="64" autocomplete="off" style="max-width:240px;margin:0 auto">
  <button class="btn btn-primary mt8" id="ad-unlock">Unlock</button>
  <div id="ad-err" style="font-size:12px;color:var(--danger);margin-top:8px;min-height:16px"></div></div>`;
  const go = async () => {
    const v = host.querySelector('#ad-pass').value || '';
    host.querySelector('#ad-err').textContent = 'Checking…';
    // Gentle rate limit: brief delay + attempt counter
    try {
      const n = (+sessionStorage.getItem('zf_admin_try') || 0) + 1;
      sessionStorage.setItem('zf_admin_try', String(n));
      if (n > 5) await new Promise((r) => setTimeout(r, 1500));
    } catch {}
    if (await verifyAdminPassword(v)) {
      try { sessionStorage.removeItem('zf_admin_try'); } catch {}
      host.querySelector('#ad-pass').value = '';
      unlocked = true;
      showNotif('Admin console unlocked', 'OK');
      window.ZF.rerender();
    } else {
      host.querySelector('#ad-err').textContent = 'Wrong password.';
      host.querySelector('#ad-pass').value = '';
    }
  };
  host.querySelector('#ad-unlock').onclick = go;
  host.querySelector('#ad-pass').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}

/* ── Users: search + per-user reward/punish/message ── */
function renderUsers(body) {
  const partners = S.partners || [];
  body.innerHTML = `<div class="card mb12"><div class="section-title">Find users</div>
    <input type="text" id="ad-usearch" placeholder="Search name…" maxlength="40">
    <div style="font-size:11px;color:var(--text-muted)" class="mt8">Searches this device, partners and the global board. Rewards/punishments apply instantly on this device; remote users receive them as targeted inbox items.</div></div>
  <div class="card mb12"><div class="section-title">This device (you)</div>
    <table class="admin-table"><tr><th>Name</th><th>Level</th><th>Rank</th></tr>
    <tr><td>${escapeHtml(S.profile.name || S.player.name)}</td><td>${S.player.level}</td><td>${escapeHtml(S.player.rank)}</td></tr></table>
    <div class="flex gap8 mt8"><input type="number" id="ad-self-xp" placeholder="XP" min="-500" max="1000" style="max-width:110px">
    <button class="btn btn-sm btn-success" id="ad-self-reward">Reward</button>
    <button class="btn btn-sm btn-danger" id="ad-self-punish">Punish</button></div></div>
  <div class="card mb12"><div class="section-title">Training partners</div>
    <div class="flex gap8 mb8"><input type="text" id="ad-pname" placeholder="Partner name" maxlength="40">
    <button class="btn btn-sm btn-primary" id="ad-padd">Add</button></div>
    <div id="ad-plist">${partners.map((p, i) => `<div class="flex-between mb8" data-uname="${escapeHtml((p.name || '').toLowerCase())}"><span style="font-size:13px">${escapeHtml(p.name)} <span style="color:var(--text-muted)">Lv ${p.level || 1}</span></span>
    <span class="flex gap8"><button class="btn btn-sm" data-pmsg="${i}">Message</button><button class="btn btn-sm btn-ghost" data-pdel="${i}">Remove</button></span></div>`).join('') || '<div style="font-size:12px;color:var(--text-muted)">No partners yet.</div>'}</div></div>
  <div class="card"><div class="section-title">Global board</div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Top players by level. Message/Reward/Punish sends a targeted inbox item (falls back gracefully if tables are missing).</div>
    <div id="ad-global-list"><div style="font-size:12px;color:var(--text-muted)">Loading…</div></div></div>`;
  const q = body.querySelector('#ad-usearch');
  q.oninput = () => {
    const needle = q.value.toLowerCase();
    body.querySelectorAll('[data-uname]').forEach((el) => { el.style.display = el.dataset.uname.includes(needle) ? '' : 'none'; });
    body.querySelectorAll('[data-gname]').forEach((el) => { el.style.display = el.dataset.gname.includes(needle) ? '' : 'none'; });
  };
  body.querySelector('#ad-padd').onclick = () => {
    const name = sanitizeText(body.querySelector('#ad-pname').value, 40);
    if (!name) return;
    update((s) => { s.partners = [...s.partners, { id: uid('partner'), name, level: 1 }]; });
  };
  body.querySelectorAll('[data-pdel]').forEach((b) => { b.onclick = () => update((s) => { s.partners.splice(Number(b.dataset.pdel), 1); }); });
  body.querySelectorAll('[data-pmsg]').forEach((b) => {
    b.onclick = () => {
      const p = partners[Number(b.dataset.pmsg)];
      const text = prompt(`Message to ${p?.name}:`);
      if (!text) return;
      sendTargeted('message', p?.name, sanitizeText(text, 300));
    };
  });
  const selfXp = () => sanitizeNumber(body.querySelector('#ad-self-xp').value, { min: 1, max: 1000, fallback: NaN, integer: true });
  body.querySelector('#ad-self-reward').onclick = () => {
    const xp = selfXp();
    if (!Number.isFinite(xp)) { showNotif('Enter XP 1–1000', '!'); return; }
    awardXP(xp, 'Owner reward');
  };
  body.querySelector('#ad-self-punish').onclick = async () => {
    const xp = selfXp();
    if (!Number.isFinite(xp)) { showNotif('Enter XP 1–1000', '!'); return; }
    const { deductXP } = await import('../core/store.js');
    deductXP(xp, 'Owner penalty');
    showNotif(`−${xp} XP penalty applied`, '!');
  };
  loadGlobalUsers(body);
}

async function sendTargeted(kind, target, text, xp = 0) {
  try {
    const { GlobalBoard } = await import('../core/cloud.js');
    if (kind === 'message') {
      const ok = await GlobalBoard.publish('global_broadcasts', { title: `Coach message`, body: String(text).slice(0, 300), target: target || 'all' });
      showNotif(ok ? (target ? `Message queued for ${target}` : 'Broadcast queued') : 'Queue failed — check cloud config', ok ? 'OK' : '!');
    } else {
      const ok = await GlobalBoard.publish('global_rewards', { title: `${xp > 0 ? 'Reward' : 'Penalty'}: ${target}`, xp, code: `U-${Date.now().toString(36).toUpperCase()}`, target: target || 'all' });
      showNotif(ok ? `Queued for ${target || 'all'}` : 'Queue failed — check cloud config', ok ? 'OK' : '!');
    }
  } catch { showNotif('Queue failed', '!'); }
}

async function loadGlobalUsers(body) {
  const box = body.querySelector('#ad-global-list');
  if (!box) return;
  try {
    const { LeaderboardAPI } = await import('../core/cloud.js');
    const rows = await LeaderboardAPI.fetch(50);
    if (!rows?.length) { box.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">Board empty or offline.</div>'; return; }
    box.innerHTML = rows.map((r, i) => `<div class="flex-between mb8" data-gname="${escapeHtml((r.name || '').toLowerCase())}">
      <span style="font-size:13px">${escapeHtml(r.name)} <span style="color:var(--text-muted)">Lv ${r.level} · ${escapeHtml(r.rank || '')}</span></span>
      <span class="flex gap8"><button class="btn btn-sm" data-gmsg="${i}">Message</button><button class="btn btn-sm btn-success" data-grw="${i}">Reward</button><button class="btn btn-sm btn-danger" data-gpn="${i}">Punish</button></span></div>`).join('');
    const act = (idx, fn) => fn(rows[idx]);
    box.querySelectorAll('[data-gmsg]').forEach((b) => { b.onclick = () => act(Number(b.dataset.gmsg), (r) => {
      const text = prompt(`Message to ${r.name} (broadcast target):`);
      if (text) sendTargeted('message', r.name, sanitizeText(text, 300));
    }); });
    box.querySelectorAll('[data-grw]').forEach((b) => { b.onclick = () => act(Number(b.dataset.grw), (r) => {
      const v = Number(prompt(`Reward XP for ${r.name}:`, '50'));
      if (Number.isFinite(v) && v > 0) sendTargeted('reward', r.name, '', Math.min(1000, Math.round(v)));
    }); });
    box.querySelectorAll('[data-gpn]').forEach((b) => { b.onclick = () => act(Number(b.dataset.gpn), (r) => {
      const v = Number(prompt(`Penalty XP for ${r.name}:`, '50'));
      if (Number.isFinite(v) && v > 0) sendTargeted('reward', r.name, '', -Math.min(500, Math.round(v)));
    }); });
  } catch { box.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">Board offline.</div>'; }
}

/* ── Rewards ── */
function renderRewards(body) {
  body.innerHTML = `<div class="card"><div class="section-title">Send reward to inbox (claimable, one-time)</div>
    <div class="grid2 gap8">
      <input type="number" id="ad-xp" placeholder="XP amount" min="-500" max="1000">
      <input type="text" id="ad-reason" placeholder="Reason (e.g. Event winner)" maxlength="80">
    </div>
    <input type="text" id="ad-rtarget" placeholder="Global to: blank = all, or name" maxlength="40" class="mt8">
    <div class="flex gap8 mt8">
      <button class="btn btn-primary btn-sm" id="ad-send-inbox">Send to inbox</button>
      <button class="btn btn-success btn-sm" id="ad-grant">Grant instantly (this device)</button>
      <button class="btn btn-sm" id="ad-grant-global">Publish global reward</button>
    </div>
    <div class="flex gap8 mt8">
      <button class="btn btn-sm btn-ghost" id="ad-streak">+1 zen streak day</button>
    </div>
    <div style="font-size:11px;color:var(--text-muted)" class="mt8">Inbox rewards are claimed once via Claim button (negative XP = punishment). Instant grants apply immediately. Every grant is logged (see Overview).</div></div>`;
  const readXp = (allowNeg) => sanitizeNumber(body.querySelector('#ad-xp').value, { min: allowNeg ? -500 : 1, max: 1000, fallback: NaN, integer: true });
  body.querySelector('#ad-send-inbox').onclick = () => {
    const xp = readXp(true);
    const reason = sanitizeText(body.querySelector('#ad-reason').value, 80) || 'Reward';
    if (!Number.isFinite(xp) || xp === 0) { showNotif('Enter XP (−500…1000, ≠0)', '!'); return; }
    update((s) => {
      s.inbox = [...(s.inbox || []), { id: uid('reward'), kind: 'reward', title: xp > 0 ? `Reward: ${reason}` : `Penalty: ${reason}`, body: `${xp > 0 ? '+' : ''}${xp} XP — tap Claim to apply (one-time).`, xp, date: getTodayStr(), ts: Date.now() }];
      s.inboxUnread = (s.inboxUnread || 0) + 1;
    });
    showNotif('Reward sent to inbox', 'OK');
  };
  body.querySelector('#ad-grant').onclick = () => {
    const xp = sanitizeNumber(body.querySelector('#ad-xp').value, { min: 1, max: 1000, fallback: NaN, integer: true });
    const reason = sanitizeText(body.querySelector('#ad-reason').value, 80) || 'Admin reward';
    if (!Number.isFinite(xp)) { showNotif('Enter XP 1–1000', '!'); return; }
    const day = getTodayStr();
    update((s) => { s.adminRewards = [...(s.adminRewards || []), { xp, reason, date: day, ts: Date.now() }]; });
    awardXP(xp, reason);
  };
  body.querySelector('#ad-grant-global').onclick = async () => {
    const xp = sanitizeNumber(body.querySelector('#ad-xp').value, { min: 1, max: 1000, fallback: NaN, integer: true });
    const reason = sanitizeText(body.querySelector('#ad-reason').value, 80) || 'Admin reward';
    if (!Number.isFinite(xp)) { showNotif('Enter XP 1–1000', '!'); return; }
    const target = sanitizeText(body.querySelector('#ad-rtarget').value, 40) || 'all';
    showNotif('Publishing global reward…', 'OK');
    const { GlobalBoard } = await import('../core/cloud.js');
    const ok = await GlobalBoard.publishReward(reason, xp, `RW-${Date.now().toString(36).toUpperCase()}`, target);
    showNotif(ok ? (target === 'all' ? 'Global reward live — users claim from Inbox' : `Reward queued for ${target}`) : 'Publish failed — check Supabase config (Content tab)', ok ? 'OK' : '!');
  };
  body.querySelector('#ad-streak').onclick = () => {
    update((s) => { s.zen.currentStreak += 1; s.zen.bestStreak = Math.max(s.zen.bestStreak, s.zen.currentStreak); });
    showNotif('Streak extended', 'OK');
  };
}

/* ── Missions / events ── */
function renderMissions(body) {
  const events = S.events || [];
  body.innerHTML = `<div class="card mb12"><div class="section-title">New mission / event</div>
    <div class="grid2 gap8">
      <input type="text" id="ad-mtitle" placeholder="Title (e.g. Weekend 5K)" maxlength="60">
      <input type="text" id="ad-micon" placeholder="Icon emoji" maxlength="8">
      <input type="text" id="ad-mbody" placeholder="Details…" maxlength="200" style="grid-column:1/-1">
      <input type="text" id="ad-mimg" placeholder="Image URL (https://…) — optional" maxlength="500" style="grid-column:1/-1">
      <input type="number" id="ad-mxp" placeholder="Reward XP" min="1" max="500">
    </div>
    <div class="section-title mt12">Completion rules — matched against user logs (all rows must hold)</div>
    <div id="ad-rules" style="display:flex;flex-direction:column;gap:6px"></div>
    <button class="btn btn-sm btn-ghost mt8" id="ad-rule-add">+ Add rule</button>
    <div class="flex gap8 mt8">
      <button class="btn btn-primary btn-sm" id="ad-msend">Publish mission</button>
    </div>
    <div style="font-size:11px;color:var(--text-muted)" class="mt8">Example: 50 squats + 3000ml water + 5 habits, 5 days in a row. Leave rules empty for a manual mission.</div></div>
  <div class="section-title">Live & past</div>
  ${events.slice().reverse().map((m) => {
    let prog = '';
    try { const p = (m.rules || []).length ? missionProgress(m) : null; if (p && p.detail !== 'manual') prog = `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${escapeHtml(p.detail)}</div>`; } catch {}
    return `<div class="quest-card"><div style="font-size:22px">${escapeHtml(m.icon || '📯')}</div>
    <div style="flex:1"><div style="font-size:13px;font-weight:600">${escapeHtml(m.title)} ${m.status === 'done' ? '<span class="badge badge-green">done</span>' : '<span class="badge badge-amber">live</span>'}</div>
    <div style="font-size:12px;color:var(--text-secondary)">${escapeHtml(m.body || '')}</div>
    ${ruleSummary(m)}${prog}</div>
    <button class="btn btn-sm btn-ghost" data-mdel="${m.id}">✕</button></div>`; }).join('') || '<div class="card">No missions yet.</div>'}`;
  body.querySelector('#ad-msend').onclick = () => {
    const title = sanitizeText(body.querySelector('#ad-mtitle').value, 60);
    if (!title) { showNotif('Title required', '!'); return; }
    const rules = [...body.querySelectorAll('[data-rule]')].map((row) => readRuleRow(row)).filter(Boolean);
    update((s) => {
      s.events = [...(s.events || []), {
        id: uid('event'), title, kind: 'mission',
        icon: sanitizeText(body.querySelector('#ad-micon').value, 8) || '📯',
        body: sanitizeText(body.querySelector('#ad-mbody').value, 200),
        image: cleanImageUrl(body.querySelector('#ad-mimg').value),
        xp: sanitizeNumber(body.querySelector('#ad-mxp').value, { min: 1, max: 500, fallback: 25, integer: true }),
        rules, status: 'live', ts: Date.now(),
      }];
    });
    showNotif(rules.length ? 'Mission live — auto-checks your logs' : 'Mission published (manual)', 'OK');
    import('../core/missions.js').then((m) => { try { m.checkMissions(); } catch {} }).catch(() => {});
  };
  const addRule = (preset = { cat: 'water', target: 3000, days: 5 }) => {
    const row = document.createElement('div');
    row.setAttribute('data-rule', '1');
    row.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:8px;border:1px solid var(--border-mid);border-radius:10px';
    row.innerHTML = `<div style="display:flex;gap:6px;align-items:center">
      <select data-rcat style="flex:1">${MISSION_CATS.map((c) => `<option value="${c.id}"${preset.cat === c.id ? ' selected' : ''}>${c.label}</option>`).join('')}</select>
      <button class="btn btn-sm btn-ghost" data-rrm>✕</button></div>
      <div data-rfields style="display:flex;gap:6px;flex-wrap:wrap"></div>`;
    row.querySelector('[data-rrm]').onclick = () => row.remove();
    const paint = () => paintRuleFields(row, preset);
    row.querySelector('[data-rcat]').onchange = (e) => { preset = { cat: e.target.value }; paint(); };
    body.querySelector('#ad-rules').appendChild(row);
    paint();
  };
  body.querySelector('#ad-rule-add').onclick = () => addRule();
  addRule({ cat: 'water', target: 3000, days: 5 });
  const pubG = document.createElement('button');
  pubG.className = 'btn btn-sm mt8';
  pubG.textContent = 'Publish same mission globally';
  pubG.onclick = async () => {
    const title = sanitizeText(body.querySelector('#ad-mtitle').value, 60);
    if (!title) { showNotif('Title required', '!'); return; }
    const rules = [...body.querySelectorAll('[data-rule]')].map((row) => readRuleRow(row)).filter(Boolean);
    const { GlobalBoard } = await import('../core/cloud.js');
    const ok = await GlobalBoard.publishEvent(title, sanitizeText(body.querySelector('#ad-mbody').value, 200), sanitizeNumber(body.querySelector('#ad-mxp').value, { min: 1, max: 500, fallback: 25, integer: true }), 'all', rules.length ? rules : null, cleanImageUrl(body.querySelector('#ad-mimg').value));
    showNotif(ok ? 'Mission live globally — users track it from Inbox' : 'Publish failed — check Supabase config', ok ? 'OK' : '!');
  };
  body.querySelector('#ad-msend').after(pubG);
  const gSec = document.createElement('div');
  gSec.innerHTML = `<div class="section-title mt12">Global missions (all devices, admin only)</div><div id="ad-gmissions"><div style="font-size:12px;color:var(--text-muted)">Loading…</div></div>`;
  body.appendChild(gSec);
  import('../core/cloud.js').then(async ({ GlobalBoard, sbDel }) => {
    const box = gSec.querySelector('#ad-gmissions');
    try {
      const rows = await GlobalBoard.fetchEvents();
      box.innerHTML = rows.length ? rows.slice(0, 20).map((r) => `<div class="flex-between mb8" style="gap:6px">
        <div style="min-width:0"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.title || 'Mission')}</div>
        <div style="font-size:11px;color:var(--text-muted)">${escapeHtml((r.descr || r.desc || '').slice(0, 60))}</div></div>
        <button class="btn btn-sm btn-danger" data-gmdel="${escapeHtml(r.id || '')}">Delete</button></div>`).join('')
        : '<div style="font-size:12px;color:var(--text-muted)">Nothing published yet.</div>';
      box.querySelectorAll('[data-gmdel]').forEach((b) => {
        b.onclick = async () => {
          b.disabled = true;
          const ok = await sbDel('global_events', b.dataset.gmdel);
          showNotif(ok ? 'Mission removed globally' : 'Delete failed', ok ? 'OK' : '!');
          if (ok) window.ZF.rerender();
          else b.disabled = false;
        };
      });
    } catch { box.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">Offline.</div>'; }
  }).catch(() => {});
  body.querySelectorAll('[data-mdel]').forEach((b) => { b.onclick = () => update((s) => { s.events = s.events.filter((x) => x.id !== b.dataset.mdel); }); });
}

/** Read one designer row into a rule object (sanitized) or null. */
function readRuleRow(row) {
  const cat = row.querySelector('[data-rcat]')?.value || 'water';
  const days = sanitizeNumber(row.querySelector('[data-rdays]')?.value, { min: 1, max: 90, fallback: 1, integer: true });
  if (cat === 'workout') {
    const exercise = sanitizeText(row.querySelector('[data-rex]')?.value, 40);
    const sets = sanitizeNumber(row.querySelector('[data-rsets]')?.value, { min: 0, max: 100, fallback: 0, integer: true });
    const reps = sanitizeNumber(row.querySelector('[data-rreps]')?.value, { min: 0, max: 5000, fallback: 0, integer: true });
    if (!exercise && !sets && !reps) return null;
    return { cat, exercise, sets, reps, days };
  }
  if (cat === 'streak') {
    const target = sanitizeNumber(row.querySelector('[data-rtarget]')?.value, { min: 1, max: 365, fallback: NaN, integer: true });
    if (!Number.isFinite(target)) return null;
    return { cat, target, days: 1 };
  }
  const maxV = cat === 'screentime' ? 1440 : 100000;
  const target = sanitizeNumber(row.querySelector('[data-rtarget]')?.value, { min: 1, max: maxV, fallback: NaN, integer: true });
  if (!Number.isFinite(target)) return null;
  return { cat, target, days };
}

/** Paint per-category inputs inside a designer row. */
function paintRuleFields(row, preset = {}) {
  const cat = row.querySelector('[data-rcat]')?.value || 'water';
  const box = row.querySelector('[data-rfields]');
  if (!box) return;
  const num = (key, ph, val, max, extra = '') => `<input type="number" data-r${key} placeholder="${ph}" min="1" max="${max}" value="${val ?? ''}" style="flex:1;min-width:80px" ${extra}>`;
  if (cat === 'workout') {
    box.innerHTML = `<input type="text" data-rex placeholder="Exercise (e.g. squat)" maxlength="40" value="${escapeHtml(preset.exercise || '')}" style="flex:2;min-width:110px">`
      + `<input type="number" data-rsets placeholder="Sets" min="0" max="100" value="${preset.sets || ''}" style="flex:1;min-width:70px">`
      + `<input type="number" data-rreps placeholder="Reps" min="0" max="5000" value="${preset.reps || ''}" style="flex:1;min-width:70px">`
      + num('days', 'Days in a row', preset.days || 5, 90);
  } else if (cat === 'streak') {
    box.innerHTML = num('target', 'Streak length (days)', preset.target || 7, 365);
  } else if (cat === 'screentime') {
    box.innerHTML = num('target', 'Max min/day', preset.target || 120, 1440) + num('days', 'Days', preset.days || 5, 90);
  } else {
    const ph = cat === 'water' ? 'ml per day' : cat === 'study' || cat === 'zen' ? 'Minutes per day' : 'Count per day';
    box.innerHTML = num('target', ph, preset.target || '', 100000) + num('days', 'Days in a row', preset.days || 5, 90);
  }
}

/** One-line rule summary for mission lists. */
function ruleSummary(m) {
  const rules = m.rules || [];
  if (!rules.length) return '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">Manual mission</div>';
  return `<div style="font-size:11px;color:var(--info);margin-top:2px">Auto: ${rules.map((r) => {
    const cat = r.cat || ({ water_ml: 'water', habits: 'habits', study_min: 'study', steps: 'steps', squats: 'workout' }[r.metric] || r.metric || '?');
    if (cat === 'workout') return escapeHtml([(r.exercise || (r.metric === 'squats' ? 'squat' : null) || 'Workout'), r.sets ? `${r.sets}×sets` : '', (r.reps || (r.metric === 'squats' ? r.target : '')) ? `${r.reps || r.target} reps` : ''].filter(Boolean).join(' ') + ` × ${r.days || 1}d`);
    if (cat === 'streak') return `Streak ${r.target}d`;
    const unit = cat === 'water' ? 'ml' : (cat === 'study' || cat === 'zen' || cat === 'screentime') ? 'min' : '';
    return escapeHtml(`${cat} ≥ ${r.target}${unit} × ${r.days || 1}d`);
  }).join(' + ')}</div>`;
}

/* ── Broadcast notifications ── */
function cleanImageUrl(v) {
  const u = sanitizeText(v, 500).trim();
  if (!u) return '';
  if (/^(https:\/\/|data:image\/|blob:)[^\s"'<>]*$/.test(u)) return u;
  return '';
}
function renderBroadcast(body) {
  const inbox = (S.inbox || []).slice().reverse().slice(0, 10);
  body.innerHTML = `<div class="card mb12"><div class="section-title">Design message</div>
    <input type="text" id="ad-ntitle" placeholder="Title" maxlength="60">
    <textarea id="ad-nbody" placeholder="Message…" maxlength="300" class="mt8"></textarea>
    <input type="text" id="ad-ntarget" placeholder="To: blank = broadcast to all, or name" maxlength="40" class="mt8">
    <div class="grid2 gap8 mt8">
      <label style="font-size:12px">Background<select id="ad-nbg">
        <option value="none">Default card</option><option value="sunset">Sunset</option><option value="ocean">Ocean</option><option value="forest">Forest</option><option value="royal">Royal</option><option value="ember">Ember</option><option value="midnight">Midnight</option>
      </select></label>
      <label style="font-size:12px">Highlight<select id="ad-nhl">
        <option value="none">None</option><option value="primary">Purple</option><option value="success">Green</option><option value="warning">Gold</option><option value="danger">Red</option><option value="info">Blue</option>
      </select></label>
    </div>
    <input type="text" id="ad-nimg" placeholder="Image URL (https://…) — optional" maxlength="500" class="mt8">
    <div class="flex gap8 mt8"><button class="btn btn-sm" id="ad-nimg-add">Add image</button></div>
    <div id="ad-nimgs" class="mt8" style="display:flex;flex-direction:column;gap:6px"></div>
    <label class="flex-between mt8" style="font-size:13px">Confetti shower on open
      <span style="position:relative;display:inline-block;width:42px;height:24px;flex-shrink:0">
      <input type="checkbox" id="ad-nconf" style="opacity:0;width:0;height:0">
      <span id="ad-nconf-track" style="position:absolute;top:0;left:0;right:0;bottom:0;background:var(--bg-overlay);border-radius:24px;border:1px solid var(--border-strong);transition:.3s">
      <span id="ad-nconf-knob" style="position:absolute;height:18px;width:18px;left:3px;bottom:2px;background:#fff;border-radius:50%;transition:.3s"></span></span></span></label>
    <div id="ad-npreview" class="mt8"></div>
    <div class="flex gap8 mt8">
      <button class="btn btn-primary btn-sm" id="ad-nsend">Send to inbox (this device)</button>
      <button class="btn btn-sm" id="ad-nglobal">Publish globally</button>
      <button class="btn btn-sm btn-ghost" id="ad-npush">Send + push now</button>
    </div></div>
  <div class="section-title">Inbox history (this device)</div>
  ${inbox.map((m, ix) => `<div class="insight"><div class="flex-between"><div><strong>${escapeHtml(m.title)}</strong><br>${escapeHtml(m.body)}<br><span style="font-size:10px;color:var(--text-muted)">${escapeHtml(m.date || '')}</span></div><button class="btn btn-icon btn-sm" data-hdel="${ix}" style="color:var(--danger);flex-shrink:0" title="Delete">×</button></div></div>`).join('') || '<div class="card">Empty.</div>'}
  <div class="flex gap8 mt8"><button class="btn btn-sm btn-danger" id="ad-nclear">Clear inbox</button></div>
  <div class="section-title mt12">Global outbox (all devices)</div>
  <div id="ad-goutbox"><div style="font-size:12px;color:var(--text-muted)">Loading…</div></div>`;
  const nimgs = [];
  const paintImgs = () => {
    const box = body.querySelector('#ad-nimgs');
    if (!box) return;
    box.innerHTML = nimgs.map((u, i) => `<div class="flex-between" style="font-size:11px;gap:6px">
      <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1">[img:${i + 1}] ${escapeHtml(u.slice(0, 60))}</span>
      <span style="display:flex;gap:4px;flex-shrink:0"><button class="btn btn-sm" data-nins="${i}">Insert</button><button class="btn btn-sm btn-ghost" data-nrm="${i}">✕</button></span></div>`).join('')
      || '<div style="font-size:11px;color:var(--text-muted)">No images — Add one, then Insert places [img:N] in the text.</div>';
    box.querySelectorAll('[data-nins]').forEach((b) => {
      b.onclick = () => {
        const ta = body.querySelector('#ad-nbody');
        ta.value = `${ta.value}${ta.value && !ta.value.endsWith(' ') ? ' ' : ''}[img:${Number(b.dataset.nins) + 1}] `;
        paintPreview();
        ta.focus();
      };
    });
    box.querySelectorAll('[data-nrm]').forEach((b) => {
      b.onclick = () => { nimgs.splice(Number(b.dataset.nrm), 1); paintImgs(); paintPreview(); };
    });
  };
  body.querySelector('#ad-nimg-add').onclick = () => {
    const u = cleanImageUrl(body.querySelector('#ad-nimg').value);
    if (!u) { showNotif('Paste a full https:// image URL first', '!'); return; }
    if (nimgs.length >= 5) { showNotif('Max 5 images per message', '!'); return; }
    nimgs.push(u);
    body.querySelector('#ad-nimg').value = '';
    paintImgs(); paintPreview();
  };
  paintImgs();
  const collect = () => ({
    title: sanitizeText(body.querySelector('#ad-ntitle').value, 60) || 'ZenFit',
    body: sanitizeText(body.querySelector('#ad-nbody').value, 300) || '',
    bg: ['sunset', 'ocean', 'forest', 'royal', 'ember', 'midnight'].includes(body.querySelector('#ad-nbg').value) ? body.querySelector('#ad-nbg').value : 'none',
    hl: ['primary', 'success', 'warning', 'danger', 'info'].includes(body.querySelector('#ad-nhl').value) ? body.querySelector('#ad-nhl').value : 'none',
    image: nimgs[0] || '',
    images: [...nimgs],
    confetti: !!body.querySelector('#ad-nconf').checked,
  });
  const paintPreview = () => {
    const d = collect();
    const box = body.querySelector('#ad-npreview');
    if (!box) return;
    box.innerHTML = `<div class="card-sm" style="${d.bg !== 'none' && MSG_BGS[d.bg] ? `background:${MSG_BGS[d.bg]};color:#fff;` : ''}${d.hl !== 'none' ? `border-color:var(--${d.hl});` : ''}">`
      + `<div style="font-size:12px;font-weight:700">${escapeHtml(d.title) || 'Title'}${d.confetti ? ' 🎉' : ''}</div>`
      + `<div style="font-size:11px;opacity:.85">${escapeHtml(d.body).slice(0, 80) || 'Preview…'}</div></div>`;
  };
  ['#ad-ntitle', '#ad-nbody', '#ad-nbg', '#ad-nhl'].forEach((sel) => { body.querySelector(sel).oninput = paintPreview; });
  body.querySelector('#ad-nconf').onchange = (e) => {
    const on = e.target.checked;
    body.querySelector('#ad-nconf-track').style.background = on ? 'var(--primary-dark)' : 'var(--bg-overlay)';
    body.querySelector('#ad-nconf-knob').style.left = on ? '20px' : '3px';
    paintPreview();
  };
  paintPreview();
  body.querySelector('#ad-nsend').onclick = () => {
    const m = collect();
    if (!m.body) { showNotif('Message required', '!'); return; }
    update((s) => { s.inbox = [...(s.inbox || []), { ...m, date: getTodayStr(), ts: Date.now() }]; s.inboxUnread = (s.inboxUnread || 0) + 1; });
    showNotif('Broadcast sent (this device)', 'OK');
  };
  body.querySelector('#ad-nglobal').onclick = async () => {
    const m = collect();
    if (!m.body) { showNotif('Message required', '!'); return; }
    const target = sanitizeText(body.querySelector('#ad-ntarget').value, 40) || 'all';
    showNotif(target === 'all' ? 'Broadcasting globally…' : `Sending to ${target}…`, 'OK');
    const { GlobalBoard } = await import('../core/cloud.js');
    const ok = await GlobalBoard.publish('global_broadcasts', { title: m.title, body: m.body, target, bg: m.bg, hl: m.hl, image: m.image, images: m.images, confetti: m.confetti });
    showNotif(ok ? (target === 'all' ? 'Broadcast live globally — users get it in Inbox' : `Message queued for ${target}`) : 'Publish failed — check Supabase config (Content tab)', ok ? 'OK' : '!');
  };
  body.querySelector('#ad-npush').onclick = () => {
    const m = collect();
    body.querySelector('#ad-nsend').click();
    if (navigator.serviceWorker?.controller) navigator.serviceWorker.controller.postMessage({ type: 'SHOW_NOTIFICATION', payload: { title: m.title, body: m.body } });
    else if ('Notification' in window && Notification.permission === 'granted') new Notification(m.title, { body: m.body });
    else if ('Notification' in window) Notification.requestPermission();
  };
  body.querySelector('#ad-nclear').onclick = () => update((s) => { s.inbox = []; });
  body.querySelectorAll('[data-hdel]').forEach((b) => {
    b.onclick = () => update((s) => { s.inbox = (s.inbox || []).filter((_, ix) => ix !== Number(b.dataset.hdel)); });
  });
  loadGlobalOutbox(body);
}

async function loadGlobalOutbox(body) {
  const box = body.querySelector('#ad-goutbox');
  if (!box) return;
  try {
    const { GlobalBoard } = await import('../core/cloud.js');
    const [casts, evts, rewards] = await Promise.all([GlobalBoard.fetchBroadcasts(), GlobalBoard.fetchEvents(), GlobalBoard.fetchRewards()]);
    const rows = [
      ...(casts || []).slice(0, 10).map((r) => ({ table: 'global_broadcasts', id: r.id, title: r.title || 'Broadcast', sub: (r.body || '').slice(0, 80) })),
      ...(evts || []).slice(0, 10).map((r) => ({ table: 'global_events', id: r.id, title: r.title || 'Mission', sub: (r.descr || r.desc || '').slice(0, 80) })),
      ...((rewards || []).slice(0, 10).map((r) => ({ table: 'global_rewards', id: r.id, title: r.title || 'Reward', sub: `${Number(r.xp) < 0 ? '' : '+'}${r.xp || 0} XP${r.code ? ' · ' + r.code : ''}` }))),
    ];
    box.innerHTML = rows.length ? rows.map((r) => `<div class="flex-between mb8"><div style="min-width:0"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.title)}</div>
      <div style="font-size:11px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.sub)}</div></div>
      <button class="btn btn-sm btn-danger" data-gdel-table="${r.table}" data-gdel-id="${escapeHtml(r.id || '')}">Delete</button></div>`).join('')
      : '<div style="font-size:12px;color:var(--text-muted)">Nothing published yet.</div>';
    try {
      const { sbDel } = await import('../core/cloud.js');
      box.querySelectorAll('[data-gdel-id]').forEach((b) => {
        b.onclick = async () => {
          b.disabled = true;
          const ok = await sbDel(b.dataset.gdelTable, b.dataset.gdelId);
          showNotif(ok ? 'Deleted globally' : 'Delete failed', ok ? 'OK' : '!');
          if (ok) window.ZF.rerender();
          else b.disabled = false;
        };
      });
    } catch {}
  } catch { box.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">Offline.</div>'; }
}

/* ── Content: wallpapers, themes, cloud stub ── */
function renderContent(body) {
  const cfg = (() => { try { return JSON.parse(localStorage.getItem('zf_supabase') || '{}'); } catch { return {}; } })();
  body.innerHTML = `<div class="card mb12"><div class="section-title">Wallpapers (bundled + uploaded)</div>
    <div style="font-size:12px;color:var(--text-muted)">Add via Themes tab → Wallpaper studio, or drop a URL here:</div>
    <div class="flex gap8 mt8"><input type="text" id="ad-wpurl" placeholder="https://…/image.jpg" maxlength="500">
    <button class="btn btn-sm btn-primary" id="ad-wpadd">Add</button></div>
    <div id="ad-wplist" class="mt8" style="display:flex;flex-direction:column;gap:6px"></div>
    <div style="font-size:12px" class="mt8">${(S.bgImages || []).length} uploaded · presets ship in assets/bg/</div></div>
  <div class="card mb12"><div class="section-title">Deployed assets (all devices, admin only)</div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Wallpapers + themes shipped globally. Removing deletes them for everyone.</div>
    <div id="ad-assets"><div style="font-size:12px;color:var(--text-muted)">Loading…</div></div></div>
  <div class="card mb12"><div class="section-title">Theme studio (same builder as Themes tab)</div>
    <div class="section-title mt8">Built-in</div>
    <div class="grid2 gap8" id="ad-theme-grid"></div>
    <div class="section-title mt12">Custom</div>
    <div id="ad-theme-mine" style="display:grid;grid-template-columns:1fr 1fr;gap:8px"></div>
    <div class="section-title mt12">Creator</div>
    <div class="theme-preview active" id="adth-live"><div class="tp-bar" id="adth-live-bar">
      <div class="tp-dot" id="adth-live-dot"></div><div style="font-size:12px" id="adth-live-name">Preview</div></div>
      <div class="tp-body" id="adth-live-body"><div class="tp-chip"></div><div class="tp-chip"></div><div class="tp-chip"></div></div></div>
    <div class="grid2 gap8 mt8">
      <label style="font-size:12px">Name<input type="text" id="adth-name" placeholder="Theme name" maxlength="30"></label>
      <label style="font-size:12px">Template<select id="adth-tpl"></select></label>
      <label style="font-size:12px">Wallpaper<select id="adth-wp"><option value="">— keep current —</option></select></label>
      <label style="font-size:12px">Particles<select id="adth-fx"><option value="">— keep current —</option><option value="dust">✨ Constellation</option><option value="snow">❄️ Snow</option><option value="sparks">🔥 Sparks</option><option value="firefly">✨ Firefly</option><option value="matrix">🌧️ Matrix Rain</option><option value="cyber">⚡ Cyber Spark</option></select></label>
    </div>
    <div class="section-title mt12">Surfaces</div><div id="adth-surfaces" style="display:flex;flex-direction:column;gap:8px"></div>
    <div class="section-title mt12">Text</div><div id="adth-texts" style="display:flex;flex-direction:column;gap:8px"></div>
    <div class="section-title mt12">Accent & glow</div><div id="adth-accents" style="display:flex;flex-direction:column;gap:8px"></div>
    <div class="grid2 gap8 mt8">
      <label style="font-size:12px">Particle hue (0–360)<input type="number" id="adth-phue" min="0" max="360" value="250"></label>
      <label style="font-size:12px">Particle speed (0.2–3)<input type="number" id="adth-pspeed" min="0.2" max="3" step="0.1" value="1"></label>
      <label style="font-size:12px">Particle count<select id="adth-pcount"><option value="">— theme default —</option><option value="30">Calm (30)</option><option value="80">Normal (80)</option><option value="150">Dense (150)</option></select></label>
      <label style="font-size:12px">Wallpaper fit<select id="adth-pfit"><option value="">— keep current —</option><option value="cover">Cover</option><option value="contain">Contain</option><option value="fill">Fill</option></select></label>
      <label style="font-size:12px">Glass blur (0–30px)<input type="number" id="adth-blur" min="0" max="30" value="4"></label>
      <label style="font-size:12px">Card opacity (10–95%)<input type="number" id="adth-alpha" min="10" max="95" value="55"></label>
    </div>
    <div class="flex gap8 mt8">
      <button class="btn btn-primary btn-sm" id="adth-save">Save Custom Theme</button>
      <button class="btn btn-sm" id="adth-ship">Ship globally</button>
      <button class="btn btn-sm btn-ghost" id="adth-try">Try live</button>
    </div></div>
  <div class="card"><div class="section-title">Cloud sync (optional, Supabase)</div>
    <div style="font-size:12px;color:var(--text-muted)" class="mb8">Local-first always works. Fill these to enable future multi-device sync — nothing breaks if empty.</div>
    <input type="text" id="ad-surl" placeholder="Supabase URL" value="${escapeHtml(cfg.url || '')}">
    <input type="text" id="ad-skey" placeholder="Anon key" value="${escapeHtml(cfg.key || '')}" class="mt8">
    <div class="flex gap8 mt8"><button class="btn btn-sm" id="ad-ssave">Save</button>
    <button class="btn btn-sm btn-ghost" id="ad-stest">Test connection</button></div>
    <div id="ad-sres" style="font-size:12px" class="mt8"></div></div>`;
  body.querySelector('#ad-wpadd').onclick = () => {
    const url = sanitizeText(body.querySelector('#ad-wpurl').value, 500);
    if (!/^https?:\/\//i.test(url)) { showNotif('Paste a full https:// URL', '!'); return; }
    update((s) => { s.bgImages = [...(s.bgImages || []), { id: uid('wp'), name: 'Remote', src: url }]; });
    showNotif('Wallpaper added', 'OK');
    paintWpList();
  };
  const paintWpList = () => {
    const box = body.querySelector('#ad-wplist');
    if (!box) return;
    const ups = (S.bgImages || []).map((w, ix) => ({ w, id: typeof w === 'string' ? w : (w.id || w.src), name: typeof w === 'string' ? w : (w.name || 'Upload'), src: typeof w === 'string' ? w : (w.src || w.id) }))
      .filter((x) => x.id && !String(x.id).startsWith('preset:'));
    box.innerHTML = ups.map((x, i) => `<div class="flex-between" style="font-size:12px;gap:6px">
      <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1">${escapeHtml(x.name)}<br><span style="font-size:10px;color:var(--text-muted)">on this device only</span></span>
      <span style="display:flex;gap:4px;flex-shrink:0"><button class="btn btn-sm" data-wpdeploy="${i}">Deploy</button><button class="btn btn-sm btn-ghost" data-wpdel="${i}">Remove</button></span></div>`).join('')
      || '<div style="font-size:11px;color:var(--text-muted)">No uploads yet.</div>';
    box.querySelectorAll('[data-wpdel]').forEach((b) => {
      b.onclick = async () => {
        const x = ups[Number(b.dataset.wpdel)];
        const removeLocal = () => {
          update((s) => { s.bgImages = (s.bgImages || []).filter((w) => (typeof w === 'string' ? w : (w.id || w.src)) !== x.id); });
          try { idbDeleteImage(x.id); } catch {}
          paintWpList();
        };
        let deployed = [];
        try {
          const { GlobalBoard } = await import('../core/cloud.js');
          deployed = ((await GlobalBoard.fetchAssets('wallpaper')) || []).filter((r) => r.url === x.src);
        } catch {}
        if (!deployed.length) { removeLocal(); showNotif('Wallpaper removed from this device', 'OK'); return; }
        openOverlay(`<div style="font-size:15px;font-weight:700;margin-bottom:4px">“${escapeHtml(x.name)}” is live on all devices</div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Remove it everywhere, or just from this device?</div>
          <div style="display:flex;gap:8px;justify-content:center">
          <button class="btn btn-sm btn-danger" id="wp-everywhere">Everywhere</button>
          <button class="btn btn-sm" id="wp-here">This device only</button></div>`);
        document.getElementById('wp-here').onclick = () => {
          document.getElementById('zf-overlay')?.remove();
          removeLocal();
          showNotif('Removed from this device (still live globally)', 'OK');
        };
        document.getElementById('wp-everywhere').onclick = async () => {
          const { sbDel } = await import('../core/cloud.js');
          let okAll = true;
          for (const r of deployed) { okAll = (await sbDel('global_assets', r.id)) && okAll; }
          document.getElementById('zf-overlay')?.remove();
          removeLocal();
          showNotif(okAll ? 'Removed from all devices' : 'Global delete failed', okAll ? 'OK' : '!');
          loadDeployedAssets();
        };
      };
    });
    box.querySelectorAll('[data-wpdeploy]').forEach((b) => {
      b.onclick = async () => {
        const x = ups[Number(b.dataset.wpdeploy)];
        b.disabled = true;
        const { GlobalBoard } = await import('../core/cloud.js');
        const existing = ((await GlobalBoard.fetchAssets('wallpaper')) || []).some((r) => r.url === x.src);
        if (existing) { showNotif('Already deployed — see list below', '!'); b.disabled = false; return; }
        const ok = await GlobalBoard.publishAsset('wallpaper', x.name, x.src);
        showNotif(ok ? `“${x.name}” live on all devices` : 'Deploy failed', ok ? 'OK' : '!');
        b.disabled = false;
        loadDeployedAssets();
      };
    });
  };
  paintWpList();
  async function loadDeployedAssets() {
    const box = body.querySelector('#ad-assets');
    if (!box) return;
    try {
      const { GlobalBoard } = await import('../core/cloud.js');
      const { sbDel } = await import('../core/cloud.js');
      const rows = await GlobalBoard.fetchAssets();
      box.innerHTML = rows.length ? rows.slice(0, 30).map((r) => `<div class="flex-between mb8" style="gap:6px">
        <div style="min-width:0"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.name || 'Asset')}</div>
        <div style="font-size:11px;color:var(--text-muted)">${escapeHtml(r.kind || '')}</div></div>
        <button class="btn btn-sm btn-danger" data-adel="${escapeHtml(r.id || '')}">Remove</button></div>`).join('')
        : '<div style="font-size:12px;color:var(--text-muted)">Nothing deployed yet.</div>';
      box.querySelectorAll('[data-adel]').forEach((b) => {
        b.onclick = async () => {
          b.disabled = true;
          const ok = await sbDel('global_assets', b.dataset.adel);
          showNotif(ok ? 'Removed from all devices' : 'Delete failed', ok ? 'OK' : '!');
          if (ok) loadDeployedAssets();
          else b.disabled = false;
        };
      });
    } catch { box.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">Offline.</div>'; }
  }
  loadDeployedAssets();
  wireThemeStudio(body);
  body.querySelector('#ad-ssave').onclick = () => {
    localStorage.setItem('zf_supabase', JSON.stringify({ url: sanitizeText(body.querySelector('#ad-surl').value, 200), key: sanitizeText(body.querySelector('#ad-skey').value, 500) }));
    showNotif('Cloud config saved', 'OK');
  };
  body.querySelector('#ad-stest').onclick = async () => {
    const res = body.querySelector('#ad-sres');
    const url = sanitizeText(body.querySelector('#ad-surl').value, 200);
    const key = sanitizeText(body.querySelector('#ad-skey').value, 500);
    if (!url || !key) { res.textContent = 'Enter URL + key first.'; return; }
    res.textContent = 'Testing…';
    try {
      const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/`, { headers: { apikey: key } });
      res.textContent = r.ok ? '✓ Reachable — tables can be added later.' : `HTTP ${r.status} — check URL/key.`;
    } catch { res.textContent = 'Unreachable — still fully usable offline.'; }
  };
}

/* ── Theme studio (same builder as Themes tab; themes stay local, no SQL) ── */
const ADTH_FIELDS = [
  { sec: 'surfaces', key: 'bgBase', label: 'Background' },
  { sec: 'surfaces', key: 'bgSurface', label: 'Surface' },
  { sec: 'surfaces', key: 'bgRaised', label: 'Raised' },
  { sec: 'surfaces', key: 'bgOverlay', label: 'Overlay' },
  { sec: 'surfaces', key: 'borderMid', label: 'Border' },
  { sec: 'surfaces', key: 'inputBg', label: 'Input bg' },
  { sec: 'texts', key: 'textPrimary', label: 'Text primary' },
  { sec: 'texts', key: 'textSecondary', label: 'Text secondary' },
  { sec: 'texts', key: 'textMuted', label: 'Text muted' },
  { sec: 'accents', key: 'primary', label: 'Primary' },
  { sec: 'accents', key: 'glow1', label: 'Glow 1' },
  { sec: 'accents', key: 'glow2', label: 'Glow 2' },
  { sec: 'accents', key: 'glow3', label: 'Glow 3' },
];

function wireThemeStudio(body) {
  const q = (sel) => body.querySelector(sel);
  const grid = q('#ad-theme-grid');
  if (grid) {
    grid.innerHTML = Object.entries(THEMES).map(([id, t]) => {
      const active = S.theme === id;
      return `<div class="theme-preview${active ? ' active' : ''}" data-adtheme="${id}" style="background:${t.bgSurface};padding:10px 12px;border-radius:10px;cursor:pointer">
        <div style="display:flex;gap:6px;margin-bottom:6px">
          <div style="width:14px;height:14px;border-radius:50%;background:${t.bgBase};border:1px solid var(--border-mid)"></div>
          <div style="width:14px;height:14px;border-radius:50%;background:${t.primary}"></div>
          <div style="width:14px;height:14px;border-radius:50%;background:${t.textMuted}"></div></div>
        <div style="font-size:12px;font-weight:600;color:${t.textPrimary}">${escapeHtml(t.name)}</div>
        ${active ? `<div style="font-size:10px;color:${t.primary};margin-top:2px">Active</div>` : ''}</div>`;
    }).join('');
    grid.querySelectorAll('[data-adtheme]').forEach((c) => {
      c.onclick = () => { applyTheme(c.dataset.adtheme); showNotif('Theme applied', 'OK'); };
    });
  }
  const mine = q('#ad-theme-mine');
  if (mine) {
    mine.innerHTML = getCustomThemes().map((t) => `
      <div style="position:relative;cursor:pointer;padding:10px 12px;border-radius:10px;border:2px solid ${S.theme === `custom:${t.id}` ? 'var(--primary)' : 'var(--border-mid)'};background:${t.bgSurface}" data-adctheme="${t.id}">
        <div style="display:flex;gap:6px;margin-bottom:6px">
          <div style="width:14px;height:14px;border-radius:50%;background:${t.bgBase}"></div>
          <div style="width:14px;height:14px;border-radius:50%;background:${t.primary}"></div>
          <div style="width:14px;height:14px;border-radius:50%;background:${t.textMuted}"></div></div>
        <div style="font-size:12px;font-weight:600;color:${t.textPrimary}">${escapeHtml(t.name)}</div>
        ${S.theme === `custom:${t.id}` ? `<div style="font-size:10px;color:${t.primary};margin-top:2px">Active</div>` : ''}</div>`).join('');
    mine.querySelectorAll('[data-adctheme]').forEach((c) => {
      c.onclick = () => { applyTheme(`custom:${c.dataset.adctheme}`); showNotif('Custom theme applied', 'OK'); };
    });
  }
  const tpl = q('#adth-tpl');
  if (!tpl) return;
  tpl.innerHTML = [...Object.entries(THEMES).map(([id, t]) => [`built:${id}`, t.name]), ...getCustomThemes().map((t) => [`custom:${t.id}`, `${t.name} (custom)`])]
    .map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join('');
  try {
    const imgs = [...PRESET_WALLPAPERS.map((p) => ({ name: p.name, src: `preset:${p.file}` })), ...(S.bgImages || []).map((w) => (typeof w === 'string' ? { name: w, src: w } : { name: w.name || 'Upload', src: w.src || w.id }))];
    q('#adth-wp').innerHTML = '<option value="">— keep current —</option>' + imgs.map((w) => `<option value="${escapeHtml(w.src)}">${escapeHtml(w.name)}</option>`).join('');
  } catch {}
  const groups = { surfaces: q('#adth-surfaces'), texts: q('#adth-texts'), accents: q('#adth-accents') };
  const val = (id) => q(`#adth-c-${id}`)?.value;
  for (const { sec, key, label } of ADTH_FIELDS) {
    const wrap = groups[sec];
    if (!wrap || wrap.querySelector(`#adth-c-${key}`)) continue;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px';
    row.innerHTML = `<span style="font-size:12px;min-width:110px">${label}</span>
      <input type="color" id="adth-c-${key}" value="#7b5eff" style="width:40px;height:32px;padding:2px;flex-shrink:0">
      <input type="text" id="adth-c-${key}-hex" maxlength="7" placeholder="#RRGGBB" style="flex:1;font-family:monospace">`;
    wrap.appendChild(row);
    const picker = row.querySelector(`#adth-c-${key}`);
    const hex = row.querySelector(`#adth-c-${key}-hex`);
    picker.oninput = () => { hex.value = picker.value; live(); };
    hex.oninput = () => { if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) { picker.value = hex.value; live(); } };
  }
  const live = () => {
    const [kind, key] = (tpl.value || 'built:midnight').split(':');
    const base = kind === 'custom'
      ? normalizeTheme(getCustomThemes().find((x) => x.id === key) || THEMES.midnight)
      : THEMES[key] || THEMES.midnight;
    const draft = { ...base, name: q('#adth-name').value || 'Preview', p_hue: q('#adth-phue')?.value || base.p_hue };
    for (const { key: k } of ADTH_FIELDS) { const v = val(k); if (v) draft[k] = v; }
    draft.particleSpeed = Math.min(3, Math.max(0.2, Number(q('#adth-pspeed')?.value) || 1));
    const pc = Number(q('#adth-pcount')?.value); if ([30, 80, 150].includes(pc)) draft.particleCount = pc;
    const pf = q('#adth-pfit')?.value; if (['cover', 'contain', 'fill'].includes(pf)) draft.bgFit = pf;
    draft.glassBlur = Math.min(30, Math.max(0, Number(q('#adth-blur')?.value ?? 4)));
    draft.glassAlpha = Math.min(0.95, Math.max(0.1, (Number(q('#adth-alpha')?.value ?? 55)) / 100));
    const box = q('#adth-live');
    if (box) {
      box.querySelector('#adth-live-bar').style.background = draft.bgSurface;
      box.querySelector('#adth-live-dot').style.background = draft.primary;
      box.querySelector('#adth-live-body').style.background = draft.bgBase;
      box.querySelector('#adth-live-name').textContent = draft.name;
      box.querySelector('#adth-live-name').style.color = draft.textPrimary;
    }
    return draft;
  };
  const sync = () => {
    const [kind, key] = (tpl.value || 'built:midnight').split(':');
    const base = kind === 'custom'
      ? normalizeTheme(getCustomThemes().find((x) => x.id === key) || THEMES.midnight)
      : THEMES[key] || THEMES.midnight;
    for (const { key: k } of ADTH_FIELDS) {
      const picker = q(`#adth-c-${k}`); const hex = q(`#adth-c-${k}-hex`);
      if (picker && base[k]) picker.value = base[k];
      if (hex && base[k]) hex.value = base[k];
    }
    if (q('#adth-phue')) q('#adth-phue').value = base.p_hue || 250;
    live();
  };
  q('#adth-name').oninput = live;
  tpl.onchange = sync;
  sync();
  const collectTheme = () => {
    const draft = live();
    const name = sanitizeText(q('#adth-name').value, 30);
    if (!name) { showNotif('Name your theme', '!'); return null; }
    const [kind, key] = (tpl.value || 'built:midnight').split(':');
    const base = kind === 'custom'
      ? normalizeTheme(getCustomThemes().find((x) => x.id === key) || THEMES.midnight)
      : { ...THEMES[key] };
    const t = { ...base, ...draft, id: `ct_${Date.now()}`, name };
    try {
      const wp = q('#adth-wp')?.value || '';
      const fx = q('#adth-fx')?.value || '';
      if (wp) { t.bgImage = wp; t.bgType = 'image'; }
      if (fx) { t.particleEffect = fx; t.p_hue = t.p_hue || draft.p_hue; }
    } catch {}
    return t;
  };
  q('#adth-save').onclick = () => {
    const t = collectTheme();
    if (!t) return;
    if (getCustomThemes().some((x) => x.name === t.name)) { showNotif(`"${t.name}" already exists`, '!'); return; }
    update((s) => { s.customThemes = [...(s.customThemes || []), t]; });
    showNotif(`Theme "${t.name}" created!`, 'OK');
    window.ZF.rerender();
  };
  q('#adth-ship').onclick = async () => {
    const t = collectTheme();
    if (!t) return;
    const btn = q('#adth-ship');
    btn.disabled = true;
    const { GlobalBoard } = await import('../core/cloud.js');
    const ok = await GlobalBoard.publishAsset('theme', t.name, '', t);
    showNotif(ok ? `“${t.name}” live on all devices` : 'Ship failed', ok ? 'OK' : '!');
    btn.disabled = false;
  };
  q('#adth-try').onclick = () => {
    applyThemeObject({ ...live(), name: 'Preview' }, S.theme);
    showNotif('Previewing — pick a theme to keep it', 'OK');
  };
}
