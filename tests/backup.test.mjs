/* ── ZenFit V2 · tests/backup.test.mjs ────────────────────────
   Unit tests for the import/export pipeline: the ZIP writer, the
   string scrubber, the restore merge, and the new install defaults.
   Run: node --test tests/backup.test.mjs
   ────────────────────────────────────────────────────────────── */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ── DOM shim ────────────────────────────────────────────────
   backup.js pulls in ui.js, which registers window listeners at
   import time. Node has no DOM, so stub the few globals it touches
   before the module graph is evaluated (dynamic import below). */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
const noop = () => {};
const fakeEl = () => ({
  style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  appendChild: noop, removeChild: noop, remove: noop, setAttribute: noop, getAttribute: () => null,
  addEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
  innerHTML: '', textContent: '', value: '',
});
globalThis.window = {
  addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop }),
  innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
};
globalThis.document = {
  addEventListener: noop, removeEventListener: noop,
  createElement: fakeEl, createElementNS: fakeEl,
  querySelector: () => null, querySelectorAll: () => [],
  getElementById: () => null, body: fakeEl(), documentElement: fakeEl(),
};

const { makeZip, parseZip, scrubStrings, chronologicalMerge } = await import('../modules/core/backup.js');
const { defaultState, migrateData, DATA_VERSION } = await import('../modules/core/store.js');
const { sanitizeText } = await import('../modules/core/sanitize.js');
const { PRESET_WALLPAPERS } = await import('../modules/core/themes.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dec = new TextDecoder();

/* ── ZIP ───────────────────────────────────────────────────── */
test('a zip backup round trips every entry byte-exact', () => {
  const files = {
    'data.json': JSON.stringify({ player: { xp: 42 }, nutrition: { entries: [] } }),
    'metadata.json': JSON.stringify({ exportDate: '2026-10-22', build: 'test' }),
    'profile.png': new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]),
    'bg/a-rather-long-wallpaper-file-name-0123456789.png': new Uint8Array([1, 2, 3, 4, 5]),
  };
  const zip = makeZip(files);
  const back = parseZip(zip.buffer);
  assert.ok(back, 'the zip parsed');
  assert.deepEqual(Object.keys(back).sort(), Object.keys(files).sort());
  assert.equal(dec.decode(back['data.json']), files['data.json']);
  assert.equal(dec.decode(back['metadata.json']), files['metadata.json']);
  assert.deepEqual([...back['profile.png']], [...files['profile.png']]);
  assert.deepEqual([...back['bg/a-rather-long-wallpaper-file-name-0123456789.png']], [1, 2, 3, 4, 5]);
});

test('the zip writes the file name inside the local header', () => {
  // Regression: the name used to be pushed as a separate chunk after the
  // header, so every section offset was short by the name length and no
  // standard reader (the app's own parseZip included) could find an entry.
  const zip = makeZip({ 'data.json': 'x' });
  assert.equal(dec.decode(new Uint8Array(zip.buffer, 30, 9)), 'data.json');
});

test('the zip central directory points at a real central header', () => {
  const zip = makeZip({ 'data.json': 'hello', 'metadata.json': 'world' });
  const dv = new DataView(zip.buffer);
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  assert.ok(eocd > 0, 'end of central directory found');
  const cdOff = dv.getUint32(eocd + 16, true);
  assert.equal(dv.getUint32(cdOff, true), 0x02014b50, 'central header signature');
  assert.equal(dv.getUint16(eocd + 10, true), 2, 'entry count');
  assert.equal(dv.getUint16(cdOff + 28, true), 9, 'name length in the central header');
});

/* ── Scrubbing ─────────────────────────────────────────────── */
test('a restore keeps an avatar data uri byte-exact', () => {
  // Regression: sanitising stripped the "data:" prefix and cut the base64
  // past 5000 chars, so every restored avatar was a broken image.
  const uri = 'data:image/png;base64,' + 'A'.repeat(20000);
  const out = scrubStrings({ profilePic: uri });
  assert.equal(out.profilePic, uri);
  assert.equal(out.profilePic.length, uri.length);
});

test('a restore keeps user text that only looks like markup', () => {
  const out = scrubStrings({ customFoods: [{ name: 'Onions = 5g' }], notes: 'data: rice' });
  assert.equal(out.customFoods[0].name, 'Onions = 5g');
  assert.equal(out.notes, 'rice', 'the data: protocol is still stripped');
});

test('a restore still strips script payloads', () => {
  const out = scrubStrings({ title: '<script>alert(1)</script>', body: '<img src=x onerror="alert(1)">' });
  assert.equal(out.title, '');
  assert.equal(out.body, '');
});

test('sanitizeText keeps plain text and still strips handlers', () => {
  assert.equal(sanitizeText('Onions = 5g'), 'Onions = 5g');
  assert.equal(sanitizeText('<img src=x onerror="alert(1)">'), '');
  assert.equal(sanitizeText('<svg onload="alert(1)">'), '');
  assert.equal(sanitizeText('javascript:alert(1)'), 'alert(1)');
  assert.equal(sanitizeText('data:text/html,<b>x</b>'), 'text/html,x');
  assert.ok(sanitizeText('data:image/png;base64,AAAA').startsWith('data:image/png;base64,'));
});

/* ── Restore merge ─────────────────────────────────────────── */
test('consent never travels across devices', () => {
  assert.equal(chronologicalMerge({ globalLeaderboardOptIn: false }, { globalLeaderboardOptIn: true }).globalLeaderboardOptIn, false);
  assert.equal(chronologicalMerge({ globalLeaderboardOptIn: true }, { globalLeaderboardOptIn: false }).globalLeaderboardOptIn, true);
});

test('claimed rewards survive a restore as a union', () => {
  const out = chronologicalMerge({ claimedRewards: ['a'] }, { claimedRewards: ['b'] });
  assert.deepEqual(out.claimedRewards.sort(), ['a', 'b']);
});

test('a restore unions log entries and keeps the higher xp', () => {
  const cur = {
    player: { xp: 100, level: 3 },
    nutrition: { entries: [{ date: '2026-10-20', name: 'Rice' }] },
    water: { entries: [] }, steps: [{ date: '2026-10-20', count: 100 }],
  };
  const inc = {
    player: { xp: 500, level: 4 },
    nutrition: { entries: [{ date: '2026-10-21', name: 'Beans' }] },
    water: { entries: [{ date: '2026-10-21', ml: 500 }] }, steps: [{ date: '2026-10-21', count: 200 }],
  };
  const out = chronologicalMerge(cur, inc);
  assert.equal(out.player.xp, 500);
  assert.equal(out.nutrition.entries.length, 2);
  assert.equal(out.water.entries.length, 1);
  assert.equal(out.steps.length, 2);
});

test('a restore keeps wallpapers this device uploaded', () => {
  const out = chronologicalMerge(
    { bgImages: [{ id: 'local_upload', name: 'Mine' }] },
    { bgImages: [{ id: 'from_backup', name: 'Theirs' }] },
  );
  assert.deepEqual(out.bgImages.map((w) => w.id), ['local_upload', 'from_backup']);
});

test('a restore merges custom themes by name and keeps the local one', () => {
  const out = chronologicalMerge(
    { customThemes: [{ name: 'Mine', primary: '#fff' }] },
    { customThemes: [{ name: 'Mine', primary: '#000' }, { name: 'Theirs' }] },
  );
  assert.deepEqual(out.customThemes.map((t) => t.name), ['Mine', 'Theirs']);
  assert.equal(out.customThemes[0].primary, '#fff');
});

test('an export survives a scrub and a restore', () => {
  const state = {
    ...defaultState(),
    player: { ...defaultState().player, xp: 120 },
    profilePic: 'data:image/png;base64,' + 'B'.repeat(9000),
    customFoods: [{ name: 'Onions = 5g', kcal: 10 }],
    steps: [{ date: '2026-10-20', count: 5000 }],
    claimedRewards: ['r1'],
    globalLeaderboardOptIn: true,
  };
  const envelope = JSON.parse(JSON.stringify({ data: state, themes: state.customThemes || [] }));
  const clean = scrubStrings(envelope.data);
  const merged = chronologicalMerge({ ...state, claimedRewards: [], globalLeaderboardOptIn: false }, clean);
  assert.equal(merged.profilePic, state.profilePic);
  assert.deepEqual(merged.customFoods.map((f) => f.name), ['Onions = 5g']);
  assert.equal(merged.steps.length, 1);
  assert.deepEqual(merged.claimedRewards, ['r1']);
  assert.equal(merged.globalLeaderboardOptIn, false, 'consent stays local');
});

/* ── New install defaults ──────────────────────────────────── */
test('a fresh install starts on the violet wallpaper with the flip and the lens', () => {
  const s = defaultState();
  assert.equal(s.bgType, 'image');
  assert.equal(s.bgImage, 'preset:violet evergarden.png');
  assert.equal(s.bgDim, 45);
  assert.equal(s.bgFlipH, true);
  assert.equal(s.bgFlipV, false);
  assert.equal(s.particlesEnabled, false);
  assert.equal(s.liquidLens, true);
});

test('the default wallpaper is a known preset that ships with the app', () => {
  const file = defaultState().bgImage.replace(/^preset:/, '');
  assert.ok(PRESET_WALLPAPERS.some((p) => p.file === file), 'the preset is registered');
  assert.ok(fs.existsSync(path.join(ROOT, 'assets', 'bg', file)), 'the asset file exists');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.ok(sw.includes(file), 'the wallpaper is precached for offline use');
});

test('a pre-v6 save keeps particles only if it opted in', () => {
  const legacy = { ...defaultState(), dataVersion: 5 };
  delete legacy.particlesEnabled;
  assert.equal(migrateData(legacy).particlesEnabled, false);
  assert.equal(migrateData({ ...defaultState(), dataVersion: 5, particlesEnabled: true }).particlesEnabled, true);
  assert.equal(migrateData({ ...defaultState(), dataVersion: DATA_VERSION }).particlesEnabled, false);
});
