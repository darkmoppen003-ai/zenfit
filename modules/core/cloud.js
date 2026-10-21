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
  /** Opt out: delete the row outright.
   *  Soft opt-out (flipping opted_in=false) is NOT possible here: an anon write may
   *  not transition a row from visible to invisible, because public_select is
   *  `USING (opted_in = true)` and the resulting row fails it (401 42501). Verified
   *  across both keys and every Prefer header, with maximally permissive write
   *  policies. Making SELECT `USING (true)` would work but would expose opted-out
   *  users' rows to anyone holding the anon key, so deletion is the safer trade. */
  async optOut() {
    try {
      await fetch(`${URL}/rest/v1/${TABLE}?device_id=eq.${encodeURIComponent(S.deviceId || '')}`, {
        method: 'DELETE', headers: hdr(),
      });
    } catch {}
  },
  async fetch(limit = 50) {
    const res = await fetch(
      `${URL}/rest/v1/${TABLE}?select=device_id,name,level,xp,rank,streak,avatar_b64&opted_in=eq.true&order=level.desc&limit=${limit}`,
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
   Tables (run once in Supabase SQL editor — see supabase/migrations/*.sql, run all in order):
     20260926000000_global_board.sql (base tables + read/insert)
     20260925000001_global_delete.sql (anon delete)
     20260926000002_broadcast_style.sql (bg/hl/image/confetti)
     20260926000003_event_image.sql (event image)
     20260926000004_broadcast_images.sql (images jsonb)
     20260926000005_global_assets.sql (global_assets table)
     20260927000000_global_update.sql (updated_at + anon update — required for edit)
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

/* ── Admin capability ──────────────────────────────────────────────────────────
   Reads stay public (the `Public read` policies). Writes to the four content
   tables are no longer granted to anon; they go through the SECURITY DEFINER
   function public.zf_admin_write(), which requires a shared admin token.

   The token is entered once per admin session (see setAdminToken) and held in
   memory only — never localStorage, so it cannot be read back out of the device
   and never ships in the bundle. It is NOT derivable from ADMIN_PASS_HASH: that
   hash is a shipped constant, so anything computed from it would be public too.
─────────────────────────────────────────────────────────────────────────────── */
let ADMIN_TOKEN = '';

/** Set the write token for this session. Empty string clears it. */
export function setAdminToken(t) { ADMIN_TOKEN = typeof t === 'string' ? t.trim() : ''; }
export function hasAdminToken() { return !!ADMIN_TOKEN; }

/** Every privileged write goes to the built-in project, never the zf_supabase
 *  override: that field is attacker-settable and would otherwise become a
 *  token-phishing primitive (point the app at a hostile DB, capture the token). */
async function zfWrite(table, op, rows = null, match = null) {
  try {
    if (!ADMIN_TOKEN) return false;
    const res = await fetch(`${URL}/rest/v1/rpc/zf_admin_write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ p_token: ADMIN_TOKEN, p_table: table, p_op: op, p_rows: rows, p_match: match }),
    });
    return res.ok;
  } catch { return false; }
}

/** Owner delete for the admin outbox (now token-gated server-side). */
export async function sbDel(table, id) {
  if (!/^[a-z_]+$/.test(table) || !id) return false;
  return zfWrite(table, 'delete', null, { id });
}
/** Owner edit for broadcasts/missions — updates by id server-side, which stamps updated_at so clients treat it as fresh unread. */
export async function sbUpdate(table, id, patch) {
  if (!/^[a-z_]+$/.test(table) || !id || !patch) return false;
  const body = { ...patch };
  for (const k of ['image', 'url', 'bgImage']) if (typeof body[k] === 'string' && body[k] && !body[k].startsWith('https://')) delete body[k];
  if (Array.isArray(body.images)) { body.images = body.images.filter((u) => typeof u === 'string' && u.startsWith('https://')); if (!body.images.length) delete body.images; }
  return zfWrite(table, 'update', body, { id });
}

export const GlobalBoard = {
  async publish(table, row) {
    try {
      if (!ADMIN_TOKEN) return false;
      const post = (body) => fetch(`${URL}/rest/v1/rpc/zf_admin_write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ p_token: ADMIN_TOKEN, p_table: table, p_op: 'insert', p_rows: body }),
      });
      let body = { ...row };
      // ponytail: remote-strict — global publish accepts https:// images only, drop anything else
      for (const k of ['image', 'url', 'bgImage']) if (typeof body[k] === 'string' && body[k] && !body[k].startsWith('https://')) delete body[k];
      if (Array.isArray(body.images)) { body.images = body.images.filter((u) => typeof u === 'string' && u.startsWith('https://')); if (!body.images.length) delete body.images; }
      let res = await post(body);
      // Legacy fallback: strip optional keys only when the server rejects them as
      // unknown columns (42703). Auth/allowlist errors must NOT be retried — they
      // would just repeat the same failure nine times.
      if (!res.ok) {
        const text = await res.clone().text().catch(() => '');
        if (/42703|column .* does not exist/i.test(text)) {
          for (const k of ['confetti', 'image', 'images', 'imgMeta', 'bg', 'bgImage', 'hl', 'rules', 'target']) {
            if (!res.ok && k in body) { delete body[k]; res = await post(body); }
          }
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
  publishEvent: (title, descr, xp = 0, target = 'all', rules = null, image = '', bgImage = '', imgMeta = null) => GlobalBoard.publish('global_events', rules?.length ? { title, descr, xp, status: 'live', target, rules, image, bgImage, imgMeta } : { title, descr, xp, status: 'live', target, image, bgImage, imgMeta }),
  publishReward: (title, xp, code = '', target = 'all') => GlobalBoard.publish('global_rewards', { title, xp, code, target }),
  publishAsset: (kind, name, url = '', data = null) => GlobalBoard.publish('global_assets', { kind, name, url, data }),
  fetchAssets: (kind = null) => GlobalBoard.fetch('global_assets').then((rows) => kind ? rows.filter((r) => r.kind === kind) : rows),
  fetchBroadcasts: () => GlobalBoard.fetch('global_broadcasts'),
  fetchEvents: () => GlobalBoard.fetch('global_events'),
  fetchRewards: () => GlobalBoard.fetch('global_rewards'),
};
