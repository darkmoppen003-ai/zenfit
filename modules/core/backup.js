/* ── ZenFit V2 · core/backup.js ────────────────────────────
   V1 data tools: Web Share API first (file → text), then
   clipboard, then direct download. Validated import + reset.
   Sanitizes everything coming in.
────────────────────────────────────────────────────────────── */
import { S, replaceState, defaultState, STORAGE_KEYS, clearAllLocal, idbPutImage, idbGetImage, APP_BUILD } from './store.js';
import { showNotif, openOverlay, closeOverlay } from './ui.js';
import { sanitizeText, escapeHtml } from './sanitize.js';
import { getTodayStr } from './utils.js';

/* ── ZIP primitives (V1 STORE-only, no compression) ── */
function crc32(u8) {
  if (!crc32.table) {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    crc32.table = t;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) crc = crc32.table[(crc ^ u8[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function makeZip(files) {
  const enc = new TextEncoder();
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    const nameB = enc.encode(name);
    const crc = crc32(bytes);
    const lh = new DataView(new ArrayBuffer(30 + nameB.length));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0, true);
    lh.setUint16(8, 0, true);
    lh.setUint16(10, 0, true);
    lh.setUint16(12, 0, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, bytes.length, true);
    lh.setUint32(22, bytes.length, true);
    lh.setUint16(26, nameB.length, true);
    lh.setUint16(28, 0, true);
    locals.push(new Uint8Array(lh.buffer), nameB, bytes);
    const ch = new DataView(new ArrayBuffer(46 + nameB.length));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, 0, true);
    ch.setUint16(14, 0, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, bytes.length, true);
    ch.setUint32(24, bytes.length, true);
    ch.setUint16(28, nameB.length, true);
    ch.setUint16(30, 0, true);
    ch.setUint16(32, 0, true);
    ch.setUint16(34, 0, true);
    ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true);
    ch.setUint32(42, offset, true);
    centrals.push(new Uint8Array(ch.buffer), nameB);
    offset += 30 + nameB.length + bytes.length;
  }
  const cdSize = centrals.reduce((a, b) => a + b.length, 0);
  const cdStart = offset;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, cdStart, true);
  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const total = parts.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  parts.forEach((p) => { out.set(p, o); o += p.length; });
  return out;
}
function parseZip(buf) {
  try {
    const u8 = new Uint8Array(buf);
    const dv = new DataView(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= 0; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return null;
    const count = dv.getUint16(eocd + 10, true);
    let cdOff = dv.getUint32(eocd + 16, true);
    const out = {};
    const dec = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(cdOff, true) !== 0x02014b50) break;
      const compSize = dv.getUint32(cdOff + 20, true);
      const nameLen = dv.getUint16(cdOff + 28, true);
      const extraLen = dv.getUint16(cdOff + 30, true);
      const commentLen = dv.getUint16(cdOff + 32, true);
      const lhOff = dv.getUint32(cdOff + 42, true);
      const name = dec.decode(u8.slice(cdOff + 46, cdOff + 46 + nameLen));
      const lhNameLen = dv.getUint16(lhOff + 26, true);
      const lhExtra = dv.getUint16(lhOff + 28, true);
      const dataStart = lhOff + 30 + lhNameLen + lhExtra;
      out[name] = u8.slice(dataStart, dataStart + compSize);
      cdOff += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  } catch { return null; }
}
function dataUriToBytes(uri) {
  const b64 = String(uri).slice(String(uri).indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
/** V1 exportData: share sheet → clipboard → download. Envelope {data, themes} for V1 parity. */
export function exportData() {
  const envelope = { data: S, themes: S.customThemes || [] };
  const json = JSON.stringify(envelope, null, 2);
  const filename = `zenfit_backup_${getTodayStr()}.json`;
  if (navigator.share) {
    try {
      const file = new File([json], filename, { type: 'application/json' });
      if (navigator.canShare?.({ files: [file] })) {
        navigator.share({ files: [file], title: 'ZenFit Backup', text: 'ZenFit data backup' })
          .then(() => showNotif('Backup shared!', 'OK'))
          .catch(() => exportViaText(json, filename));
        return;
      }
    } catch {}
    navigator.share({ title: `ZenFit Backup ${getTodayStr()}`, text: json })
      .then(() => showNotif('Data copied to share!', 'OK'))
      .catch(() => exportFallback(json, filename));
    return;
  }
  exportFallback(json, filename);
}

function exportViaText(json, filename) {
  if (navigator.share) {
    navigator.share({ title: 'ZenFit Backup', text: json })
      .then(() => showNotif('Data copied to share!', 'OK'))
      .catch(() => exportFallback(json, filename));
  } else exportFallback(json, filename);
}

function exportFallback(json, filename) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(json).then(() => {
      showNotif('Backup copied to clipboard!', 'OK');
    }).catch(() => exportDownload(json, filename));
    return;
  }
  exportDownload(json, filename);
}

export function exportDownload(json, filename) {
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename || 'zenfit_backup.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
    showNotif('Backup downloaded', 'OK');
  } catch { showNotif('Export failed', '!'); }
}

export function exportDataFile() { showExportOptions(); }

export function showExportOptions() {
  openOverlay(`<div style="font-size:15px;font-weight:700;margin-bottom:4px">Export backup</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">ZIP includes images + themes (recommended). JSON works everywhere.</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <button class="btn btn-primary" id="ex-zip">📦 Export .zip (recommended)</button>
      <button class="btn" id="ex-json">📄 Export .json</button>
      <button class="btn btn-ghost" id="ex-manual">📋 Copy / manual</button>
      <button class="btn btn-ghost" id="ex-x">Cancel</button></div>`);
  document.getElementById('ex-x').onclick = closeOverlay;
  document.getElementById('ex-json').onclick = () => { closeOverlay(); exportData(); };
  document.getElementById('ex-manual').onclick = () => { closeOverlay(); exportDataFileManual(); };
  document.getElementById('ex-zip').onclick = () => { closeOverlay(); exportDataZip(); };
}

export function exportDataFileManual() {
  const envelope = { data: S, themes: S.customThemes || [] };
  const json = JSON.stringify(envelope, null, 2);
  openOverlay(`<div style="font-size:15px;font-weight:700;margin-bottom:8px">Manual export</div>
    <textarea id="ex-text" style="width:100%;height:220px;font-family:monospace;font-size:11px">${escapeHtml(json)}</textarea>
    <div class="flex gap8 mt12" style="justify-content:center"><button class="btn btn-primary" id="ex-copy">Select all + copy</button>
    <button class="btn btn-ghost" id="ex-x2">Close</button></div>`);
  document.getElementById('ex-x2').onclick = closeOverlay;
  document.getElementById('ex-copy').onclick = () => {
    const ta = document.getElementById('ex-text');
    ta.select();
    try { document.execCommand('copy'); } catch {}
    try { navigator.clipboard?.writeText(json); } catch {}
    showNotif('Backup copied!', 'OK');
  };
}

export async function exportDataZip() {
  try {
    const files = {};
    files['data.json'] = JSON.stringify(S, null, 2);
    files['metadata.json'] = JSON.stringify({ exportDate: getTodayStr(), exportTs: Date.now(), build: APP_BUILD, playerName: S.player?.name, playerLevel: S.player?.level, playerRank: S.player?.rank }, null, 2);
    if (S.profilePic?.startsWith('data:')) {
      try { files['profile.png'] = dataUriToBytes(S.profilePic); } catch {}
    }
    if ((S.customThemes || []).length) files['themes.json'] = JSON.stringify(S.customThemes, null, 2);
    for (const w of (S.bgImages || [])) {
      const id = typeof w === 'string' ? w : (w.id || w.src);
      if (!id || String(id).startsWith('preset:')) continue;
      try {
        const blob = await idbGetImage(id);
        if (blob) files[`bg/${id}.png`] = new Uint8Array(await blob.arrayBuffer());
      } catch {}
    }
    const zip = makeZip(files);
    const blob = new Blob([zip], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `zenfit_backup_${getTodayStr()}.zip`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
    showNotif('ZIP backup downloaded', 'OK');
  } catch { exportData(); }
}

export function importData(file) {
  if (file?.name?.endsWith('.zip')) return importZipFile(file);
  const reader = new FileReader();
  reader.onload = () => {
    try {
      let data = JSON.parse(reader.result);
      // V1 envelope {data, themes} support
      let incomingThemes = null;
      if (data && data.data && (data.data.player || data.data.nutrition)) {
        incomingThemes = data.themes || null;
        data = data.data;
      }
      if (!data || typeof data !== 'object' || !data.player || !data.nutrition) throw new Error('Invalid backup');
      // Normalize V1 shapes: todos.tasks → tasks, zenSessions → zen.sessions
      if (Array.isArray(data.todos?.tasks) && !Array.isArray(data.tasks)) data.tasks = data.todos.tasks;
      if (Array.isArray(data.zenSessions) && (!data.zen?.sessions || !data.zen.sessions.length)) {
        data.zen = data.zen || {};
        data.zen.sessions = data.zenSessions;
      }
      const clean = scrubStrings(data);
      clean.deviceId = S.deviceId;
      clean.peerId = S.peerId;
      if (incomingThemes && !(S.customThemes || []).length) {
        try { clean.customThemes = incomingThemes; } catch {}
      }
      const merged = chronologicalMerge(S, clean);
      replaceState(merged);
      showNotif(`Data restored! Welcome back, ${S.player.name}!`, 'OK');
      setTimeout(() => location.reload(), 600);
    } catch (e) { showNotif(`Import failed: ${e.message}`, '!'); }
  };
  reader.readAsText(file);
}

export function importZipFile(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const zip = parseZip(reader.result);
      if (!zip || !zip['data.json']) throw new Error('ZIP missing data.json');
      const dec = new TextDecoder();
      let imported = JSON.parse(dec.decode(zip['data.json']));
      if (imported.data && imported.data.player) imported = imported.data;
      if (!imported.player || !imported.nutrition) throw new Error('Invalid backup');
      if (Array.isArray(imported.todos?.tasks) && !Array.isArray(imported.tasks)) imported.todos && (imported.tasks = imported.todos.tasks);
      // themes.json
      try {
        if (zip['themes.json']) {
          const ts = JSON.parse(dec.decode(zip['themes.json']));
          if (Array.isArray(ts)) {
            imported.customThemes = [...(imported.customThemes || []), ...ts.filter((t) => t?.name)];
          }
        }
      } catch {}
      // profile.png
      let picDataUrl = null;
      try {
        const pk = Object.keys(zip).find((k) => k === 'profile.png' || k === 'profile.jpg');
        if (pk) {
          const blob = new Blob([zip[pk]], { type: 'image/png' });
          picDataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
        }
      } catch {}
      // bg/*
      try {
        for (const k of Object.keys(zip)) {
          if (!k.startsWith('bg/')) continue;
          const id = k.slice(3).replace(/\.png$/, '');
          const blob = new Blob([zip[k]], { type: 'image/png' });
          await idbPutImage(id, blob);
          imported.bgImages = imported.bgImages || [];
          if (!imported.bgImages.some((w) => (typeof w === 'string' ? w : w.id) === id)) imported.bgImages.push({ id, name: id, ts: Date.now() });
        }
      } catch {}
      const clean = scrubStrings(imported);
      clean.deviceId = S.deviceId;
      clean.peerId = S.peerId;
      if (picDataUrl) clean.profilePic = picDataUrl;
      replaceState(chronologicalMerge(S, clean));
      showNotif('ZIP backup restored!', 'OK');
      setTimeout(() => location.reload(), 600);
    } catch (e) { showNotif(`Import failed: ${e.message}`, '!'); }
  };
  reader.readAsArrayBuffer(file);
}

/** V1 chronologicalMerge: player max-XP wins, profile overwrites, date-field union dedup. */
export function chronologicalMerge(cur, inc) {
  const out = { ...cur, ...inc };
  try {
    // Player: keep max XP/level
    if ((inc.player?.xp || 0) < (cur.player?.xp || 0)) out.player = { ...(inc.player || {}), ...(cur.player || {}) };
    const keyOf = (e) => (e.date || '') + '|' + (e.id || '') + '|' + (e.name || e.food || e.mood || e.activity || '');
    const union = (a = [], b = []) => {
      const seen = new Set(a.map(keyOf));
      const res = [...a];
      b.forEach((e) => { if (!seen.has(keyOf(e))) res.push(e); });
      return res;
    };
    out.nutrition = { ...(cur.nutrition || {}), ...(inc.nutrition || {}) };
    out.nutrition.entries = union(cur.nutrition?.entries || [], inc.nutrition?.entries || []);
    out.water = { ...(cur.water || {}), ...(inc.water || {}) };
    out.water.entries = union(cur.water?.entries || [], inc.water?.entries || []);
    out.workouts = union(cur.workouts || [], inc.workouts || []);
    out.burned = union(cur.burned || [], inc.burned || []);
    out.tasks = union(cur.tasks || [], inc.tasks || []);
    out.habits = union(cur.habits || [], inc.habits || []);
    out.weightLog = union(cur.weightLog || [], inc.weightLog || []);
    out.steps = union(cur.steps || [], inc.steps || []);
    if (cur.study?.sessions || inc.study?.sessions) {
      out.study = { ...(cur.study || {}), ...(inc.study || {}) };
      out.study.sessions = union(cur.study?.sessions || [], inc.study?.sessions || []);
    }
    const achUnion = [...(cur.achievements || [])];
    const achSeen = new Set(achUnion.map((a) => a.id || a));
    (inc.achievements || []).forEach((a) => { if (!achSeen.has(a.id || a)) achUnion.push(a); });
    out.achievements = achUnion;
    const cfUnion = [...(cur.customFoods || [])];
    const cfSeen = new Set(cfUnion.map((f) => (f.name || '').toLowerCase()));
    (inc.customFoods || []).forEach((f) => { if (!cfSeen.has((f.name || '').toLowerCase())) cfUnion.push(f); });
    out.customFoods = cfUnion;
  } catch { return { ...cur, ...inc }; }
  return out;
}

function scrubStrings(obj, depth = 0) {
  if (depth > 12) return obj;
  if (typeof obj === 'string') return sanitizeText(obj, 5000);
  if (Array.isArray(obj)) return obj.map((v) => scrubStrings(v, depth + 1));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[sanitizeText(k, 100)] = scrubStrings(v, depth + 1);
    return out;
  }
  return obj;
}

export function confirmReset() {
  openOverlay(`<h2 style="font-family:var(--font-display)">Reset all data?</h2>
    <p style="color:var(--text-secondary);font-size:13px">Export a backup first — this cannot be undone.</p>
    <div class="flex gap8 mt12" style="justify-content:center">
      <button class="btn btn-ghost" id="zx-cancel">Cancel</button>
      <button class="btn btn-danger" id="zx-reset">Reset</button>
    </div>`);
  document.getElementById('zx-cancel').onclick = closeOverlay;
  document.getElementById('zx-reset').onclick = () => {
    closeOverlay();
    showNotif('Wiping all local data…', '!');
    setTimeout(() => clearAllLocal(), 350);
  };
}
export { defaultState };
