/* ── ZenFit V2 · core/selectors.js ─────────────────────────
   SHARED derived-data selectors. Every feature reads through
   here — one formula per concept, zero duplication.
   Shapes mirror V1 exactly (nutrients{}, calories, duration,
   completedDates) so existing user data keeps working;
   legacy flat fields are tolerated on read.
────────────────────────────────────────────────────────────── */
import { S } from './store.js';
import { getTodayStr } from './utils.js';

export const today = () => getTodayStr();

export function entriesToday(list, dateKey = 'date') {
  const t = today();
  return (list || []).filter((e) => (e[dateKey] || e.day || '') === t);
}

/* V1: entries carry {nutrients:{cal,protein|prot,carbs,fat,fiber,sugar}} */
export function entryNutrients(e) {
  const n = e.nutrients || e;
  return {
    cal: +n.cal || 0,
    protein: +(n.protein ?? n.prot ?? 0),
    carbs: +n.carbs || 0,
    fat: +n.fat || 0,
    fiber: +n.fiber || 0,
    sugar: +n.sugar || 0,
  };
}

export function todayNutrition() {
  const out = { cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, count: 0 };
  entriesToday(S.nutrition.entries).forEach((e) => {
    const n = entryNutrients(e);
    out.cal += n.cal; out.protein += n.protein; out.carbs += n.carbs;
    out.fat += n.fat; out.fiber += n.fiber; out.sugar += n.sugar; out.count++;
  });
  return out;
}

export function todayWater() {
  return entriesToday(S.water.entries).reduce((a, e) => a + (e.ml || 0), 0);
}

/* V1: S.burned entries use `calories` (workouts mirror themselves there) */
export function todayBurned() {
  return entriesToday(S.burned).reduce((a, e) => a + (e.calories ?? e.cal ?? 0), 0);
}

/* V1: study sessions use `duration` (minutes) */
export function todayStudyMinutes() {
  return entriesToday(S.study.sessions).reduce((a, x) => a + (x.duration ?? x.minutes ?? x.mins ?? 0), 0);
}

export function latestWeight() {
  const log = S.weightLog || [];
  if (log.length) return log[log.length - 1].kg;
  return S.profile.weightKg || S.player.weightKg || 70;
}

/* V1: habits use `completedDates` (+ maintained `streak`) */
export function habitDates(h) {
  return h.completedDates || h.doneDates || [];
}

export function habitDoneToday(habit) {
  return habitDates(habit).includes(today());
}

/* V1 calcHabitStreak equivalent: consecutive days ending today */
export function habitStreak(habit) {
  const set = new Set(habitDates(habit));
  let cursor = today();
  if (!set.has(cursor)) {
    const d = new Date(); d.setDate(d.getDate() - 1);
    cursor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  let n = 0;
  while (set.has(cursor)) {
    n++;
    const [y, m, d] = cursor.split('-').map(Number);
    const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() - 1);
    cursor = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }
  return n;
}

export function questsToday() { return S.quests?.date === today() ? S.quests.list : []; }

/* Steps (V1: S.steps entries {date, steps}) */
export function stepsToday() {
  return entriesToday(S.steps).reduce((a, e) => a + (e.steps || 0), 0);
}

/* ── Tasks (V1 repeat model) ── */
export function tasksDueToday() {
  const t = today();
  const dow = new Date().getDay();
  return (S.tasks || []).filter((task) => {
    if (task.completedAt && task.completedDate === t) return false;
    const repeat = task.repeat || 'once';
    if (repeat === 'once') return !task.completedAt || task.createdDate === t || !task.createdDate;
    if (repeat === 'daily') return true;
    if (repeat === 'weekdays') return dow >= 1 && dow <= 5;
    if (repeat === 'mon_sat') return dow >= 1 && dow <= 6;
    if (repeat === 'altdays') {
      if (!task.createdDate) return true;
      const start = new Date(`${task.createdDate}T00:00:00`);
      const diff = Math.round((new Date(`${t}T00:00:00`) - start) / 86400000);
      return diff % 2 === 0;
    }
    if (repeat === 'custom') return (task.customDays || []).includes(dow);
    return true;
  });
}

export function tasksDoneToday() {
  const now = Date.now();
  return (S.tasks || []).filter((t) => {
    if (!t.completedAt) return false;
    const age = now - t.completedAt;
    return age < 86400000 && age >= 0;
  });
}

/* ── Rest days (V1: Sundays always rest; manual days one-way,
   max 3 per Mon–Sat week) ── */
export function isRestDay(dateStr) {
  const d = new Date(`${dateStr || today()}T12:00:00`);
  if (d.getDay() === 0) return true;
  return (S.restDays || []).includes(dateStr || today());
}

export function weekRestCount(dateStr) {
  const d = new Date(`${dateStr || today()}T12:00:00`);
  const monday = new Date(d);
  monday.setDate(monday.getDate() - (monday.getDay() || 7) - 1);
  const dates = [];
  for (let i = 0; i < 6; i++) {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    dates.push(dd.toISOString().slice(0, 10));
  }
  return (S.restDays || []).filter((r) => dates.includes(r)).length;
}

export function calorieBalance() {
  const goal = S.nutrition.dailyGoal.cal || 2000;
  const eaten = todayNutrition().cal;
  const burned = todayBurned();
  const net = eaten - burned;
  const diff = net - goal;
  return { eaten, burned, net, goal, diff, state: diff < -150 ? 'deficit' : diff > 150 ? 'surplus' : 'balanced' };
}
