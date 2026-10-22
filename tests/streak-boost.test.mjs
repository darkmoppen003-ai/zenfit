/* ── ZenFit V2 · tests/streak-boost.test.mjs ─────────────────
   Unit tests for the account-wide streak boost (core/streak-boost.js).
   Run: node --test tests/streak-boost.test.mjs
   ────────────────────────────────────────────────────────────── */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOST_ACTS, BOOST_TIERS, activityDoneOn, restDayOn, boostScopeOf,
  boostStreakDays, boostMultiplierFor, boostedAmount, splitBoostXp,
} from '../modules/core/streak-boost.js';

/* Fixture anchor — a Thursday. 2026-10-18 / 2026-10-25 are Sundays. */
const T = '2026-10-22';

/* ── ORACLE ──────────────────────────────────────────────────
   The pre-move implementation from features/analytics.js. The
   shared predicate must behave identically for the Activity
   Streaks card — the analytics refactor is a pure move. */
function hDates(h) { return h.completedDates || h.doneDates || []; }
function legacyStreakDayDone(S, act, ds) {
  if (act === 'habits') return (S.habits || []).some((h) => hDates(h).includes(ds));
  if (act === 'tasks') return (S.tasks || []).some((t) => t.completedDate === ds);
  if (act === 'water') return (S.water.entries || []).filter((e) => e.date === ds).reduce((a, e) => a + (e.ml || 0), 0) >= (S.water.dailyGoalMl || 3000);
  if (act === 'workout') return (S.workouts || []).some((w) => w.date === ds);
  if (act === 'mind') return (S.zen?.sessions || []).some((z) => z.date === ds) || (S.mood?.entries || []).some((e) => e.date === ds);
  if (act === 'study') return (S.study?.sessions || []).some((s) => s.date === ds);
  if (act === 'nutrition') return (S.nutrition?.entries || []).some((e) => e.date === ds);
  return false;
}

function fixture() {
  return {
    habits: [
      { id: 'h1', completedDates: ['2026-10-19', '2026-10-20'] },
      { id: 'h2', doneDates: ['2026-10-21'] },            // legacy shape
      { id: 'h3', completedDates: [] },
    ],
    tasks: [{ id: 't1', completedDate: '2026-10-20' }, { id: 't2', completedDate: '2026-10-22' }],
    water: {
      dailyGoalMl: 3000,
      entries: [
        { ml: 1500, date: '2026-10-19' },
        { ml: 3000, date: '2026-10-20' },
        { ml: 2000, date: '2026-10-21' },
      ],
    },
    workouts: [{ date: '2026-10-21', name: 'Run' }],
    zen: { sessions: [{ date: '2026-10-20', minutes: 10 }] },
    mood: { entries: [{ date: '2026-10-21', mood: 'good' }] },
    study: { sessions: [{ date: '2026-10-22', duration: 30 }] },
    nutrition: { entries: [{ date: '2026-10-19', name: 'Oats' }] },
    restDays: [],
  };
}

function stateWith(days, extra = {}) {
  return { habits: days.map((d) => ({ id: 'h' + d, completedDates: [d] })), ...extra };
}

/* ── ORACLE EQUIVALENCE ── */
test('oracle: the shared predicate matches the pre-move analytics implementation', () => {
  const S = fixture();
  const dates = ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-25'];
  for (const a of BOOST_ACTS) {
    for (const ds of dates) {
      assert.equal(activityDoneOn(S, a.id, ds), legacyStreakDayDone(S, a.id, ds), `${a.id} ${ds}`);
    }
  }
});

test('oracle: the seven tracked activities are unchanged', () => {
  assert.deepEqual(BOOST_ACTS.map((a) => a.id), ['habits', 'tasks', 'water', 'workout', 'mind', 'study', 'nutrition']);
});

test('oracle: a missing water bucket no longer throws', () => {
  const S = { ...fixture(), water: undefined };
  assert.equal(activityDoneOn(S, 'water', '2026-10-20'), false);
});

/* ── MULTIPLIER ── */
test('tiers: the multiplier ladder boundaries', () => {
  assert.equal(boostMultiplierFor(0), 1);
  assert.equal(boostMultiplierFor(1), 1.00);
  assert.equal(boostMultiplierFor(2), 1.00);
  assert.equal(boostMultiplierFor(3), 1.05);
  assert.equal(boostMultiplierFor(6), 1.05);
  assert.equal(boostMultiplierFor(7), 1.10);
  assert.equal(boostMultiplierFor(13), 1.10);
  assert.equal(boostMultiplierFor(14), 1.20);
  assert.equal(boostMultiplierFor(29), 1.20);
  assert.equal(boostMultiplierFor(30), 1.30);
  assert.equal(boostMultiplierFor(59), 1.30);
  assert.equal(boostMultiplierFor(60), 1.40);
  assert.equal(boostMultiplierFor(600), 1.40);
  assert.deepEqual(BOOST_TIERS.map((t) => t.mult), [1, 1.05, 1.1, 1.2, 1.3, 1.4]);
});

test('boostedAmount: ×1.00 is byte-identical to the unboosted path', () => {
  assert.equal(boostedAmount(42, 1), 42);
  assert.equal(boostedAmount(37.5, 1), 37.5);   // fractional XP survives untouched
  assert.equal(boostedAmount(0, 1.4), 0);
  assert.equal(boostedAmount(-5, 1.4), 0);
});

test('boostedAmount: one rounding at the choke point', () => {
  assert.equal(boostedAmount(42, 1.05), 44);      // 44.1
  assert.equal(boostedAmount(50, 1.05), 53);      // 52.5
  assert.equal(boostedAmount(30, 1.10), 33);      // 33.000000000000004
  assert.equal(boostedAmount(90, 1.05), 95);      // 94.5 (3 meals)
  assert.equal(boostedAmount(30, 1.00), 30);
});

/* ── SCOPE ── */
test('scope: an empty scope means OFF (never "all")', () => {
  assert.deepEqual(boostScopeOf({}), []);
  assert.deepEqual(boostScopeOf({ boostScope: [] }), []);
  assert.deepEqual(boostScopeOf({ boostScope: 'habits' }), []);
  assert.deepEqual(boostScopeOf({ boostScope: ['habits', 'bogus'] }), ['habits']);
  assert.deepEqual(boostScopeOf({ boostScope: ['habits', 'tasks'] }), ['habits', 'tasks']);
});

/* ── REST DAYS ── */
test('restDayOn: Sunday is always a rest day, plus the claimed ones', () => {
  const s = { restDays: ['2026-10-21'] };
  assert.equal(restDayOn(s, '2026-10-18'), true);
  assert.equal(restDayOn(s, '2026-10-25'), true);
  assert.equal(restDayOn(s, '2026-10-21'), true);
  assert.equal(restDayOn(s, '2026-10-22'), false);
  assert.equal(restDayOn({}, '2026-10-22'), false);
});

/* ── STREAK ── */
test('streak: consecutive qualifying days count', () => {
  const s = stateWith(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']);
  assert.equal(boostStreakDays(s, ['habits'], '', T), 4);
});

test('streak: today not logged yet keeps yesterday\'s run alive', () => {
  const s = stateWith(['2026-10-19', '2026-10-20', '2026-10-21']);
  assert.equal(boostStreakDays(s, ['habits'], '', T), 3);
});

test('streak: ANY selected activity qualifies (not every one)', () => {
  const s = {
    habits: [{ completedDates: ['2026-10-22'] }],
    tasks: [{ completedDate: '2026-10-21' }],
  };
  assert.equal(boostStreakDays(s, ['habits', 'tasks'], '', T), 2);
  assert.equal(boostStreakDays(s, ['habits'], '', T), 1);
});

test('streak: a missed non-rest day breaks the run', () => {
  const s = stateWith(['2026-10-19', '2026-10-20', '2026-10-22']);   // 2026-10-21 missed
  assert.equal(boostStreakDays(s, ['habits'], '', T), 1);
});

test('streak: a rest day pauses the run (skipped, never counted, never a break)', () => {
  const s = stateWith(['2026-10-17', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']);
  assert.equal(boostStreakDays(s, ['habits'], '', T), 5);   // 2026-10-18 is a Sunday
});

test('streak: a claimed rest day pauses the run', () => {
  const s = stateWith(['2026-10-19', '2026-10-20', '2026-10-22'], { restDays: ['2026-10-21'] });
  assert.equal(boostStreakDays(s, ['habits'], '', T), 3);
});

test('streak: an activity on a rest day still counts', () => {
  const s = stateWith(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'], { restDays: ['2026-10-21'] });
  assert.equal(boostStreakDays(s, ['habits'], '', T), 4);
});

test('streak: the scope-change anchor excludes earlier days', () => {
  const s = stateWith(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']);
  assert.equal(boostStreakDays(s, ['habits'], '', T), 4);
  assert.equal(boostStreakDays(s, ['habits'], '2026-10-20', T), 3);
  assert.equal(boostStreakDays(s, ['habits'], '2026-10-22', T), 1);
  assert.equal(boostStreakDays(s, ['habits'], '2026-10-23', T), 0);
});

test('streak: an empty scope is OFF', () => {
  const s = stateWith(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']);
  assert.equal(boostStreakDays(s, [], '', T), 0);
});

/* ── DUPLICATE-DATE BEHAVIOUR ─────────────────────────────────
   The boost streak counts CALENDAR DAYS: a date qualifies or it
   does not. Several records on one date (several habits, several
   glasses, several meals, several categories) must never lengthen
   the streak nor advance the multiplier tier.
   2026-10-18 and 2026-10-25 are Sundays. */
test('duplicates: one qualifying activity on a date counts as one streak day', () => {
  const s = { habits: [{ id: 'h1', completedDates: ['2026-10-22'] }] };
  assert.equal(boostStreakDays(s, ['habits'], '', T), 1);
});

test('duplicates: several entries of the SAME category on one date count as one day', () => {
  const s = {
    habits: [
      { id: 'h1', completedDates: ['2026-10-22'] },
      { id: 'h2', completedDates: ['2026-10-22'] },        // another habit, same date
      { id: 'h3', completedDates: ['2026-10-22'] },
    ],
    water: {
      dailyGoalMl: 3000,
      entries: [                                          // three glasses, one date
        { ml: 1000, date: '2026-10-22' }, { ml: 1000, date: '2026-10-22' }, { ml: 1200, date: '2026-10-22' },
      ],
    },
  };
  assert.equal(boostStreakDays(s, ['habits'], '', T), 1);
  assert.equal(boostStreakDays(s, ['water'], '', T), 1);    // goal crossed once
});

test('duplicates: entries from several selected categories on one date count as one day', () => {
  const s = {
    habits: [{ id: 'h1', completedDates: ['2026-10-22'] }],
    tasks: [{ id: 't1', completedDate: '2026-10-22' }],
    study: { sessions: [{ subject: 'Math', date: '2026-10-22' }] },
    workouts: [{ name: 'Run', date: '2026-10-22' }],
    zen: { sessions: [{ date: '2026-10-22', minutes: 5 }] },
  };
  assert.equal(boostStreakDays(s, ['habits', 'tasks', 'study', 'workout', 'mind'], '', T), 1);
});

test('duplicates: extra entries on an already qualifying date do not lengthen the streak', () => {
  const plain = { habits: [{ id: 'h1', completedDates: ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'] }] };
  assert.equal(boostStreakDays(plain, ['habits'], '', T), 4);
  const noisier = {
    habits: [
      { id: 'h1', completedDates: ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'] },
      { id: 'h2', completedDates: ['2026-10-22'] },                 // same date again
    ],
    tasks: [{ id: 't1', completedDate: '2026-10-22' }, { id: 't2', completedDate: '2026-10-22' }],
    water: { dailyGoalMl: 3000, entries: [{ ml: 3000, date: '2026-10-22' }, { ml: 500, date: '2026-10-22' }] },
  };
  assert.equal(boostStreakDays(noisier, ['habits', 'tasks', 'water'], '', T), 4);
});

test('duplicates: extra entries do not advance the multiplier tier', () => {
  const two = { habits: [{ id: 'h1', completedDates: ['2026-10-21', '2026-10-22'] }] };
  assert.equal(boostStreakDays(two, ['habits'], '', T), 2);
  assert.equal(boostMultiplierFor(boostStreakDays(two, ['habits'], '', T)), 1.00);
  const twoNoisy = {
    habits: [
      { id: 'h1', completedDates: ['2026-10-21', '2026-10-22'] },
      { id: 'h2', completedDates: ['2026-10-21', '2026-10-22'] },
    ],
    tasks: [{ id: 't1', completedDate: '2026-10-21' }, { id: 't2', completedDate: '2026-10-22' }],
  };
  assert.equal(boostStreakDays(twoNoisy, ['habits', 'tasks'], '', T), 2);
  assert.equal(boostMultiplierFor(boostStreakDays(twoNoisy, ['habits', 'tasks'], '', T)), 1.00);
  // the ×1.00 → ×1.05 boundary: two days stay ×1.00 no matter how many records they carry
  const three = { habits: [{ id: 'h1', completedDates: ['2026-10-20', '2026-10-21', '2026-10-22'] }] };
  assert.equal(boostMultiplierFor(boostStreakDays(three, ['habits'], '', T)), 1.05);
});

test('duplicates: consecutive qualifying dates give the expected length and multiplier', () => {
  const days = ['2026-10-16', '2026-10-17', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'];  // 10-18 = Sunday
  const one = { habits: days.map((d) => ({ id: 'h' + d, completedDates: [d] })) };
  const two = { habits: days.flatMap((d) => [{ id: 'a' + d, completedDates: [d] }, { id: 'b' + d, completedDates: [d] }]) };
  assert.equal(boostStreakDays(one, ['habits'], '', T), 6);
  assert.equal(boostStreakDays(two, ['habits'], '', T), 6);   // duplicates → same length
  assert.equal(boostMultiplierFor(boostStreakDays(one, ['habits'], '', T)), 1.05);
  assert.equal(boostMultiplierFor(boostStreakDays(two, ['habits'], '', T)), 1.05);
});

test('duplicates: rest days keep their behaviour (an activity counts, an empty rest day pauses)', () => {
  // Sunday 2026-10-18 WITH a qualifying activity → it counts as a streak day
  const withAct = { habits: [{ id: 'h1', completedDates: ['2026-10-17', '2026-10-18', '2026-10-19'] }] };
  assert.equal(boostStreakDays(withAct, ['habits'], '', '2026-10-19'), 3);
  // Sunday 2026-10-18 WITHOUT one → paused: not counted, and not a break either
  const without = { habits: [{ id: 'h1', completedDates: ['2026-10-17', '2026-10-19'] }] };
  assert.equal(boostStreakDays(without, ['habits'], '', '2026-10-19'), 2);
});

test('duplicates: re-logging on an already qualifying date does not bridge a missed day', () => {
  // 2026-10-21 was missed (not a rest day) → the run stops there
  const s = {
    habits: [{ id: 'h1', completedDates: ['2026-10-20', '2026-10-22'] }],
    tasks: [{ id: 't1', completedDate: '2026-10-22' }],
  };
  assert.equal(boostStreakDays(s, ['habits', 'tasks'], '', T), 1);
  // log the SAME day again → still one day, the missed 2026-10-21 still breaks the run
  const again = {
    habits: [{ id: 'h1', completedDates: ['2026-10-20', '2026-10-22'] }],
    tasks: [{ id: 't1', completedDate: '2026-10-22' }, { id: 't2', completedDate: '2026-10-22' }],
    workouts: [{ name: 'Run', date: '2026-10-22' }],
  };
  assert.equal(boostStreakDays(again, ['habits', 'tasks', 'workout'], '', T), 1);
  assert.equal(boostMultiplierFor(boostStreakDays(again, ['habits', 'tasks', 'workout'], '', T)), 1.00);
});

/* ── REFUND SYMMETRY ── */
test('splitBoostXp: the parts sum exactly to the credited total', () => {
  assert.deepEqual(splitBoostXp(95, 3), [32, 32, 31]);
  assert.deepEqual(splitBoostXp(90, 3), [30, 30, 30]);
  assert.deepEqual(splitBoostXp(53, 1), [53]);
  assert.deepEqual(splitBoostXp(95, 0), []);
  for (const total of [0, 1, 7, 95, 143, 1000]) {
    for (const n of [1, 2, 3, 7, 30]) {
      const parts = splitBoostXp(total, n);
      assert.equal(parts.length, n);
      assert.equal(parts.reduce((a, b) => a + b, 0), total, `${total}/${n}`);
      assert.ok(parts.every((p) => Number.isInteger(p)));
    }
  }
});
