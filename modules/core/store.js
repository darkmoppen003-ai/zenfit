/* ── ZenFit V2 · core/store.js ─────────────────────────────
   THE single source of truth. Owns:
     - default state shape (V1-compatible keys → seamless upgrade)
     - load / migrate / validate / persist (localStorage + IDB)
     - pub/sub so every screen re-renders from one flow
       ("data breathes": log weight once → visible everywhere)
   Rule: features NEVER touch localStorage directly — use
   getState() / update(fn) / save().
────────────────────────────────────────────────────────────── */
import { getTodayStr, getUserTimezone, xpForLevel, rankForLevel } from './utils.js';

/* ── Storage contract (FROZEN — V1 users upgrade in place) ── */
export const STORAGE_KEYS = {
  STATE: 'zenfit_v1',
  DEVICE_ID: 'zenfit_device_id',
  IMPORT_INPUT: 'zenfit_import_inp_static',
  CHAT_HISTORY: 'zenfit_chat_history_',
  THEMES: 'zenfit_themes_v1',
};
export const DATA_VERSION = 11;
export const APP_VERSION = "8.8";
export const APP_BUILD = "2026.09.26.18";

/* V1 SCHEMA (types) + V2 additions. Unknown keys are dropped on
   load/import — identical to V1 behavior. */
const SCHEMA = {
  player: 'object', profile: 'object', nutrition: 'object', water: 'object',
  study: 'object', zen: 'object', quests: 'object', bonusTasks: 'object',
  screenTime: 'object', partnerStats: 'object',
  workouts: 'array', burned: 'array', habits: 'array', tasks: 'array',
  workoutPlans: 'array', plans: 'array', mealPlans: 'array',
  partners: 'array', pendingRequests: 'array', sentRequests: 'array',
  profilePic: 'string', peerId: 'string', theme: 'string',
  screenTimeLimit: 'number', featureFlags: 'object',
  _analyticsPeriod: 'string', _analyticsSection: 'string',
  achievements: 'array', challenges: 'array', weightLog: 'array',
  questsDoneTotal: 'number', soundEnabled: 'boolean',
  notificationsEnabled: 'boolean', globalLeaderboardOptIn: 'boolean',
  customFoods: 'array', customBottomNav: 'array', restDays: 'array',
  mood: 'object', glassMode: 'boolean', glassBlur: 'number',
  glassAlpha: 'number', navOpacity: 'boolean', navLabels: 'boolean',
  bgType: 'string', bgImage: 'string', bgDim: 'number',
  particlesEnabled: 'boolean', particleCount: 'number',
  particleEffect: 'string', particleHue: 'number', particleSpeed: 'number', cyberDirection: 'string', sparkDirection: 'string',
  bgFit: 'string', bgPosX: 'number', bgPosY: 'number',
  bgOffX: 'number', bgOffY: 'number', bgZoom: 'number',
  accentColor: 'string', bgImages: 'array', bgAllScreens: 'boolean',
  bgScreen: 'string', collapsedSections: 'object',
  fullscreenAutoStart: 'boolean', steps: 'array', onboarding: 'object',
  // V2 additions
  inbox: 'array', events: 'array', adminRewards: 'array', claimedRewards: 'array', inboxUnread: 'number', inboxRead: 'array',
  customThemes: 'array', customDishes: 'array', notifSettings: 'object',
  navOpacityVal: 'number',
};

const DB_NAME = 'zenfit';
const DB_STORE = 'state';
const DB_VERSION = 2;

/* ── Default state (mirrors V1 shape — do not rename keys) ── */
export function defaultState() {
  return {
    dataVersion: DATA_VERSION,
    deviceId: getDeviceId(),
    player: {
      name: 'Hunter', level: 1, xp: 0, rank: 'E',
      weightKg: 70,
      stats: { strength: 10, discipline: 10, health: 10, endurance: 10, wisdom: 10 },
    },
    steps: [],
    profile: {
      filled: false, name: '', age: 0, gender: 'male',
      heightCm: 170, weightKg: 70, activityLevel: 'moderate',
      goal: 'maintain', waistCm: 0, hipCm: 0, country: '',
    },
    nutrition: { entries: [], dailyGoal: { cal: 2000, protein: 150, carbs: 250, fat: 65, fiber: 25, sugar: 25 } },
    water: { entries: [], dailyGoalMl: 3000 },
    workouts: [],
    burned: [],
    habits: [],
    tasks: [],
    study: { sessions: [], subjects: [] },
    workoutPlans: [],
    plans: [],
    mealPlans: [],
    quests: { date: '', list: [] },
    bonusTasks: { date: '', list: [] },
    theme: 'midnight',
    screenTime: {},
    screenTimeLimit: 120,
    partners: [],
    peerId: null,
    profilePic: null,
    pendingRequests: [],
    sentRequests: [],
    partnerStats: {},
    featureFlags: {},
    lastSaved: Date.now(),
    achievements: [],
    challenges: [],
    weightLog: [],
    questsDoneTotal: 0,
    soundEnabled: true,
    notificationsEnabled: true,
    globalLeaderboardOptIn: false,
    customFoods: [],
    customBottomNav: [],
    glassMode: true,
    glassBlur: 4,
    glassAlpha: 0.15,
    navOpacity: true,
    bgType: 'solid',
    bgImage: null,
    bgDim: 0,
    particlesEnabled: true,
    particleCount: 80,
    particleHue: 250,
    particleSpeed: 1,
    cyberDirection: 'straight',
    sparkDirection: 'straight',
    particleEffect: 'dust',
    bgFit: 'cover',
    bgPosX: 50,
    bgOffX: 0,
    bgPosY: 50,
    bgOffY: 0,
    bgZoom: 100,
    accentColor: '',
    bgImages: [],
    bgAllScreens: true,
    bgScreen: 'dashboard',
    fullscreenAutoStart: true,
    navLabels: true,
    zen: { totalSessions: 0, totalMinutes: 0, currentStreak: 0, bestStreak: 0, lastSessionDate: null, sessions: [], history: {} },
    mood: { entries: [] },
    restDays: [],
    onboarding: { completed: false },
    analyticsArchive: [],
    collapsedSections: {},
    // ── V2 additions (namespaced to avoid V1 collisions) ──
    inbox: [],            // admin → user messages / notifications
    inboxUnread: 0,       // unread inbox count (red dot, cleared on open)
    inboxRead: [],        // read local message ids (unread highlight)
    events: [],           // admin-created events / missions
    adminRewards: [],     // history of granted rewards
    claimedRewards: [],   // global reward IDs already claimed (no double-XP)
    adminPin: null,       // hashed-lite PIN for admin console
    customThemes: [],     // user-created themes (besides THEMES key)
    _analyticsSection: 'overview',
  };
}

/* ── Device ID (stable per browser, V1 fingerprint format) ── */
function generateDeviceFingerprint() {
  const data = `${navigator.userAgent}${navigator.language}${screen.width}x${screen.height}${new Date().getTimezoneOffset()}`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).slice(0, 8);
}
export function getDeviceId() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
    if (stored && stored.startsWith('zenfit-user-')) return stored;
    const id = `zenfit-user-${generateDeviceFingerprint()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(STORAGE_KEYS.DEVICE_ID, id);
    return id;
  } catch {
    return `zenfit-user-${Date.now().toString(36)}`;
  }
}

/* ── Migration: V1 step chain v1→v11 (verbatim behavior) ── */
export function migrateData(saved) {
  if (!saved || typeof saved !== 'object') return defaultState();
  const version = saved.dataVersion || 1;
  if (version < 2) {
    saved.onboarding = saved.onboarding || { completed: false };
    saved.dataVersion = 2;
  }
  if (version < 3) {
    if (!saved.profile) saved.profile = {};
    delete saved.profile.region;
    if (saved.profile.country === undefined) saved.profile.country = '';
    saved.dataVersion = 3;
  }
  if (version < 4) {
    saved.restDays = saved.restDays || [];
    saved.dataVersion = 4;
  }
  if (version < 5) {
    if (!saved.steps) saved.steps = [];
    saved.dataVersion = 5;
  }
  if (version < 6) {
    saved.bgType = saved.bgType || 'solid';
    saved.bgImage = saved.bgImage || null;
    saved.bgDim = saved.bgDim || 0;
    saved.particlesEnabled = saved.particlesEnabled !== false;
    saved.particleCount = saved.particleCount || 80;
    saved.accentColor = saved.accentColor || '';
    saved.bgImages = Array.isArray(saved.bgImages) ? saved.bgImages : [];
    saved.bgAllScreens = saved.bgAllScreens !== false;
    saved.dataVersion = 6;
  }
  if (version < 7) {
    if (saved.bgType === 'animated' || saved.bgType === 'gradient') saved.bgType = 'solid';
    saved.particleEffect = saved.particleEffect || 'dust';
    saved.bgFit = saved.bgFit || 'cover';
    saved.bgPosX = typeof saved.bgPosX === 'number' ? saved.bgPosX : 50;
    saved.bgPosY = typeof saved.bgPosY === 'number' ? saved.bgPosY : 50;
    saved.bgZoom = typeof saved.bgZoom === 'number' ? saved.bgZoom : 100;
    saved.dataVersion = 7;
  }
  if (version < 8) {
    saved.navOpacity = saved.navOpacity !== false;
    saved.dataVersion = 8;
  }
  if (version < 9) {
    if (typeof saved.fullscreenMode === 'boolean') saved.fullscreenAutoStart = saved.fullscreenMode;
    delete saved.fullscreenMode;
    saved.dataVersion = 9;
  }
  if (version < 10) {
    if (saved.bgType === 'animated') saved.bgType = 'solid';
    saved.dataVersion = 10;
  }
  if (version < 11) {
    if (saved.geminiApiKey !== undefined) delete saved.geminiApiKey;
    saved.dataVersion = 11;
  }
  // V2: offset model replaces positional model (migrated lazily too)
  if (saved.bgOffX == null && typeof saved.bgPosX === 'number') {
    saved.bgOffX = Math.round((saved.bgPosX - 50) * 2);
    saved.bgOffY = Math.round(((saved.bgPosY ?? 50) - 50) * 2);
  }
  return saved;
}

export function validateAndMergeData(saved, fresh) {
  const merged = { ...fresh };
  if (!saved) return merged;
  for (const key of Object.keys(saved)) {
    if (!Object.prototype.hasOwnProperty.call(SCHEMA, key)) continue;
    const t = SCHEMA[key];
    if (t === 'array') merged[key] = Array.isArray(saved[key]) ? saved[key] : [];
    else if (t === 'object') merged[key] = { ...((fresh[key] && typeof fresh[key] === 'object' ? fresh[key] : {})), ...((saved[key] && typeof saved[key] === 'object' ? saved[key] : {})) };
    else merged[key] = saved[key];
  }
  for (const key of Object.keys(SCHEMA)) {
    if (!Object.prototype.hasOwnProperty.call(merged, key)) {
      if (SCHEMA[key] === 'array') merged[key] = [];
      else if (SCHEMA[key] === 'object') merged[key] = {};
    }
  }
  return merged;
}

/* ── IndexedDB fallback (large blobs: bg images, state mirror) ── */
function openDB() {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(DB_STORE)) r.result.createObjectStore(DB_STORE);
        if (!r.result.objectStoreNames.contains('zenfit-bg-images')) r.result.createObjectStore('zenfit-bg-images');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
export function idbSave(key, val) {
  return openDB().then((db) => new Promise((res, rej) => {
    const t = db.transaction(DB_STORE, 'readwrite');
    t.objectStore(DB_STORE).put(val, key);
    t.oncomplete = () => { db.close(); res(); };
    t.onerror = () => { db.close(); rej(t.error); };
  })).catch(() => {});
}
export function idbLoad(key) {
  return openDB().then((db) => new Promise((res, rej) => {
    const t = db.transaction(DB_STORE, 'readonly');
    const g = t.objectStore(DB_STORE).get(key);
    g.onsuccess = () => { db.close(); res(g.result); };
    g.onerror = () => { db.close(); rej(g.error); };
  })).catch(() => null);
}

/* ── Wallpaper blobs in IndexedDB (V1 pattern — keeps state small) ── */
function idbImageTx(mode, fn) {
  return openDB().then((db) => new Promise((res, rej) => {
    try {
      const t = db.transaction('zenfit-bg-images', mode);
      const st = t.objectStore('zenfit-bg-images');
      const out = fn(st);
      t.oncomplete = () => { db.close(); res(out?.result); };
      t.onerror = () => { db.close(); rej(t.error); };
    } catch (e) { try { db.close(); } catch {} rej(e); }
  }));
}
export function idbPutImage(id, blob) {
  return idbImageTx('readwrite', (st) => st.put(blob, id)).catch(() => {});
}
export function idbGetImage(id) {
  return idbImageTx('readonly', (st) => st.get(id)).catch(() => null);
}
export function idbDeleteImage(id) {
  return openDB().then((db) => new Promise((res) => {
    try {
      const t = db.transaction('zenfit-bg-images', 'readwrite');
      t.objectStore('zenfit-bg-images').delete(id);
      t.oncomplete = () => { db.close(); res(); };
      t.onerror = () => { db.close(); res(); };
    } catch { try { db.close(); } catch {} res(); }
  })).catch(() => {});
}
const objectUrlCache = {};
/** Resolve stored wallpaper refs → usable URLs (preset:, idb:, data:, http). */
export async function resolveBgSrc(src) {
  if (!src) return '';
  if (src.startsWith('preset:')) return `./assets/bg/${src.slice(7)}`;
  if (/^(data:|blob:|https?:)/i.test(src)) return src;
  if (objectUrlCache[src]) return objectUrlCache[src];
  try {
    const blob = await idbGetImage(src);
    if (blob) {
      const url = URL.createObjectURL(blob);
      objectUrlCache[src] = url;
      return url;
    }
  } catch {}
  return '';
}

/* ── Load ── */
export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.STATE);
    if (raw) {
      const saved = migrateData(JSON.parse(raw));
      return validateAndMergeData(saved, defaultState());
    }
  } catch (e) { console.warn('[ZenFit] loadState error:', e); }
  return defaultState();
}

/* ── Live singleton + pub/sub ── */
export let S = loadState();

// IDB mirror fills in if localStorage was empty (fresh-user guard)
try {
  idbLoad(STORAGE_KEYS.STATE).then((idbData) => {
    if (idbData && S && !localStorage.getItem(STORAGE_KEYS.STATE)) {
      const saved = migrateData(idbData);
      Object.assign(S, validateAndMergeData(saved, defaultState()));
      notify('hydrated');
    }
  });
} catch { /* IDB unavailable — localStorage remains authoritative */ }

const listeners = new Set();
/** Subscribe to state changes. Returns unsubscribe fn. */
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notify(reason) { listeners.forEach((fn) => { try { fn(S, reason); } catch (e) { console.warn(e); } }); }

/* Trim >14d granular entries into per-day archive (V1 behavior) */
function trimOldData() {
  const KEEP_DAYS = 14;
  const cutoff = new Date(); cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  const cs = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
  if (!S.analyticsArchive) S.analyticsArchive = [];
  const archiveAndTrim = (entries, dateFn, valueFns) => {
    const old = entries.filter((e) => (dateFn(e) || '') < cs);
    if (!old.length) return entries;
    const byDay = {};
    old.forEach((e) => {
      const d = dateFn(e) || ''; if (!d) return;
      if (!byDay[d]) byDay[d] = { date: d, cal: 0, burned: 0, waterMl: 0, studyMins: 0 };
      for (const [k, fn] of Object.entries(valueFns)) byDay[d][k] += fn(e) || 0;
    });
    Object.values(byDay).forEach((day) => {
      const i = S.analyticsArchive.findIndex((a) => a.date === day.date);
      if (i >= 0) {
        for (const k of ['cal', 'burned', 'waterMl', 'studyMins']) S.analyticsArchive[i][k] += day[k];
      } else S.analyticsArchive.push(day);
    });
    return entries.filter((e) => (dateFn(e) || '') >= cs);
  };
  try {
    S.nutrition.entries = archiveAndTrim(S.nutrition.entries, (e) => e.date, { cal: (e) => e.nutrients?.cal ?? e.cal ?? 0 });
    S.water.entries = archiveAndTrim(S.water.entries, (e) => e.date, { waterMl: (e) => e.ml || 0 });
    S.burned = archiveAndTrim(S.burned, (e) => e.date, { burned: (e) => e.calories ?? e.cal ?? 0 });
    S.workouts = archiveAndTrim(S.workouts || [], (e) => e.date, { burned: (e) => e.caloriesBurned ?? e.calories ?? 0 });
    (S.study?.sessions || []).length && (S.study.sessions = archiveAndTrim(S.study.sessions, (e) => e.date, { studyMins: (e) => e.duration || 0 }));
    (S.habits || []).forEach((h) => {
      const dates = h.completedDates || h.doneDates || [];
      if (dates.length > 90) {
        const keep = dates.slice(-90);
        h.completedDates = keep; delete h.doneDates;
      }
    });
  } catch { /* never break save on trim */ }
}

/* ── Persist (debounced) ── */
let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      S.lastSaved = Date.now();
      trimOldData();
      localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(S));
      idbSave(STORAGE_KEYS.STATE, JSON.parse(JSON.stringify(S)));
    } catch (e) { console.warn('[ZenFit] save error:', e); }
  }, 250);
}
/** Synchronous write-through (page hide/close) — never debounced. */
export function flushSave() {
  try {
    clearTimeout(saveTimer);
    S.lastSaved = Date.now();
    try { trimOldData(); } catch {}
    localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(S));
    idbSave(STORAGE_KEYS.STATE, JSON.parse(JSON.stringify(S)));
  } catch (e) { console.warn('[ZenFit] save error:', e); }
}
/** Wipe ALL local data (reset flow): localStorage + IndexedDB. */
export function clearAllLocal() {
  const dev = (() => { try { return localStorage.getItem(STORAGE_KEYS.DEVICE_ID); } catch { return null; } })();
  try { localStorage.clear(); } catch {}
  if (dev) { try { localStorage.setItem(STORAGE_KEYS.DEVICE_ID, dev); } catch {} }
  try {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => location.reload();
    req.onerror = () => location.reload();
    setTimeout(() => location.reload(), 1500);
  } catch {
    location.reload();
  }
}

/**
 * Mutate state + persist + notify all screens.
 * Usage: update(s => { s.water.entries.push(e); });
 * options: { silent } skips re-render (batch writes).
 */
export function update(fn, options = {}) {
  fn(S);
  save();
  if (!options.silent) notify('update');
  return S;
}

/** Replace singleton (import/restore path). */
export function replaceState(next) {
  S = validateAndMergeData(migrateData(next), defaultState());
  try { localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(S)); } catch {}
  idbSave(STORAGE_KEYS.STATE, JSON.parse(JSON.stringify(S)));
  notify('replace');
}

/* ── Gamification primitives (shared — V1 curve preserved) ── */
export function addXP(amount, reason = '') {
  const before = S.player.level;
  S.player.xp += amount;
  let leveled = false;
  while (S.player.xp >= xpForLevel(S.player.level)) {
    S.player.xp -= xpForLevel(S.player.level);
    S.player.level += 1;
    leveled = true;
  }
  S.player.rank = rankForLevel(S.player.level);
  save(); notify('xp');
  return { leveled, from: before, to: S.player.level, reason };
}

export { getTodayStr, getUserTimezone };

/* V1 deductXP: never below 0 (used when un-checking habits, deleting done tasks) */
export function deductXP(amount, reason = '') {
  S.player.xp = Math.max(0, S.player.xp - amount);
  save(); notify('xp');
  return { reason };
}

/* V1 updStat: bump a player stat, capped at 100 */
export function updStat(stat, amt = 1) {
  S.player.stats = S.player.stats || {};
  S.player.stats[stat] = Math.min(100, (S.player.stats[stat] ?? 10) + amt);
  save();
}
