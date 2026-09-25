/* ── ZenFit V2 · core/utils.js ─────────────────────────────
   Pure helpers only. No DOM, no state, no imports.
   Safe to unit-test in isolation.
────────────────────────────────────────────────────────────── */

export function pad2(n) { return String(n).padStart(2, '0'); }

export function localDayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function getTodayStr() { return localDayStr(new Date()); }

export function getUserTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return localDayStr(dt);
}

export function daysBetween(a, b) {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  const da = new Date(pa[0], pa[1] - 1, pa[2]);
  const db = new Date(pb[0], pb[1] - 1, pb[2]);
  return Math.round((db - da) / 86400000);
}

/* XP curve (identical to V1 — do not change, preserves ranks) */
export function xpForLevel(level) {
  return Math.floor(100 * Math.pow(level, 1.5));
}

/* Rank from level — V1 calcRank, DO NOT change thresholds */
const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'];
export function rankForLevel(level) {
  return RANKS[Math.min(5, Math.floor((level || 1) / 8))];
}
export const RANK_MIN_LEVEL = { E: 1, D: 8, C: 16, B: 24, A: 32, S: 40 };

/* Health math (V1 formulas preserved) */
export function calcBMI(weightKg, heightCm) {
  if (!weightKg || !heightCm) return 0;
  const m = heightCm / 100;
  return Math.round(weightKg / (m * m));
}

export function bmiCategory(bmi) {
  if (!bmi) return { label: '—', color: 'var(--text-muted)' };
  if (bmi < 18.5) return { label: 'Underweight', color: 'var(--info)' };
  if (bmi < 25) return { label: 'Normal', color: 'var(--success)' };
  if (bmi < 30) return { label: 'Overweight', color: 'var(--warning)' };
  return { label: 'Obese', color: 'var(--danger)' };
}

export function calcBMR({ weightKg, heightCm, age, gender }) {
  if (!weightKg || !heightCm || !age) return 0;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(gender === 'female' ? base - 161 : base + 5);
}

const ACTIVITY_MULT = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, veryactive: 1.9, athlete: 1.9 };
export function calcTDEE(bmr, activityLevel) {
  return Math.round(bmr * (ACTIVITY_MULT[activityLevel] || 1.55));
}

export function calcBodyFat({ weightKg, heightCm, age, gender }) {
  const bmi = calcBMI(weightKg, heightCm);
  if (!bmi || !age) return null;
  const g = gender === 'female' ? 0 : 1;
  return +((1.2 * bmi + 0.23 * age - 10.8 * g - 5.4).toFixed(1));
}

export function calcIdealWeight(heightCm, gender) {
  const h = (heightCm || 0) - 100;
  if (h <= 0) return 0;
  return gender === 'female'
    ? Math.round((h - h * 0.15) * 10) / 10
    : Math.round((h - h * 0.1) * 10) / 10;
}

export function goalLabel(goal) {
  return {
    lose: 'Fat Loss', lose_aggressive: 'Aggressive Cut', recomp: 'Recomp',
    maintain: 'Maintain', gain: 'Muscle Gain',
    performance: 'Performance', heart: 'Heart Health',
  }[goal] || 'Maintain';
}

/* V1 macroSplit — goal-based macro targets from TDEE */
export function macroSplit(tdee, goal) {
  if (goal === 'recomp') {
    return { cal: tdee, protein: Math.round(tdee * 0.38 / 4), carbs: Math.round(tdee * 0.40 / 4), fat: Math.round(tdee * 0.22 / 9), sugar: 25 };
  }
  if (goal === 'lose_aggressive') {
    const cal = Math.round(Math.max(tdee - 750, 1200));
    return { cal, protein: Math.round(cal * 0.40 / 4), carbs: Math.round(cal * 0.35 / 4), fat: Math.round(cal * 0.25 / 9), sugar: 25 };
  }
  if (goal === 'lose') {
    const cal = Math.round(Math.max(tdee - 500, 1200));
    return { cal, protein: Math.round(cal * 0.35 / 4), carbs: Math.round(cal * 0.40 / 4), fat: Math.round(cal * 0.25 / 9), sugar: 25 };
  }
  if (goal === 'gain') {
    const cal = Math.round(tdee + 350);
    return { cal, protein: Math.round(cal * 0.28 / 4), carbs: Math.round(cal * 0.50 / 4), fat: Math.round(cal * 0.22 / 9), sugar: 25 };
  }
  if (goal === 'performance') {
    const cal = Math.round(tdee + 150);
    return { cal, protein: Math.round(cal * 0.25 / 4), carbs: Math.round(cal * 0.55 / 4), fat: Math.round(cal * 0.20 / 9), sugar: 25 };
  }
  if (goal === 'heart') {
    return { cal: tdee, protein: Math.round(tdee * 0.20 / 4), carbs: Math.round(tdee * 0.55 / 4), fat: Math.round(tdee * 0.25 / 9), sugar: 25 };
  }
  return { cal: tdee, protein: Math.round(tdee * 0.25 / 4), carbs: Math.round(tdee * 0.50 / 4), fat: Math.round(tdee * 0.25 / 9), sugar: 25 };
}

export function calcWHR(waistCm, hipCm) {
  if (!waistCm || !hipCm) return 0;
  return Math.round((waistCm / hipCm) * 100) / 100;
}

/* Calories burned: MET × weight × hours (V1 formula) */
export function calcBurn(met, weightKg, minutes) {
  return Math.round(met * weightKg * (minutes / 60));
}

export function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function debounce(fn, ms = 300) {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* Streak of consecutive days ending today (or yesterday if today missing) */
export function calcStreak(daySet) {
  const set = new Set(daySet);
  let cursor = getTodayStr();
  if (!set.has(cursor)) cursor = addDays(cursor, -1);
  let streak = 0;
  while (set.has(cursor)) { streak++; cursor = addDays(cursor, -1); }
  return streak;
}
