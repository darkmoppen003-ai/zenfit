/* ── ZenFit V2 · core/missions.js ──────────────────────────
   Log-linked missions: admin designs tasks per category, the
   engine matches the user's logged activity and auto-awards.
   Categories: WORKOUT (exercise + sets + reps), WATER (ml),
   HABITS (count), STREAK (best streak), STEPS, ZEN (minutes),
   STUDY (minutes), SCREENTIME (max minutes).
   Every rule carries consistency (continuous days). One award
   per mission (status flip). Legacy {metric} rules still work.
────────────────────────────────────────────────────────────── */
import { S, update, save } from './store.js';
import { awardXP, showNotif } from './ui.js';
import { getTodayStr } from './utils.js';

export const MISSION_CATS = [
  { id: 'workout', label: 'Workout', fields: ['exercise', 'sets', 'reps'] },
  { id: 'water', label: 'Water', fields: ['count'] },
  { id: 'habits', label: 'Habits', fields: ['count'] },
  { id: 'streak', label: 'Streak', fields: ['streak'] },
  { id: 'steps', label: 'Steps', fields: ['count'] },
  { id: 'zen', label: 'Zen', fields: ['count'] },
  { id: 'study', label: 'Study / Productivity', fields: ['count'] },
  { id: 'screentime', label: 'Screentime', fields: ['max'] },
];

function dayStr(offset) {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function habitsDoneOn(date) {
  return (S.habits || []).filter((h) => ((h.completedDates || h.doneDates) || []).includes(date)).length;
}

function bestStreak() {
  return (S.habits || []).reduce((a, h) => Math.max(a, h.streak || 0, h.bestStreak || 0), S.zen?.bestStreak || 0);
}

/** Does one rule hold on a single day? */
function ruleHoldsOn(rule, date) {
  const cat = rule.cat || legacyCat(rule);
  switch (cat) {
    case 'workout': {
      const needle = String(rule.exercise || '').toLowerCase();
      const needSets = Number(rule.sets) || 0;
      const needReps = Number(rule.reps) || 0;
      return (S.workouts || []).some((w) => {
        if (w.date !== date) return false;
        if (needle && !(w.name || '').toLowerCase().includes(needle)) return false;
        if (needSets && (Number(w.sets) || 0) < needSets) return false;
        if (needReps && (Number(w.reps) || 0) < needReps) return false;
        return true;
      });
    }
    case 'water': {
      const ml = (S.water.entries || []).filter((e) => e.date === date).reduce((a, e) => a + (Number(e.ml) || 0), 0);
      return ml >= (Number(rule.target) || 0);
    }
    case 'habits':
      return habitsDoneOn(date) >= (Number(rule.target) || 0);
    case 'streak':
      return true;
    case 'steps': {
      const ex = (S.steps || []).find((e) => e.date === date);
      return (ex ? Number(ex.steps) || 0 : 0) >= (Number(rule.target) || 0);
    }
    case 'zen': {
      const mins = Number((S.zen?.history || {})[date]) || 0;
      return mins >= (Number(rule.target) || 0);
    }
    case 'study': {
      const mins = (S.study?.sessions || []).filter((s) => s.date === date).reduce((a, s) => a + (Number(s.duration) || 0), 0);
      return mins >= (Number(rule.target) || 0);
    }
    case 'screentime': {
      const mins = Number((S.screenTime || {})[date]) || 0;
      return mins <= (Number(rule.target) || 0);
    }
    default:
      return false;
  }
}

/** Map legacy {metric} rules to categories. */
function legacyCat(rule) {
  const m = {
    water_ml: 'water', habits: 'habits', study_min: 'study', steps: 'steps',
  }[rule.metric];
  if (m) return m;
  if (rule.metric === 'squats') return 'workout';
  if (rule.metric === 'meals' || rule.metric === 'workouts') return 'habits';
  return rule.metric;
}

/** Legacy target mapping (squats reps → workout rule). */
function legacyRule(rule) {
  if (rule.cat) return rule;
  if (rule.metric === 'squats') return { cat: 'workout', exercise: 'squat', sets: 1, reps: Number(rule.target) || 1, days: rule.days };
  return { ...rule, cat: legacyCat(rule) };
}

/** Evaluate one mission over continuous days. */
export function missionProgress(mission) {
  const rules = (mission.rules || []).map(legacyRule);
  if (!rules.length) return { done: false, detail: 'manual' };
  const parts = [];
  let ok = true;
  for (const r of rules) {
    const days = Math.max(1, Number(r.days) || 1);
    if (r.cat === 'streak') {
      const best = bestStreak();
      const met = best >= (Number(r.target) || 0);
      if (!met) ok = false;
      parts.push(`Streak: ${best}/${r.target || 0}`);
      continue;
    }
    let streak = 0;
    for (let o = 0; o < days; o++) {
      if (ruleHoldsOn(r, dayStr(o))) streak++;
      else break;
    }
    if (streak < days) ok = false;
    parts.push(`${labelOf(r)}: ${streak}/${days} days`);
  }
  return { done: ok, detail: parts.join(' · ') };
}

function labelOf(r) {
  const cat = (MISSION_CATS.find((c) => c.id === (r.cat || legacyCat(r))) || {}).label || r.cat || r.metric || 'Task';
  if (r.cat === 'workout' || r.exercise) {
    const bits = [r.exercise || 'any workout', r.sets ? `${r.sets} sets` : '', r.reps ? `${r.reps} reps` : ''].filter(Boolean);
    return bits.join(' ');
  }
  const unit = r.cat === 'water' ? 'ml' : r.cat === 'study' || r.cat === 'zen' || r.cat === 'screentime' ? 'min' : '';
  return `${cat} ≥ ${r.target}${unit}`;
}

let checking = false;
/** Auto-award newly-completed missions. Safe to call on every update. */
export function checkMissions() {
  if (checking) return;
  const live = (S.events || []).filter((e) => e.status === 'live' && Array.isArray(e.rules) && e.rules.length);
  if (!live.length) return;
  checking = true;
  try {
    for (const m of live) {
      let p = null;
      try { p = missionProgress(m); } catch { continue; }
      if (p?.done) {
        const xp = Number(m.xp) || 0;
        update((s) => {
          const e = (s.events || []).find((x) => x.id === m.id);
          if (e) e.status = 'done';
          s.inbox = [...(s.inbox || []), { id: `mission-${m.id}-${Date.now()}`, title: `Mission complete: ${m.title}`, body: `Matched your logs (${p.detail}). +${xp} XP awarded.`, date: getTodayStr(), ts: Date.now() }];
          s.inboxUnread = (s.inboxUnread || 0) + 1;
        }, { silent: true });
        if (xp > 0) awardXP(xp, `Mission: ${m.title}`);
        else showNotif(`Mission complete: ${m.title}`, 'OK');
      }
    }
    save();
  } finally {
    checking = false;
  }
}
