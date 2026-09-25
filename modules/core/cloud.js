/* ── ZenFit V2 · core/cloud.js ─────────────────────────────
   V1 Supabase global-leaderboard API, ported. Publishes the
   public card when opted in (profile must be filled), fetches
   the top board, removes on opt-out. Throttled background sync.
────────────────────────────────────────────────────────────── */
import { S, update } from './store.js';
import { rankForLevel } from './utils.js';
import { showNotif } from './ui.js';

const URL = 'https://oeytdfhwtxpwkzyaubad.supabase.co';
const KEY = 'sb_publishable_MitCTTt3KSLN8GvBqjRiRg_ONXQcpil';
const TABLE = 'global_leaderboard';

function hdr() {
  return {
    'Content-Type': 'application/json', apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    Prefer: 'resolution=merge-duplicates,return=minimal',
  };
}

function publicRow() {
  const topStreak = (S.habits || []).reduce((a, h) => Math.max(a, h.streak || 0), 0);
  return {
    device_id: S.deviceId || S.peerId || 'unknown',
    name: (S.profile?.name || S.player.name || 'Hunter'),
    level: S.player.level || 1,
    xp: S.player.xp || 0,
    rank: rankForLevel(S.player.level || 1),
    streak: topStreak,
    avatar_b64: S.profilePic || null,
    opted_in: !!S.globalLeaderboardOptIn,
    updated_at: new Date().toISOString(),
  };
}

export const LeaderboardAPI = {
  async sync() {
    try {
      const res = await fetch(`${URL}/rest/v1/${TABLE}`, {
        method: 'POST', headers: hdr(), body: JSON.stringify(publicRow()),
      });
      return res.ok || res.status === 201 || res.status === 200;
    } catch { return false; }
  },
  async optOut() {
    try {
      await fetch(`${URL}/rest/v1/${TABLE}?device_id=eq.${encodeURIComponent(S.deviceId || '')}`, {
        method: 'DELETE', headers: hdr(),
      });
    } catch {}
  },
  async fetch(limit = 50) {
    const res = await fetch(
      `${URL}/rest/v1/${TABLE}?select=name,level,xp,rank,streak&opted_in=eq.true&order=level.desc&limit=${limit}`,
      { headers: hdr() }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
};

export async function toggleGlobalOptIn(val) {
  update((s) => { s.globalLeaderboardOptIn = val; });
  if (val) {
    showNotif('Joining global leaderboard…', 'OK');
    const ok = await LeaderboardAPI.sync();
    if (ok) showNotif("You're on the global leaderboard!", 'OK');
    else {
      showNotif('Sync failed — check connection', '!');
      update((s) => { s.globalLeaderboardOptIn = false; });
    }
  } else {
    showNotif('Removing you from global leaderboard…', 'OK');
    await LeaderboardAPI.optOut();
    showNotif('Removed from global leaderboard', 'OK');
  }
  window.ZF.rerender();
}

/** Throttled background sync (V1: zf_last_global_sync). Called on XP gains. */
export function syncGlobalIfOptedIn() {
  if (!S.globalLeaderboardOptIn || !S.deviceId) return;
  try {
    const last = +localStorage.getItem('zf_last_global_sync') || 0;
    if (Date.now() - last < 3600000) return;
    localStorage.setItem('zf_last_global_sync', String(Date.now()));
  } catch {}
  LeaderboardAPI.sync();
}

/* ── Global admin board (phase 1: Supabase-backed broadcasts/events/rewards) ──
   Tables (run once in Supabase SQL editor):
     create table global_broadcasts (id uuid default gen_random_uuid() primary key, title text, body text, target text default 'all', created_at timestamptz default now());
     create table global_events (id uuid default gen_random_uuid() primary key, title text, descr text, xp int default 0, status text default 'live', target text default 'all', rules jsonb, created_at timestamptz default now());
     create table global_rewards (id uuid default gen_random_uuid() primary key, title text, xp int default 0, code text, target text default 'all', created_at timestamptz default now());
     alter table global_broadcasts enable row level security; alter table global_events enable row level security; alter table global_rewards enable row level security;
     create policy "public read" on global_broadcasts for select using (true);
     create policy "public read" on global_events for select using (true);
     create policy "public read" on global_rewards for select using (true);
   Config: Admin → Content stores custom URL/key in localStorage zf_supabase, else built-in leaderboard project is used.
────────────────────────────────────────────────────────────── */
function sbCfg() {
  try {
    const c = JSON.parse(localStorage.getItem('zf_supabase') || '{}');
    if (c.url && c.key) return { url: c.url.replace(/\/$/, ''), key: c.key };
  } catch {}
  return { url: URL, key: KEY };
}
function sbHdr() {
  const { key } = sbCfg();
  return { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
}
/** Owner delete for the admin outbox (requires the Anon-delete policies). */
export async function sbDel(table, id) {
  try {
    if (!/^[a-z_]+$/.test(table) || !id) return false;
    const { url } = sbCfg();
    const res = await fetch(`${url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: sbHdr() });
    return res.ok;
  } catch { return false; }
}

export const GlobalBoard = {
  async publish(table, row) {
    try {
      const { url } = sbCfg();
      const post = (body) => fetch(`${url}/rest/v1/${table}`, { method: 'POST', headers: { ...sbHdr(), Prefer: 'return=minimal' }, body: JSON.stringify(body) });
      let body = { ...row };
      let res = await post(body);
      for (const k of ['rules', 'target', 'bg', 'image', 'confetti']) {
        if (!res.ok && k in body) {
          delete body[k];
          res = await post(body);
        }
      }
      return res.ok;
    } catch { return false; }
  },
  async fetch(table, order = 'created_at.desc', limit = 20) {
    try {
      const { url } = sbCfg();
      const res = await fetch(`${url}/rest/v1/${table}?select=*&order=${order}&limit=${limit}`, { headers: sbHdr() });
      if (!res.ok) return [];
      return await res.json();
    } catch { return []; }
  },
  publishBroadcast: (title, body, target = 'all') => GlobalBoard.publish('global_broadcasts', { title, body, target }),
  publishEvent: (title, descr, xp = 0, target = 'all', rules = null) => GlobalBoard.publish('global_events', rules?.length ? { title, descr, xp, status: 'live', target, rules } : { title, descr, xp, status: 'live', target }),
  publishReward: (title, xp, code = '', target = 'all') => GlobalBoard.publish('global_rewards', { title, xp, code, target }),
  fetchBroadcasts: () => GlobalBoard.fetch('global_broadcasts'),
  fetchEvents: () => GlobalBoard.fetch('global_events'),
  fetchRewards: () => GlobalBoard.fetch('global_rewards'),
};
