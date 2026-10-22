/* ── ZenFit V2 · core/streak-boost.js ───────────────────────
   Account-wide XP boost streak.

   Pure functions only — no DOM, no store import (the state is
   passed in) so the whole rule set is unit-testable in Node.

   Rules (owner-approved):
   - The 7 activity categories below are SHARED with the Analytics
     "Activity Streaks" card (same ids / labels / icons / colors).
     Their predicates live here so both cards read ONE definition.
   - Qualification is ANY selected category. Analytics keeps its
     own all-selected semantics — the two cards stay independent.
   - A rest day (Sunday or a claimed rest day) PAUSES the streak:
     it never advances it and never breaks it. A qualifying
     activity on a rest day still counts (activity beats rest day).
   - Scope changes restart the streak from `boostSince` (the local
     date the change was applied) — earlier days never count.
   - The multiplier applies to a fixed list of eligible ACTIVITY
     sources; the selection governs continuity only.
   ────────────────────────────────────────────────────────────── */
import { addDays } from './utils.js';

/* The 7 tracked activity categories. Shared with analytics.js
   (Activity Streaks card) — ids are the state vocabulary. */
export const BOOST_ACTS = [
  { id: 'habits', label: 'Habits', icon: '✅', color: '#4cdb8a' },
  { id: 'tasks', label: 'Tasks', icon: '📋', color: '#4a9eff' },
  { id: 'water', label: 'Water goal', icon: '💧', color: '#00b6ff' },
  { id: 'workout', label: 'Workout', icon: '🏋️', color: '#f5a623' },
  { id: 'mind', label: 'Meditate', icon: '🧘', color: '#c084fc' },
  { id: 'study', label: 'Study', icon: '📚', color: '#4a9eff' },
  { id: 'nutrition', label: 'Nutrition goal', icon: '🍽️', color: '#ff7a1a' },
];

/* Multiplier ladder. Verified against the real XP rewards: a flat
   multiplier speeds every income profile up by the same ~29%. */
export const BOOST_TIERS = [
  { min: 1, max: 2, mult: 1.00 },
  { min: 3, max: 6, mult: 1.05 },
  { min: 7, max: 13, mult: 1.10 },
  { min: 14, max: 29, mult: 1.20 },
  { min: 30, max: 59, mult: 1.30 },
  { min: 60, max: Infinity, mult: 1.40 },
];

/** Was this activity done on this date? (shared with Analytics) */
export function activityDoneOn(state, act, ds) {
  const s = state || {};
  if (act === 'habits') return (s.habits || []).some((h) => habitDatesOf(h).includes(ds));
  if (act === 'tasks') return (s.tasks || []).some((t) => t.completedDate === ds);
  if (act === 'water') return (s.water?.entries || []).filter((e) => e.date === ds).reduce((a, e) => a + (e.ml || 0), 0) >= (s.water?.dailyGoalMl || 3000);
  if (act === 'workout') return (s.workouts || []).some((w) => w.date === ds);
  if (act === 'mind') return (s.zen?.sessions || []).some((z) => z.date === ds) || (s.mood?.entries || []).some((e) => e.date === ds);
  if (act === 'study') return (s.study?.sessions || []).some((x) => x.date === ds);
  if (act === 'nutrition') return (s.nutrition?.entries || []).some((e) => e.date === ds);
  return false;
}
/** Legacy habits carry doneDates — every reader must accept both. */
function habitDatesOf(h) { return h.completedDates || h.doneDates || []; }

/** THE rest-day policy: Sunday always, plus the user's claimed days.
    One implementation — the boost, habits, the inactivity penalty and
    the heatmap all read it. */
export function restDayOn(state, ds) {
  const d = new Date(`${ds}T12:00:00`);
  if (d.getDay() === 0) return true;
  return (state?.restDays || []).includes(ds);
}

/** The configured boost scope. Empty array = boost OFF (never "all"). */
export function boostScopeOf(state) {
  const raw = state?.boostScope;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id) => BOOST_ACTS.some((a) => a.id === id));
}

/**
 * Consecutive qualifying days ending today (or yesterday, if today has
 * not been logged yet). Rest days are skipped, never counted and never
 * break the run. Days before `since` (the scope-change anchor) never
 * count. A missed non-rest day ends the streak.
 */
export function boostStreakDays(state, scope, since, todayStr) {
  const sel = Array.isArray(scope) ? scope.filter((id) => BOOST_ACTS.some((a) => a.id === id)) : [];
  if (!sel.length) return 0;
  const anchor = typeof since === 'string' ? since : '';
  const qualifies = (ds) => sel.some((id) => activityDoneOn(state, id, ds));
  let cursor = todayStr;
  let days = 0;
  // Grace: today may not be logged yet — the streak survives until midnight.
  if (!qualifies(cursor)) cursor = addDays(cursor, -1);
  for (let guard = 0; guard < 4000; guard++) {
    if (anchor && cursor < anchor) break;              // anchor: earlier days never count
    if (qualifies(cursor)) { days++; cursor = addDays(cursor, -1); continue; }
    if (restDayOn(state, cursor)) { cursor = addDays(cursor, -1); continue; }  // rest day pauses
    break;                                            // missed non-rest day breaks it
  }
  return days;
}

/** Multiplier for a streak length (0 days = no boost = ×1.00). */
export function boostMultiplierFor(days) {
  const d = Number(days) || 0;
  for (const t of BOOST_TIERS) if (d >= t.min && d <= t.max) return t.mult;
  return 1;
}

/** The XP actually credited. ×1.00 keeps the raw amount (byte-identical
    to the unboosted path, fractional XP included). */
export function boostedAmount(base, mult) {
  const b = Number(base);
  if (!Number.isFinite(b) || b <= 0) return 0;
  const m = Number(mult) || 1;
  if (m === 1) return b;
  return Math.round(b * m);
}

/** Split one credited total across n records (n meals logged at once).
    The parts sum EXACTLY to the total, so deleting every record refunds
    exactly what was credited. */
export function splitBoostXp(total, n) {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  const sum = Math.max(0, Math.round(Number(total) || 0));
  if (!count) return [];
  const base = Math.floor(sum / count);
  const rem = sum - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}
