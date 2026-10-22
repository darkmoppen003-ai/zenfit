/* ── ZenFit V2 · tests/hunters-code.test.mjs ────────────────
   Unit tests for the Hunter's Code acceptance gate + the rules
   copy contract (no tier table, no invented penalties).
   Run: node --test tests/hunters-code.test.mjs
   ────────────────────────────────────────────────────────────── */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateData, defaultState, DATA_VERSION } from '../modules/core/store.js';
import {
  HUNTER_CODE_VERSION, HUNTER_CODE_RULES, huntersCodeAccepted,
} from '../modules/features/hunters-code.js';

/* ── The gate ─────────────────────────────────────────────── */
test('a fresh state has not accepted the rules', () => {
  const s = defaultState();
  assert.equal(s.hunterCodeAccepted, false);
  assert.equal(s.hunterCodeVersion, 0);
  assert.equal(huntersCodeAccepted(s), false);
});

test('a legacy save without the marker is treated as "not accepted"', () => {
  assert.equal(huntersCodeAccepted({}), false);
  assert.equal(huntersCodeAccepted({ hunterCodeAccepted: false }), false);
  assert.equal(huntersCodeAccepted({ hunterCodeAccepted: true }), false);   // no version
  assert.equal(huntersCodeAccepted({ hunterCodeAccepted: true, hunterCodeVersion: 0 }), false);
});

test('the current revision counts as accepted', () => {
  assert.equal(huntersCodeAccepted({ hunterCodeAccepted: true, hunterCodeVersion: HUNTER_CODE_VERSION }), true);
});

test('a newer rules revision asks for acknowledgement again', () => {
  const old = { hunterCodeAccepted: true, hunterCodeVersion: HUNTER_CODE_VERSION - 1 };
  assert.equal(huntersCodeAccepted(old), false);
  const future = { hunterCodeAccepted: true, hunterCodeVersion: HUNTER_CODE_VERSION + 1 };
  assert.equal(huntersCodeAccepted(future), true);   // forward-compatible
});

/* ── Migration (v23 → v24) ───────────────────────────────── */
test('a v23 save is backfilled with the acceptance marker', () => {
  const saved = { ...defaultState(), dataVersion: 23 };
  delete saved.hunterCodeAccepted;
  delete saved.hunterCodeVersion;
  const out = migrateData(saved);
  assert.equal(out.dataVersion, DATA_VERSION);
  assert.equal(out.hunterCodeAccepted, false);
  assert.equal(out.hunterCodeVersion, 0);
  assert.equal(huntersCodeAccepted(out), false);
});

test('migration never rewrites an existing acceptance', () => {
  const saved = { ...defaultState(), dataVersion: 23, hunterCodeAccepted: true, hunterCodeVersion: HUNTER_CODE_VERSION };
  const out = migrateData(saved);
  assert.equal(out.hunterCodeAccepted, true);
  assert.equal(out.hunterCodeVersion, HUNTER_CODE_VERSION);
  assert.equal(huntersCodeAccepted(out), true);
});

/* ── Copy contract ───────────────────────────────────────── */
test('the screen carries exactly five numbered rules', () => {
  assert.equal(HUNTER_CODE_RULES.length, 5);
  assert.deepEqual(HUNTER_CODE_RULES.map((r) => r.n), ['01', '02', '03', '04', '05']);
  for (const r of HUNTER_CODE_RULES) {
    assert.ok(r.code && r.headline && r.body, `rule ${r.n} is complete`);
  }
});

test('no multiplier tier table or day ranges leak onto the welcome screen', () => {
  const all = HUNTER_CODE_RULES.map((r) => `${r.code} ${r.headline} ${r.body}`).join(' ');
  assert.ok(!/×1\.\d\d/.test(all), 'no multipliers');
  assert.ok(!/\b1[–-]2\b|\b3[–-]6\b|\b60\+/.test(all), 'no tier day ranges');
});

test('rule 01 states the real inactivity penalty', () => {
  const r = HUNTER_CODE_RULES[0];
  assert.match(r.body, /100 XP/);
  assert.match(r.body, /non-rest day/i);
  assert.match(r.body, /never a level/i);       // the deduction cannot de-level
  assert.ok(!/de-level|drop.*level/i.test(r.body));
});

test('rule 02 describes the real rest-day behaviour', () => {
  const r = HUNTER_CODE_RULES[1];
  assert.match(r.body, /Sundays/);
  assert.match(r.body, /rest days/i);
  assert.ok(!/skip/i.test(r.body), 'no new skip mechanic');
});

test('rule 03 points at the real boost location', () => {
  const r = HUNTER_CODE_RULES[2];
  assert.match(r.body, /Streak Boost/);
  assert.match(r.body, /Analytics/);
  assert.match(r.body, /Gamification/);
  assert.ok(!/skip day|new tier|multiplier of/i.test(r.body));
});

test('rules 04 and 05 invent no extra penalty', () => {
  const r4 = HUNTER_CODE_RULES[3];
  const r5 = HUNTER_CODE_RULES[4];
  assert.ok(!/XP/.test(r4.body), 'rule 04 mentions no XP');
  assert.ok(!/XP/.test(r5.body), 'rule 05 mentions no XP');
  assert.ok(!/delete|wipe|lose your data/i.test(r5.body), 'no data-loss promise');
});
