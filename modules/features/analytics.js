/* ── ZenFit V2 · features/analytics.js ─────────────────────
   V1 analytics, faithfully mirrored: 10 sections
   (Overview/Habits/Nutrition/Training/Health/Mind/Progress/
   Insights/Gamification/Mood), period ranges 1W–All, compare
   mode, Chart.js dark charts, fitness/nutrition scores,
   heatmap, PRs, correlations, predictions.
────────────────────────────────────────────────────────────── */
import { S, update } from '../core/store.js';
import {
  calcBMI, bmiCategory, calcBodyFat,
  getTodayStr,
} from '../core/utils.js';
import { escapeHtml, sanitizeNumber } from '../core/sanitize.js';
import { showNotif } from '../core/ui.js';
import { todayWater, todayNutrition, isRestDay, today } from '../core/selectors.js';
import { checkAchievements, achievementsGridHTML } from '../core/achievements.js';
import { MOODS } from './zen.js';
import { getTDEEfromProfile } from './workout.js';

let section = 'overview';
let period = '1w';
let compare = false;
const charts = {};

const SECTIONS = [
  ['overview', 'Overview'], ['habits', 'Habits'], ['nutrition', 'Nutrition'],
  ['training', 'Training'], ['health', 'Health'], ['mind', 'Mind'],
  ['progress', 'Progress'], ['insights', 'Insights'],
  ['gamification', 'Gamification'], ['mood', 'Mood'],
];
const PERIODS = [['1w', '1W'], ['2w', '2W'], ['1m', '1M'], ['3m', '3M'], ['6m', '6M'], ['1y', '1Y'], ['all', 'All']];

/* ── Engine (V1 exact) ── */
function localDs(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function getAnalyticsPeriodConfig(p) {
  const cfg = { count: 7, step: 1 };
  if (p === '1w') { cfg.count = 7; cfg.step = 1; }
  else if (p === '2w') { cfg.count = 14; cfg.step = 1; }
  else if (p === '1m') { cfg.count = 30; cfg.step = 1; }
  else if (p === '3m') { cfg.count = 90; cfg.step = 3; }
  else if (p === '6m') { cfg.count = 180; cfg.step = 7; }
  else if (p === '1y') { cfg.count = 365; cfg.step = 7; }
  else if (p === 'all') { cfg.count = 730; cfg.step = 7; }
  return cfg;
}
function getAnalyticsData(p, offsetDays) {
  const days = [];
  const cfg = getAnalyticsPeriodConfig(p);
  const offset = offsetDays || 0;
  const totalSlots = Math.ceil(cfg.count / cfg.step);
  for (let i = totalSlots - 1; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i * cfg.step - offset);
    const ds = localDs(d);
    const label = p === '1w' ? d.toLocaleDateString([], { weekday: 'short' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const slotDates = [];
    for (let j = 0; j < cfg.step; j++) {
      const dd = new Date(d); dd.setDate(dd.getDate() - j); slotDates.push(localDs(dd));
    }
    let cal = 0, burned = 0, waterL = 0, study = 0, habits = 0, steps = 0, screentime = 0;
    slotDates.forEach((dds) => {
      cal += S.nutrition.entries.filter((e) => e.date === dds).reduce((a, e) => a + (e.nutrients?.cal || 0), 0);
      burned += (S.burned || []).filter((e) => e.date === dds).reduce((a, e) => a + (e.calories ?? e.cal ?? 0), 0);
      waterL += (S.water.entries || []).filter((e) => e.date === dds).reduce((a, e) => a + (e.ml || 0), 0) / 1000;
      study += (S.study.sessions || []).filter((s) => s.date === dds).reduce((a, b) => a + (b.duration || 0), 0);
      habits += (S.habits || []).filter((h) => h.completedDates?.includes(dds)).length;
      const se = (S.steps || []).find((e) => e.date === dds);
      if (se) steps += se.steps;
      screentime += (S.screenTime || {})[dds] || 0;
    });
    days.push({
      label, ds, slotDates,
      cal: Math.round(cal), burned: Math.round(burned),
      water: Math.round((waterL / cfg.step) * 10) / 10,
      study: Math.round(study), habits: Math.round((habits / cfg.step) * 10) / 10,
      steps: Math.round(steps / cfg.step), screentime: Math.round(screentime / cfg.step),
    });
  }
  return days;
}
function getAnalyticsPeriodLabel(p) {
  return { '1w': 'Week', '2w': '2 Weeks', '1m': 'Month', '3m': '3 Months', '6m': '6 Months', '1y': 'Year', all: 'All Time' }[p] || p;
}
function getComparisonData(p) {
  const cfg = getAnalyticsPeriodConfig(p);
  return { current: getAnalyticsData(p, 0), previous: getAnalyticsData(p, cfg.count), count: cfg.count };
}
function deltaPct(cur, prev) {
  if (!prev) return cur > 0 ? '↑ NEW' : '';
  const v = Math.round(((cur - prev) / prev) * 100);
  if (v > 0) return `↑${v}%`;
  if (v < 0) return `↓${Math.abs(v)}%`;
  return '→ 0%';
}
function getAnalyticsSummary(data) {
  const activeDays = data.filter((d) => d.cal > 0 || d.burned > 0 || d.water > 0);
  const avgCal = activeDays.length ? Math.round(activeDays.reduce((a, d) => a + d.cal, 0) / activeDays.length) : 0;
  const avgBurned = activeDays.length ? Math.round(activeDays.reduce((a, d) => a + d.burned, 0) / activeDays.length) : 0;
  const loggedDays = data.filter((d) => d.cal > 0).length;
  const consistency = data.length ? Math.round((loggedDays / data.length) * 100) : 0;
  const topStreak = (S.habits || []).reduce((a, h) => Math.max(a, h.streak || 0), 0);
  const calDays = data.filter((d) => d.cal > 0);
  const bestCalDay = calDays.length ? calDays.reduce((a, d) => (d.cal > a.cal ? d : a), calDays[0]) : null;
  return { avgCal, avgBurned, consistency, topStreak, bestCalDay };
}
function getMacroTotals(p) {
  const cfg = getAnalyticsPeriodConfig(p);
  const dates = [];
  for (let i = 0; i < cfg.count; i++) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); dates.push(localDs(d));
  }
  const entries = S.nutrition.entries.filter((e) => dates.includes(e.date));
  const sum = (k) => Math.round(entries.reduce((a, e) => a + (e.nutrients?.[k] || 0), 0));
  return { protein: sum('protein'), carbs: sum('carbs'), fat: sum('fat'), fiber: sum('fiber'), sugar: sum('sugar') };
}
function calcFitnessScore() {
  const data = getAnalyticsData('1w');
  const tdee = getTDEEfromProfile();
  let score = 0;
  const activeDays = data.filter((d) => d.cal > 0 || d.burned > 0 || d.water > 0).length;
  score += Math.round((activeDays / 7) * 25);
  const goalL = (S.water.dailyGoalMl || 3000) / 1000;
  const avgWater = data.reduce((a, d) => a + d.water, 0) / 7;
  score += Math.round(Math.min(1, avgWater / goalL) * 20);
  const daysWithCal = data.filter((d) => d.cal > 0);
  if (daysWithCal.length) {
    const avgCal = daysWithCal.reduce((a, d) => a + d.cal, 0) / daysWithCal.length;
    const diff = Math.abs(avgCal - tdee) / tdee;
    score += Math.round(Math.max(0, 1 - diff * 2) * 20);
  }
  const totalHabits = (S.habits || []).length;
  if (totalHabits > 0) {
    const avgH = data.reduce((a, d) => a + d.habits, 0) / 7;
    score += Math.round(Math.min(1, avgH / totalHabits) * 20);
  } else score += 10;
  const wkDays = new Set(data.flatMap((d) => d.slotDates).filter((ds) => (S.workouts || []).some((w) => w.date === ds))).size;
  score += Math.round(Math.min(1, wkDays / 3) * 15);
  return Math.min(100, score);
}
function calcNutritionScore() {
  const days = getAnalyticsPeriodConfig(period).count;
  const tdee = getTDEEfromProfile();
  const pGoal = S.nutrition.dailyGoal.protein || 150;
  let calHits = 0, protHits = 0, logDays = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const ds = localDs(d);
    const entries = S.nutrition.entries.filter((e) => e.date === ds);
    if (!entries.length) continue;
    logDays++;
    const cal = entries.reduce((a, e) => a + (e.nutrients?.cal || 0), 0);
    const prot = entries.reduce((a, e) => a + (e.nutrients?.protein || 0), 0);
    if (Math.abs(cal - tdee) / tdee <= 0.15) calHits++;
    if (prot >= pGoal * 0.8) protHits++;
  }
  if (!logDays) return 0;
  return Math.min(100, Math.round((calHits / logDays) * 45 + (protHits / logDays) * 35 + Math.min(1, logDays / Math.min(days, 14)) * 20));
}
function getMealTimingStats() {
  const days = getAnalyticsPeriodConfig(period).count;
  const dates = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); dates.push(localDs(d));
  }
  const slots = [
    { label: 'Breakfast', icon: '🌅', color: '#f5a623', count: 0, totalCal: 0 },
    { label: 'Lunch', icon: '☀️', color: '#4cdb8a', count: 0, totalCal: 0 },
    { label: 'Dinner', icon: '🌙', color: '#4a9eff', count: 0, totalCal: 0 },
    { label: 'Snacks', icon: '🍿', color: '#c084fc', count: 0, totalCal: 0 },
  ];
  dates.forEach((ds) => {
    const dayEntries = S.nutrition.entries.filter((e) => e.date === ds);
    dayEntries.forEach((e, idx) => {
      const slot = slots[Math.min(idx, 3)];
      slot.count++;
      slot.totalCal += e.nutrients?.cal || 0;
    });
  });
  return slots;
}
function getInsights(data) {
  const ins = [];
  if (!data?.length) return ins;
  const last7 = data.slice(-7);
  const last7WithCal = last7.filter((d) => d.cal > 0);
  const avgCal = last7WithCal.length ? Math.round(last7WithCal.reduce((a, d) => a + d.cal, 0) / last7WithCal.length) : 0;
  const avgWaterDays = last7.filter((d) => d.water > 0);
  const avgWaterL = avgWaterDays.length ? Math.round(avgWaterDays.reduce((a, d) => a + d.water, 0) / avgWaterDays.length * 10) / 10 : 0;
  const tdee = getTDEEfromProfile();
  const goalL = Math.round((S.water.dailyGoalMl || 3000) / 100) / 10;
  if (avgCal > 0 && avgCal < tdee * 0.85) ins.push({ icon: '📉', title: 'Low Calorie Intake', body: `Avg calories this period (${avgCal} kcal) are well below your TDEE. Ensure this is intentional — prolonged deficits can impact recovery.`, color: 'var(--warning)' });
  else if (avgCal > tdee * 1.15) ins.push({ icon: '⚠️', title: 'Excess Calories', body: `Avg calories (${avgCal} kcal) are above maintenance. Adjust portions if cutting.`, color: 'var(--danger)' });
  else if (avgCal > 0) ins.push({ icon: '✅', title: 'Calorie Balance', body: `Avg ${avgCal} kcal/day — well aligned with your TDEE of ${tdee} kcal.`, color: 'var(--success)' });
  if (avgWaterL > 0 && avgWaterL < goalL * 0.7) ins.push({ icon: '💧', title: 'Low Hydration', body: `Averaging ${avgWaterL}L/day vs ${goalL}L goal. Try a glass every 2 hours.`, color: 'var(--info)' });
  else if (avgWaterL >= goalL) ins.push({ icon: '💧', title: 'Hydration Goal Met', body: `On track at ${avgWaterL}L/day.`, color: 'var(--success)' });
  const habits = S.habits || [];
  const topStreak = habits.reduce((a, h) => Math.max(a, h.streak || 0), 0);
  const activeStreaks = habits.filter((h) => (h.streak || 0) >= 3);
  if (topStreak >= 14) ins.push({ icon: '🔥', title: 'Serious Momentum', body: `${topStreak}-day streak! You're building a discipline engine.`, color: 'var(--primary)' });
  else if (topStreak >= 7) ins.push({ icon: '🔥', title: 'Streak Going Strong', body: `${topStreak}-day streak on your best habit. Keep the chain alive.`, color: 'var(--primary)' });
  const last7dates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); last7dates.push(localDs(d));
  }
  const slipping = habits.filter((h) => (h.streak || 0) >= 3 && !((h.completedDates || []).includes(localDs(new Date()))));
  if (slipping.length) {
    const names = slipping.map((h) => h.name).join(', ');
    const hit = last7dates.filter((d) => slipping.some((h) => h.completedDates?.includes(d))).length;
    ins.push({ icon: '⚠️', title: 'Streak at Risk', body: `"${names}" ${slipping.length > 1 ? 'streaks are' : 'streak is'} slipping — only ${hit} day${hit !== 1 ? 's' : ''} this week. Complete today to protect your streak.`, color: 'var(--danger)' });
  }
  if (activeStreaks.length >= 3) ins.push({ icon: '✦', title: 'Momentum Building', body: `${activeStreaks.length} habits with 3+ day streaks.`, color: 'var(--success)' });
  const workoutsThisWeek = new Set((S.workouts || []).filter((w) => last7dates.includes(w.date)).map((w) => w.date)).size;
  if (workoutsThisWeek >= 4) ins.push({ icon: '🏋️', title: 'Training Consistency', body: `${workoutsThisWeek} active training days this week.`, color: 'var(--success)' });
  else if (workoutsThisWeek === 0 && last7WithCal.length > 2) ins.push({ icon: '🏃', title: 'No Workouts Logged', body: 'Even a 20-min walk counts. Progress is built one day at a time.', color: 'var(--warning)' });
  const studyThisWeek = (S.study.sessions || []).filter((s) => last7dates.includes(s.date)).reduce((a, b) => a + (b.duration || 0), 0);
  if (studyThisWeek >= 300) ins.push({ icon: '📚', title: 'Focused Mind', body: `${Math.round((studyThisWeek / 60) * 10) / 10}h of focused work this week.`, color: 'var(--info)' });
  const nut = todayNutrition();
  if (nut.protein > 0 && nut.protein < (S.nutrition.dailyGoal.protein || 150) * 0.5) ins.push({ icon: '🥩', title: 'Low Protein Today', body: `${Math.round(nut.protein)}g of ${S.nutrition.dailyGoal.protein || 150}g goal. Try adding eggs or legumes.`, color: 'var(--info)' });
  return ins;
}
function calcCorrelations(data) {
  const out = [];
  if (!data || data.length < 7) return out;
  const hiWater = data.filter((d) => d.water >= (S.water.dailyGoalMl || 3000) / 1000);
  const hiTrain = hiWater.filter((d) => d.burned > 0).length;
  if (hiWater.length >= 3) {
    out.push({
      icon: hiTrain / hiWater.length >= 0.5 ? '🔗' : '💧',
      label: `Training on hydrated days: ${hiTrain}/${hiWater.length} (${Math.round((hiTrain / Math.max(1, hiWater.length)) * 100)}%)`,
      sub: 'Days hitting water goal vs days with burn logged',
    });
  }
  const hiStudy = data.filter((d) => d.study >= 30).length;
  const taskDays = new Set((S.tasks || []).filter((t) => t.completedAt).map((t) => t.completedDate)).size;
  if (hiStudy >= 2) {
    out.push({ icon: '📚', label: `${hiStudy} deep-focus days (30+ min study)`, sub: `${taskDays} days with completed tasks` });
  }
  const moodDays = new Set((S.mood.entries || []).map((e) => e.date)).size;
  const habitDays = data.filter((d) => d.habits > 0).length;
  if (moodDays >= 3 && habitDays) {
    out.push({ icon: '😊', label: `Mood logged ${moodDays} days · habits active ${habitDays} days`, sub: 'Consistent tracking compounds' });
  }
  return out;
}
function getRecommendations() {
  const recs = [];
  const t = getTodayStr();
  if (todayWater() < (S.water.dailyGoalMl || 3000) * 0.5) recs.push({ icon: '💧', text: 'Drink a glass of water right now' });
  if (!S.nutrition.entries.some((e) => e.date === t)) recs.push({ icon: '🍽️', text: 'Log your next meal — rough beats none' });
  if (!(S.workouts || []).some((w) => w.date === t)) recs.push({ icon: '🏋️', text: 'Move for 10 minutes today' });
  const open = (S.habits || []).filter((h) => !(h.completedDates || []).includes(t));
  if (open.length) recs.push({ icon: '☑️', text: `Close one habit: ${open[0].name}` });
  if (!(S.mood.entries || []).some((e) => e.date === t)) recs.push({ icon: '🧘', text: 'Check in with your mood' });
  return recs.slice(0, 5);
}
function getPersonalRecords() {
  const byName = {};
  (S.workouts || []).forEach((w) => {
    const k = (w.name || '').toLowerCase();
    if (!byName[k]) byName[k] = { name: w.name, weight: 0, reps: 0, volume: 0, date: w.date, sets: 0 };
    const vol = (w.sets || 1) * (w.reps || 1) * (w.weight || 0);
    const cur = byName[k];
    if ((w.weight || 0) > cur.weight || ((w.weight || 0) === cur.weight && (w.reps || 0) > cur.reps)) {
      byName[k] = { name: w.name, weight: w.weight || 0, reps: w.reps || 0, sets: w.sets || 0, volume: vol, date: w.date };
    }
  });
  return Object.values(byName).filter((r) => r.weight > 0 || r.reps > 0).sort((a, b) => b.volume - a.volume);
}
function getMuscleDistribution() {
  const counts = {};
  const colors = { Strength: '#c084fc', Cardio: '#f5a623', HIIT: '#ff5a5a', Yoga: '#00d4aa', Other: '#4a9eff', 'Body Weight': '#4cdb8a' };
  (S.workouts || []).forEach((w) => { const t2 = w.type || 'Other'; counts[t2] = (counts[t2] || 0) + 1; });
  return Object.entries(counts).map(([type, count]) => ({ type, count, color: colors[type] || '#8a94b8' })).sort((a, b) => b.count - a.count);
}
function getWorkoutVolume(data) {
  const values = data.map((d) => d.slotDates.reduce((total, ds) =>
    total + (S.workouts || []).filter((w) => w.date === ds).reduce((a, w) => a + (w.sets || 0) * (w.reps || 0) * (w.weight || 0), 0), 0));
  return { values, hasData: values.some((v) => v > 0) };
}
function calcRecoveryStats() {
  const days = getAnalyticsPeriodConfig(period).count;
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); dates.push(localDs(d));
  }
  const workoutDates = new Set((S.workouts || []).filter((w) => dates.includes(w.date)).map((w) => w.date));
  const restDays = dates.filter((ds) => !workoutDates.has(ds)).length;
  const wdSorted = [...workoutDates].sort();
  const gaps = [];
  for (let i = 1; i < wdSorted.length; i++) {
    const diff = (new Date(wdSorted[i]) - new Date(wdSorted[i - 1])) / 86400000;
    if (diff > 0) gaps.push(diff);
  }
  const avgRestBetween = gaps.length ? `${Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10}d` : '—';
  const wkRate = workoutDates.size / (days / 7);
  let score = 0;
  if (wkRate >= 3 && wkRate <= 5) score = 100;
  else if (wkRate >= 2 && wkRate < 3) score = 75;
  else if (wkRate > 5) score = 60;
  else if (wkRate >= 1) score = 50;
  else score = 30;
  const tip = score >= 80 ? '✅ Great balance of training and rest — keep it up!'
    : score >= 60 ? '💡 Consider adding one more rest day this week.'
    : '💤 You may be under-training. Aim for 3-4 sessions per week.';
  return { restDays, avgRestBetween, score, tip };
}
function calcWeightPrediction(wl) {
  if (wl.length < 3) return null;
  const pts = wl.slice(-14);
  const n = pts.length;
  const xs = pts.map((_, i) => i);
  const ys = pts.map((w) => w.kg);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const denom = xs.reduce((a, x) => a + (x - mx) * (x - mx), 0);
  if (!denom) return null;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / denom;
  return { perWeek: Math.round(slope * 7 * 10) / 10, in30: Math.round((ys[n - 1] + slope * 30) * 10) / 10 };
}
function getZenSessions() { return S.zen?.sessions || []; }
function calcZenStreak() {
  const sessions = getZenSessions();
  if (!sessions.length) return 0;
  const days = [...new Set(sessions.map((s) => s.date))].sort().reverse();
  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = (new Date(days[i - 1]) - new Date(days[i])) / 864e5;
    if (diff <= 1.5) streak++;
    else break;
  }
  return streak;
}
function getAnalyticsMoodData(p) {
  const cfg = getAnalyticsPeriodConfig(p);
  const out = [];
  for (let i = cfg.count - 1; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const ds = localDs(d);
    const dayEntries = (S.mood.entries || []).filter((e) => e.date === ds);
    const label = p === '1w' ? d.toLocaleDateString([], { weekday: 'short' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    out.push({ label, ds, mood: dayEntries[0]?.mood || null, count: dayEntries.length });
  }
  return out;
}

/* ── Chart helpers (V1 dark theme, lazy-loaded) ── */
function destroyCharts() {
  Object.values(charts).forEach((c) => { try { c.destroy(); } catch {} });
  Object.keys(charts).forEach((k) => delete charts[k]);
}
let chartReady = null;
/** Load Chart.js on first analytics visit (precached → offline-safe). */
function ensureChart() {
  if (window.Chart) return Promise.resolve(true);
  if (!chartReady) {
    chartReady = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = './chart.umd.js';
      s.onload = () => resolve(!!window.Chart);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
      setTimeout(() => resolve(!!window.Chart), 5000);
    });
  }
  return chartReady;
}
function baseScales() {
  return {
    x: { grid: { color: '#2a305022' }, ticks: { color: '#8a94b8', font: { size: 10 }, maxTicksLimit: 8 } },
    y: { grid: { color: '#2a305022' }, ticks: { color: '#8a94b8', font: { size: 10 } } },
  };
}
function drawLine(id, labels, datasets) {
  if (!window.Chart) {
    pendingDraws.push({ type: 'line', id, labels, datasets });
    return;
  }
  const el = document.getElementById(id);
  if (!el) return;
  charts[id] = new window.Chart(el, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#8a94b8', font: { size: 10 }, boxWidth: 10 } } },
      scales: baseScales(),
    },
  });
}
function drawBars(id, labels, datasets) {
  if (!window.Chart) {
    pendingDraws.push({ type: 'bar', id, labels, datasets });
    return;
  }
  const el = document.getElementById(id);
  if (!el) return;
  charts[id] = new window.Chart(el, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#8a94b8', font: { size: 10 }, boxWidth: 10 } } },
      scales: baseScales(),
    },
  });
}
const pendingDraws = [];
function flushDraws() {
  while (pendingDraws.length) {
    const j = pendingDraws.shift();
    if (!document.getElementById(j.id)) continue;
    if (j.type === 'doughnut') drawDoughnut(j.id, j.muscleData);
    else if (j.type === 'line') {
      charts[j.id] = new window.Chart(document.getElementById(j.id), {
        type: 'line',
        data: { labels: j.labels, datasets: j.datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#8a94b8', font: { size: 10 }, boxWidth: 10 } } },
          scales: baseScales(),
        },
      });
    } else {
      drawBars(j.id, j.labels, j.datasets);
    }
  }
}
function drawDoughnut(id, muscleData) {
  const el = document.getElementById(id);
  if (!el || !window.Chart) return;
  charts[id] = new window.Chart(el, {
    type: 'doughnut',
    data: { labels: muscleData.map((m) => m.type), datasets: [{ data: muscleData.map((m) => m.count), backgroundColor: muscleData.map((m) => m.color), borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '65%' },
  });
}
function compareBanner(label, right) {
  if (!compare) return '';
  return `<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:8px;padding:6px 10px;background:var(--bg-overlay);border-radius:8px"><span>📊 <strong>${label}</strong> vs previous</span><span>${right}</span></div>`;
}
function periodTabsHTML() {
  return `<div data-no-swipe style="display:flex;align-items:center;gap:6px;margin-bottom:10px;overflow-x:auto"><div class="chart-tab-bar" style="flex:1;margin-bottom:0">`
    + PERIODS.map(([v, l]) => `<div class="chart-tab${period === v ? ' active' : ''}" data-period="${v}">${l}</div>`).join('')
    + `</div><button class="btn btn-sm" id="an-compare" style="border:1px solid ${compare ? 'var(--primary)' : 'var(--border-mid)'};color:${compare ? 'var(--primary)' : 'var(--text-muted)'};padding:4px 10px;font-size:11px;white-space:nowrap" title="Compare two periods">⇄ ${compare ? 'On' : 'Compare'}</button></div>`;
}
function wirePeriodTabs(host) {
  host.querySelectorAll('[data-period]').forEach((b) => {
    b.onclick = () => {
      period = b.dataset.period;
      update((s) => { s._analyticsPeriod = period; }, { silent: true });
      window.ZF.save();
      window.ZF.rerender();
    };
  });
  const c = host.querySelector('#an-compare');
  if (c) c.onclick = () => { compare = !compare; window.ZF.rerender(); };
}

/* ── Root ── */
export function renderAnalytics(host, subTab) {
  if (subTab && SECTIONS.some(([id]) => id === subTab)) {
    section = subTab;
    update((s) => { s._analyticsSection = subTab; }, { silent: true });
    window.ZF.save();
  } else if (S._analyticsSection && SECTIONS.some(([id]) => id === S._analyticsSection)) {
    section = S._analyticsSection;
  }
  if (S._analyticsPeriod && PERIODS.some(([id]) => id === S._analyticsPeriod)) period = S._analyticsPeriod;
  host.innerHTML = `
  <div class="an-sec-bar">${SECTIONS.map(([id, label]) =>
    `<button class="an-sec-btn${section === id ? ' active' : ''}" data-an="${id}">${label}</button>`).join('')}</div>
  <div id="an-body"></div>`;
  host.querySelectorAll('[data-an]').forEach((b) => {
    b.onclick = () => window.ZF.go('analytics', b.dataset.an);
  });
  const body = host.querySelector('#an-body');
  destroyCharts();
  ({
    overview: renderAnOverview, habits: renderAnHabits, nutrition: renderAnNutrition,
    training: renderAnTraining, health: renderAnHealth, mind: renderAnMind,
    progress: renderAnProgress, insights: renderAnInsights,
    gamification: renderAnGamification, mood: renderAnMood,
  })[section](body);
  // Charts paint after the lazy library arrives (precached = offline-safe).
  ensureChart().then((okChart) => {
    if (!okChart) {
      document.querySelectorAll('#an-body canvas').forEach((c) => {
        if (!c.closest('.card')) return;
        const note = document.createElement('div');
        note.style.cssText = 'font-size:12px;color:var(--text-muted);text-align:center;padding:12px';
        note.textContent = 'Charts unavailable — check connection once, then they work offline.';
        c.replaceWith(note);
      });
      pendingDraws.length = 0;
      return;
    }
    flushDraws();
  });
}

/* ── OVERVIEW ── */
function renderAnOverview(body) {
  const data = getAnalyticsData(period);
  const comp = compare ? getComparisonData(period) : null;
  const prevSummary = comp ? getAnalyticsSummary(comp.previous) : null;
  const tdee = getTDEEfromProfile();
  const summary = getAnalyticsSummary(data);
  const fitnessScore = calcFitnessScore();
  const p = S.player;
  const xpNeeded = xpForLevelOf(p.level);
  const xpPct = xpNeeded > 0 ? Math.min(100, Math.round((p.xp / xpNeeded) * 100)) : 0;
  const waterPct = Math.min(100, Math.round((todayWater() / (S.water.dailyGoalMl || 3000)) * 100));
  const calPct = Math.min(100, Math.round((todayNutrition().cal / (S.nutrition.dailyGoal.cal || 2000)) * 100));
  const label = getAnalyticsPeriodLabel(period);

  body.innerHTML = periodTabsHTML()
    + compareBanner(label, `<span style="color:var(--success)">${deltaPct(summary.consistency, prevSummary?.consistency || 0)} consistency</span>`)
    + `<div class="section-title">Fitness Score</div>
  <div class="card mb12" style="display:flex;align-items:center;gap:16px;padding:16px">
    <div class="fs-ring-wrap">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="50" fill="none" stroke="#2a3050" stroke-width="10"/>
        <circle cx="60" cy="60" r="50" fill="none" stroke="${fitnessScore >= 80 ? '#4cdb8a' : fitnessScore >= 60 ? '#f5a623' : fitnessScore >= 40 ? '#4a9eff' : '#ff5a5a'}"
          stroke-width="10" stroke-dasharray="${Math.round(fitnessScore * 3.14)} 314" stroke-linecap="round" transform="rotate(-90 60 60)"/>
      </svg>
      <span class="fs-score">${fitnessScore}</span>
    </div>
    <div style="flex:1">
      <div style="font-size:15px;font-weight:700;margin-bottom:4px">${fitnessScore >= 80 ? 'Excellent' : fitnessScore >= 60 ? 'Good' : fitnessScore >= 40 ? 'Fair' : 'Building'}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">Composite score from training, nutrition, hydration, habits & consistency</div>
      <div class="grid2" style="gap:6px">
        <div class="card-sm" style="text-align:center;padding:6px">${compareSummary('CONSISTENCY', summary.consistency, prevSummary?.consistency || 0, '%')}<div style="font-size:9px;color:var(--text-muted);margin-top:2px">CONSISTENCY</div></div>
        <div class="card-sm" style="text-align:center;padding:6px">${compareSummary('BEST STREAK', summary.topStreak, prevSummary?.topStreak || 0, '')}<div style="font-size:9px;color:var(--text-muted);margin-top:2px">BEST STREAK</div></div>
      </div>
    </div>
  </div>
  <div class="section-title">Goal Progress</div>
  <div class="card mb12">
    <div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span>⚡ Level ${p.level} XP</span><span style="color:var(--primary)">${p.xp} / ${xpNeeded}</span></div>
      <div class="xp-bar-wrap"><div class="xp-bar" style="width:${xpPct}%"></div></div></div>
    <div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span>💧 Daily Water</span><span style="color:var(--water)">${waterPct}%</span></div>
      <div class="xp-bar-wrap"><div class="xp-bar" style="width:${waterPct}%;background:var(--water)"></div></div></div>
    <div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span>🍽️ Daily Calories</span><span style="color:var(--warning)">${calPct}%</span></div>
      <div class="xp-bar-wrap"><div class="xp-bar" style="width:${calPct}%;background:var(--warning)"></div></div></div>
  </div>
  <div class="section-title">Calorie Trends</div>
  <div class="grid2 mb12">
    <div class="card-sm text-center"><div style="font-size:11px;color:var(--text-muted)">AVG CAL</div><div style="font-size:20px;font-weight:800">${summary.avgCal}</div></div>
    <div class="card-sm text-center"><div style="font-size:11px;color:var(--text-muted)">AVG BURNED</div><div style="font-size:20px;font-weight:800">${summary.avgBurned}</div></div>
    <div class="card-sm text-center"><div style="font-size:16px;font-weight:700;color:var(--info)">${(S.workouts || []).filter((w) => w.date === getTodayStr()).length}</div><div style="font-size:9px;color:var(--text-muted);margin-top:2px">TODAY WKT</div></div>
    <div class="card-sm text-center"><div style="font-size:11px;color:var(--text-muted)">HABITS DONE</div><div style="font-size:20px;font-weight:800">${data.reduce((a, d) => a + d.habits, 0)}</div></div>
  </div>
  <div class="card mb12"><div class="section-title">Calories vs Burned (TDEE ${tdee})</div>
  <div style="position:relative;height:200px"><canvas id="c_overview"></canvas></div></div>`;
  wirePeriodTabs(body);
  const ds = [{ label: 'Eaten', data: data.map((d) => d.cal), borderColor: '#f5a623', backgroundColor: '#f5a62322', fill: true, tension: 0.35, pointRadius: 2 }];
  ds.push({ label: 'Burned', data: data.map((d) => d.burned), borderColor: '#ff5a5a', backgroundColor: '#ff5a5a22', fill: true, tension: 0.35, pointRadius: 2 });
  if (compare && comp) ds.push({ label: 'Prev Eaten', data: comp.previous.map((d) => d.cal), borderColor: '#f5a62355', borderDash: [3, 3], pointRadius: 1, fill: false });
  drawLine('c_overview', data.map((d) => d.label), ds);
}
function xpForLevelOf(l) {
  return Math.floor(100 * Math.pow(l, 1.5));
}
function compareSummary(label, cur, prev, unit) {
  if (!compare) return `<div style="font-size:${unit === '%' ? '20px' : '16px'};font-weight:700">${cur}${unit}</div>`;
  return `<div><div style="font-size:16px;font-weight:700">${cur}${unit}</div>`
    + `<div style="font-size:10px;color:${cur >= prev ? 'var(--success)' : 'var(--danger)'}">${deltaPct(cur, prev)}</div></div>`;
}

/* ── HABITS ── */
function renderAnHabits(body) {
  const data = getAnalyticsData(period);
  const comp = compare ? getComparisonData(period) : null;
  const habits = S.habits || [];
  const label = getAnalyticsPeriodLabel(period);
  body.innerHTML = periodTabsHTML()
    + compareBanner(label, `<span style="color:var(--success)">${deltaPct(data.reduce((a, d) => a + d.habits, 0), comp ? comp.previous.reduce((a, d) => a + d.habits, 0) : 0)} habits</span>`)
    + `<div class="section-title">Habit Completions — ${label}</div>
  <div class="card mb12"><div style="position:relative;height:180px"><canvas id="c_habits_overview"></canvas></div></div>
  <div class="section-title">Habit Breakdown</div>
  <div class="card mb12">${habits.length ? habits.map((h, i) => {
      const doneDates = h.completedDates || [];
      const pDone = doneDates.filter((d) => (new Date() - new Date(`${d}T00:00:00`)) <= getAnalyticsPeriodConfig(period).count * 864e5).length;
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:${i < habits.length - 1 ? '1px solid var(--border-mid)' : 'none'}">`
        + `<div style="width:4px;height:32px;border-radius:2px;background:${habitColor(i)}"></div>`
        + `<div style="flex:1"><div style="font-size:13px;font-weight:600">${escapeHtml(h.name)}</div>`
        + `<div style="font-size:10px;color:var(--text-muted)">${pDone} completions this period</div></div>`
        + `<div style="text-align:right"><div style="font-size:14px;font-weight:700">${h.streak || 0}</div><div style="font-size:9px;color:var(--text-muted)">day streak</div></div>`
        + `<div style="text-align:right;margin-left:8px"><div style="font-size:14px;font-weight:700;color:${h.icon === '✅' ? 'var(--success)' : 'var(--primary)'}">${doneDates.length}</div><div style="font-size:9px;color:var(--text-muted)">total</div></div></div>`;
    }).join('') : '<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:12px">No habits created yet. Add habits in the Habits tab.</div>'}</div>`;
  wirePeriodTabs(body);
  const ds = [{ label: 'Habits Done', data: data.map((d) => d.habits), backgroundColor: '#4cdb8a44', borderColor: '#4cdb8a', borderWidth: 1.5, borderRadius: 3, fill: true, tension: 0.3 }];
  if (compare && comp) ds.push({ label: 'Prev Habits', data: comp.previous.map((d) => d.habits), backgroundColor: '#4cdb8a22', borderColor: '#4cdb8a44', borderWidth: 1, borderRadius: 3, borderDash: [3, 3], pointRadius: 2 });
  drawLine('c_habits_overview', data.map((d) => d.label), ds);
}
function habitColor(i) {
  const c = ['#4a9eff', '#f5a623', '#00d4aa', '#4cdb8a', '#ff5a5a', '#c084fc', '#f472b6', '#fb923c'];
  return c[i % c.length];
}

/* ── NUTRITION ── */
function renderAnNutrition(body) {
  const data = getAnalyticsData(period);
  const comp = compare ? getComparisonData(period) : null;
  const macros = getMacroTotals(period);
  const prevMacros = compare ? getMacroTotals(period) : null;
  const tdee = getTDEEfromProfile();
  const label = getAnalyticsPeriodLabel(period);
  const nutScore = calcNutritionScore();
  const timing = getMealTimingStats();
  body.innerHTML = periodTabsHTML()
    + compareBanner(label, `<span style="color:var(--info)">${deltaPct(macros.protein, prevMacros?.protein || 0)} protein</span>`)
    + `<div class="section-title">Nutrition Score</div>
  <div class="card mb12" style="display:flex;align-items:center;gap:14px;padding:14px">
    <div style="position:relative;width:80px;height:80px;flex-shrink:0">
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="32" fill="none" stroke="#2a3050" stroke-width="8"/>
        <circle cx="40" cy="40" r="32" fill="none" stroke="${nutScore >= 80 ? '#4cdb8a' : nutScore >= 60 ? '#f5a623' : '#ff5a5a'}"
          stroke-width="8" stroke-dasharray="${Math.round(nutScore * 2.01)} 201" stroke-linecap="round" transform="rotate(-90 40 40)"/>
      </svg>
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:18px;font-weight:700;font-family:var(--font-display)">${nutScore}</div>
    </div>
    <div style="flex:1">
      <div style="font-size:13px;font-weight:600;margin-bottom:6px">${nutScore >= 80 ? 'Excellent nutrition habits' : nutScore >= 60 ? 'Good, keep improving' : 'Needs more consistency'}</div>
      <div style="font-size:11px;color:var(--text-muted)">Based on calorie accuracy, protein goals, and meal consistency over ${label}</div>
    </div>
  </div>
  <div class="section-title">Calorie Balance <span style="color:var(--info);font-size:10px">(TDEE: ${tdee} kcal)</span></div>
  <div class="card mb12"><div style="position:relative;height:200px"><canvas id="c1"></canvas></div></div>
  <div class="section-title">Net Calories</div>
  <div class="card mb12"><div style="position:relative;height:160px"><canvas id="c_net"></canvas></div></div>
  <div class="section-title">Macros (${label})</div>
  <div class="card mb12">
    ${[['Protein', macros.protein, 'g', 'var(--danger)'], ['Carbs', macros.carbs, 'g', 'var(--info)'], ['Fat', macros.fat, 'g', 'var(--primary)'], ['Fiber', macros.fiber, 'g', 'var(--success)'], ['Sugar', macros.sugar, 'g', 'var(--energy)']].map(([l, v, u, c]) => `
      <div class="flex-between mb8"><span style="font-size:13px">${l}</span>
      <span style="font-size:14px;font-weight:700;color:${c}">${v}${u}</span></div>`).join('')}
  </div>
  <div class="section-title">Meal Timing</div>
  <div class="card mb12">${timing.map((s) => `
    <div class="flex-between mb8"><span style="font-size:13px">${s.icon} ${s.label}</span>
    <span style="font-size:12px;color:var(--text-muted)">${s.count} meals · ${Math.round(s.totalCal)} kcal</span></div>`).join('')}</div>`;
  wirePeriodTabs(body);
  drawLine('c1', data.map((d) => d.label), [
    { label: 'Eaten', data: data.map((d) => d.cal), borderColor: '#f5a623', backgroundColor: '#f5a62322', fill: true, tension: 0.35, pointRadius: 2 },
    { label: 'TDEE', data: data.map(() => tdee), borderColor: '#4a9eff88', borderDash: [5, 4], pointRadius: 0, fill: false },
  ]);
  drawBars('c_net', data.map((d) => d.label), [
    { label: 'Net', data: data.map((d) => d.cal - d.burned), backgroundColor: '#c084fc88', borderRadius: 3 },
  ]);
}

/* ── TRAINING ── */
function renderAnTraining(body) {
  const data = getAnalyticsData(period);
  const comp = compare ? getComparisonData(period) : null;
  const prs = getPersonalRecords();
  const muscleData = getMuscleDistribution();
  const volData = getWorkoutVolume(data);
  const curTrainDays = new Set((S.workouts || []).filter((w) => (comp ? comp.current.find((c) => c.slotDates.includes(w.date)) : []).length).size);
  const prevTrainDays = comp ? new Set((S.workouts || []).filter((w) => comp.previous.find((c) => c.slotDates.includes(w.date))).size) : 0;
  body.innerHTML = periodTabsHTML()
    + compareBanner(getAnalyticsPeriodLabel(period), `<span style="color:${curTrainDays > prevTrainDays ? 'var(--success)' : 'var(--text-muted)'}">${deltaPct(curTrainDays, prevTrainDays)} training days</span>`)
    + `<div class="section-title">Workout Volume (kg·reps per day)</div>
  <div class="card mb12">${volData.hasData ? '<div style="position:relative;height:180px"><canvas id="c_vol"></canvas></div>' : '<div style="text-align:center;padding:20px;font-size:12px;color:var(--text-muted)">Log strength workouts with sets, reps and weight to see volume.</div>'}</div>
  <div class="section-title">Training Type Distribution</div>
  <div class="card mb12" style="display:flex;align-items:center;gap:16px;padding:16px">
    <div style="position:relative;width:100px;height:100px;flex-shrink:0"><canvas id="c_muscle"></canvas></div>
    <div style="flex:1">${muscleData.map((m) => `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <div style="display:flex;align-items:center;gap:6px"><div style="width:8px;height:8px;border-radius:2px;background:${m.color}"></div>
      <span style="font-size:12px">${escapeHtml(m.type)}</span></div><span style="font-size:12px;font-weight:700">${m.count}</span></div>`).join('') || '<div style="font-size:12px;color:var(--text-muted)">No workouts yet.</div>'}</div>
  </div>
  <div class="section-title">Personal Records (${prs.length})</div>
  ${prs.slice(0, 10).map((r) => `<div class="quest-card"><div style="font-size:22px">🏆</div>
    <div style="flex:1"><div style="font-size:13px;font-weight:600">${escapeHtml(r.name)}</div>
    <div style="font-size:11px;color:var(--text-muted)">${r.weight ? `${r.weight}kg` : ''}${r.reps ? ` × ${r.reps}` : ''} · vol ${Math.round(r.volume)} · ${escapeHtml(r.date || '')}</div></div></div>`).join('')
    || '<div class="card text-center" style="color:var(--text-muted)">Log workouts with weight to set records.</div>'}`;
  wirePeriodTabs(body);
  if (volData.hasData) {
    drawBars('c_vol', data.map((d) => d.label), [{ label: 'Volume', data: volData.values, backgroundColor: '#c084fc66', borderRadius: 3 }]);
  }
  const mc = document.getElementById('c_muscle');
  if (mc && muscleData.length) {
    if (window.Chart) {
      charts.c_muscle = new window.Chart(mc, {
        type: 'doughnut',
        data: { labels: muscleData.map((m) => m.type), datasets: [{ data: muscleData.map((m) => m.count), backgroundColor: muscleData.map((m) => m.color), borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '65%' },
      });
    } else {
      pendingDraws.push({ type: 'doughnut', id: 'c_muscle', muscleData });
    }
  }
}

/* ── HEALTH ── */
function renderAnHealth(body) {
  const data = getAnalyticsData(period);
  const recovery = calcRecoveryStats();
  const goalL = (S.water.dailyGoalMl || 3000) / 1000;
  const avgWater = data.length ? Math.round((data.reduce((a, d) => a + d.water, 0) / data.length) * 10) / 10 : 0;
  body.innerHTML = periodTabsHTML()
    + (compare ? `<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:8px;padding:6px 10px;background:var(--bg-overlay);border-radius:8px"><span>📊 <strong>${getAnalyticsPeriodLabel(period)}</strong> vs previous</span></div>` : '')
    + `<div class="section-title">Hydration Trend <span style="color:var(--text-muted);font-size:10px;font-weight:400">(avg ${avgWater}L/day · goal ${goalL}L)</span></div>
  <div class="card mb12"><div style="position:relative;height:180px"><canvas id="c_water"></canvas></div></div>
  <div class="section-title">Recovery & Rest</div>
  <div class="card mb12">
    <div class="grid3" style="gap:8px;margin-bottom:12px">
      <div class="card-sm" style="text-align:center"><div style="font-size:18px;font-weight:700;font-family:var(--font-display);color:var(--success)">${recovery.restDays}</div><div style="font-size:9px;color:var(--text-muted);margin-top:2px">REST DAYS</div></div>
      <div class="card-sm" style="text-align:center"><div style="font-size:18px;font-weight:700;font-family:var(--font-display);color:var(--info)">${recovery.avgRestBetween}</div><div style="font-size:9px;color:var(--text-muted);margin-top:2px">AVG REST BETWEEN</div></div>
      <div class="card-sm" style="text-align:center"><div style="font-size:18px;font-weight:700;font-family:var(--font-display);color:${recovery.score >= 70 ? 'var(--success)' : recovery.score >= 40 ? 'var(--warning)' : 'var(--danger)'}">${recovery.score}</div><div style="font-size:9px;color:var(--text-muted);margin-top:2px">RECOVERY</div></div>
    </div>
    <div style="font-size:11px;color:var(--text-muted)">3–5 training days per week is the recovery sweet spot. Rest days taken: ${(S.restDays || []).length}.</div>
    <div style="font-size:12px;color:var(--text-secondary);margin-top:8px">${escapeHtml(recovery.tip)}</div>
  </div>
  <div class="section-title">Screen Time Trend</div>
  <div class="card mb12"><div style="position:relative;height:160px"><canvas id="c_screen"></canvas></div></div>`;
  wirePeriodTabs(body);
  drawBars('c_water', data.map((d) => d.label), [{ label: 'Liters', data: data.map((d) => d.water), backgroundColor: '#00c8ff88', borderRadius: 3 }]);
  drawLine('c_screen', data.map((d) => d.label), [{ label: 'Min', data: data.map((d) => d.screentime), borderColor: '#c084fc', backgroundColor: '#c084fc22', fill: true, tension: 0.35, pointRadius: 2 }]);
}

/* ── MIND ── */
function renderAnMind(body) {
  const sessions = getZenSessions();
  const sessionCount = sessions.length;
  const totalMinutes = sessions.reduce((s, z) => s + (z.minutes || z.duration || 0), 0);
  const avgSession = sessionCount ? Math.round(totalMinutes / sessionCount) : 0;
  const cfg = getAnalyticsPeriodConfig(period);
  const recent = sessions.filter((z) => new Date() - new Date(`${z.date}T00:00:00`) <= cfg.count * 864e5);
  const daysTracked = new Set(recent.map((z) => z.date)).size;
  const streak = calcZenStreak();
  const studyTotal = (S.study.sessions || []).reduce((a, s) => a + (s.duration || 0), 0);
  const topSounds = {};
  sessions.forEach((s) => ((s.sounds || []).forEach((x) => { topSounds[x] = (topSounds[x] || 0) + 1; })));
  const top5 = Object.entries(topSounds).sort((a, b) => b[1] - a[1]).slice(0, 5);
  body.innerHTML = periodTabsHTML()
    + (compare ? `<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:8px;padding:6px 10px;background:var(--bg-overlay);border-radius:8px"><span>📊 <strong>${getAnalyticsPeriodLabel(period)}</strong> vs previous</span></div>` : '')
    + `<div class="section-title">Mindfulness Summary</div>
  <div class="card mb12" style="display:flex;align-items:center;gap:14px;padding:14px">
    <div style="position:relative;width:80px;height:80px;flex-shrink:0">
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="32" fill="none" stroke="#2a3050" stroke-width="8"/>
        <circle cx="40" cy="40" r="32" fill="none" stroke="var(--primary)" stroke-width="8"
          stroke-dasharray="${Math.min(201, Math.round((sessionCount ? Math.min(sessionCount, 10) : 0) / 10 * 201))} 201" stroke-linecap="round" transform="rotate(-90 40 40)"/>
      </svg>
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:18px;font-weight:700;font-family:var(--font-display)">🧘</div>
    </div>
    <div style="flex:1">
      <div class="grid2" style="gap:6px">
        <div class="card-sm text-center" style="padding:6px"><div style="font-size:16px;font-weight:700">${recent.length}</div><div style="font-size:9px;color:var(--text-muted)">SESSIONS</div></div>
        <div class="card-sm text-center" style="padding:6px"><div style="font-size:16px;font-weight:700">${avgSession}m</div><div style="font-size:9px;color:var(--text-muted)">AVG LENGTH</div></div>
        <div class="card-sm text-center" style="padding:6px"><div style="font-size:16px;font-weight:700">${daysTracked}</div><div style="font-size:9px;color:var(--text-muted)">DAYS</div></div>
        <div class="card-sm text-center" style="padding:6px"><div style="font-size:16px;font-weight:700">${streak}</div><div style="font-size:9px;color:var(--text-muted)">STREAK</div></div>
      </div>
    </div>
  </div>
  <div class="grid2 mb12">
    <div class="card-sm text-center"><div style="font-size:11px;color:var(--text-muted)">TOTAL MINDFUL</div><div style="font-size:20px;font-weight:800">${totalMinutes}m</div></div>
    <div class="card-sm text-center"><div style="font-size:11px;color:var(--text-muted)">TOTAL STUDY</div><div style="font-size:20px;font-weight:800">${studyTotal}m</div></div>
  </div>
  ${top5.length ? `<div class="section-title">Top Soundscapes</div><div class="card mb12">${top5.map(([s, n]) => `
    <div class="flex-between mb8"><span style="font-size:13px">${escapeHtml(s)}</span><span class="badge">${n}×</span></div>`).join('')}</div>` : ''}`;
  wirePeriodTabs(body);
}

/* ── PROGRESS ── */
function renderAnProgress(body) {
  const wl = S.weightLog || [];
  const pr = S.profile || {};
  const bmi = pr.weightKg && pr.heightCm ? calcBMI(pr.weightKg, pr.heightCm) : 0;
  const bmiCat = bmi ? bmiCategory(bmi) : { label: '—', color: 'var(--text-muted)' };
  const bf = bmi && pr.age && pr.gender ? calcBodyFat({ weightKg: pr.weightKg, heightCm: pr.heightCm, age: pr.age, gender: pr.gender }) : null;
  const prediction = wl.length >= 3 ? calcWeightPrediction(wl) : null;
  const t = getTodayStr();
  const twEntry = wl.find((e) => e.date === t);
  body.innerHTML = `
  <div class="card mb12">
    <div class="section-title">Log Today's Weight</div>
    ${twEntry ? `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0">
      <span style="font-size:13px;color:var(--text-muted)">Today:</span>
      <span style="font-size:20px;font-weight:700;font-family:var(--font-display);color:var(--success)">${twEntry.kg} <span style="font-size:13px;color:var(--text-muted)">kg</span></span></div>`
      : `<div style="display:flex;gap:8px"><input type="number" id="wl-input" placeholder="kg (e.g. 72.5)" step="0.1" min="30" max="300" style="flex:1">
      <button class="btn btn-primary" id="wl-log">Log</button></div>`}
  </div>
  <div class="section-title">Weight Trend (${wl.length} entries)</div>
  <div class="card mb12">${wl.length < 2 ? '<div style="text-align:center;padding:20px;font-size:12px;color:var(--text-muted)">Log your weight at least twice to see a trend line.</div>' : '<div style="position:relative;height:200px"><canvas id="c_weight"></canvas></div>'}</div>
  <div class="section-title">Body Stats</div>
  <div class="grid2 mb12">
    <div class="card-sm text-center"><div style="font-size:11px;color:var(--text-muted)">BMI</div>
      <div style="font-size:20px;font-weight:800;color:${bmiCat.color}">${bmi || '—'}</div>
      <div style="font-size:10px;color:${bmiCat.color}">${bmiCat.label}</div></div>
    <div class="card-sm text-center"><div style="font-size:11px;color:var(--text-muted)">BODY FAT</div>
      <div style="font-size:20px;font-weight:800">${bf != null ? `${bf}%` : '—'}</div>
      <div style="font-size:10px;color:var(--text-muted)">estimate</div></div>
  </div>
  ${prediction ? `<div class="insight">📉 Trend: ${prediction.perWeek >= 0 ? '+' : ''}${prediction.perWeek} kg/week → ~${prediction.in30} kg in 30 days.</div>` : ''}`;
  const logBtn = body.querySelector('#wl-log');
  if (logBtn) {
    logBtn.onclick = () => {
      const kg = sanitizeNumber(body.querySelector('#wl-input').value, { min: 30, max: 300, fallback: NaN });
      if (!Number.isFinite(kg)) { showNotif('Enter a valid weight', '!'); return; }
      if (wl.some((w) => w.date === t)) { showNotif('Weight already logged for today', '⚖️'); return; }
      update((s) => {
        s.weightLog = [...(s.weightLog || []), { date: t, kg }];
        s.profile.weightKg = kg; s.player.weightKg = kg;
      });
      checkAchievements();
      showNotif(`Weight logged: ${kg}kg · Profile updated ✓`, '⚖️');
    };
  }
  if (wl.length >= 2) {
    drawLine('c_weight', wl.map((w) => (w.date || '').slice(5)), [
      { label: 'kg', data: wl.map((w) => w.kg), borderColor: '#4a9eff', backgroundColor: '#4a9eff22', fill: true, tension: 0.35, pointRadius: 3 },
    ]);
  }
}

/* ── INSIGHTS ── */
function renderAnInsights(body) {
  const data = getAnalyticsData(period);
  const insights = getInsights(data);
  const corrs = calcCorrelations(data);
  const recs = getRecommendations();
  body.innerHTML = periodTabsHTML() + `
  <div class="section-title">AI Coach Insights</div>
  ${insights.length ? insights.map((i) => `<div class="insight" style="border-left:3px solid ${i.color || 'var(--primary)'};border-radius:0 8px 8px 0"><strong>${i.icon} ${i.title}</strong><br>${escapeHtml(i.body)}</div>`).join('')
    : '<div class="insight">📊 Keep logging consistently to unlock trend-based insights.</div>'}
  <div class="section-title" style="margin-top:16px">Correlations</div>
  <div class="card mb12">${corrs.length === 0 ? '<div style="text-align:center;padding:14px;font-size:12px;color:var(--text-muted)">Need more data to compute correlations</div>'
    : corrs.map((c) => `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border-mid)">
      <div style="font-size:18px">${c.icon}</div>
      <div style="flex:1"><div style="font-size:12px">${escapeHtml(c.label)}</div>
      <div style="font-size:10px;color:var(--text-muted)">${escapeHtml(c.sub || '')}</div></div></div>`).join('')}</div>
  <div class="section-title" style="margin-top:16px">Recommended Next Actions</div>
  <div class="card mb12">${recs.map((r) => `<div style="font-size:13px;padding:6px 0;border-bottom:1px solid var(--border-mid)">${r.icon} ${escapeHtml(r.text)}</div>`).join('') || '<div style="font-size:12px;color:var(--text-muted)">All clear — enjoy the momentum.</div>'}</div>`;
  wirePeriodTabs(body);
}

/* ── GAMIFICATION ── */
function renderAnGamification(body) {
  const habits = S.habits || [];
  const topStreaks = [...habits].sort((a, b) => (b.streak || 0) - (a.streak || 0)).slice(0, 5);
  body.innerHTML = `
  <div class="section-title">Current Streaks</div>
  <div class="card mb12">${topStreaks.length === 0 ? '<div style="text-align:center;padding:14px;font-size:12px;color:var(--text-muted)">Add habits to build streaks</div>'
    : topStreaks.map((h) => {
      const c = habitColor(habits.indexOf(h));
      return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border-mid)">
        <div style="width:36px;height:36px;border-radius:8px;background:${c}22;border:1px solid ${c}55;display:flex;align-items:center;justify-content:center;font-size:16px">${escapeHtml(h.icon || '✅')}</div>
        <div style="flex:1"><div style="font-size:13px;font-weight:600">${escapeHtml(h.name)}</div><div style="font-size:10px;color:var(--text-muted)">Best: ${h.bestStreak || h.streak || 0} days</div></div>
        <div style="text-align:right"><div style="font-size:18px;font-weight:700;font-family:var(--font-display);color:${c}">${h.streak || 0}</div><div style="font-size:9px;color:var(--text-muted)">days</div></div></div>`;
    }).join('')}</div>
  <div class="section-title">Activity Heatmap — Last 91 Days</div>
  <div class="card mb12">
    <div style="font-size:9px;color:var(--text-muted);margin-bottom:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      <span>Less</span>
      <div style="width:10px;height:10px;border-radius:2px;background:var(--bg-overlay);border:1px solid var(--border-mid)"></div>
      <div style="width:10px;height:10px;border-radius:2px;background:var(--hm-1-bg);border:1px solid var(--hm-1-border)"></div>
      <div style="width:10px;height:10px;border-radius:2px;background:var(--hm-2-bg);border:1px solid var(--hm-2-border)"></div>
      <div style="width:10px;height:10px;border-radius:2px;background:var(--hm-3-bg)"></div>
      <span>More</span>
      <span style="margin-left:auto;color:${isRestDay(today()) ? 'var(--info)' : 'var(--text-muted)'}">${isRestDay(today()) ? '🛌 Resting today' : 'Today'}</span></div>
    <div class="hm-grid" style="grid-template-columns:repeat(13,1fr)">${heatmapCells()}</div>
  </div>
  <div id="an-ach-grid"></div>`;
  const gridHost = body.querySelector('#an-ach-grid');
  const tmp = document.createElement('div');
  tmp.innerHTML = achievementsGridHTML();
  tmp.querySelectorAll('.section-title').forEach((el) => {
    if (/Achievements \(\d+ \/ \d+\)/.test(el.textContent)) el.remove();
  });
  const barWrap = tmp.querySelector('.xp-bar-wrap');
  if (barWrap && barWrap.parentElement) barWrap.parentElement.remove();
  gridHost.replaceWith(...tmp.childNodes);
  function heatmapCells() {
    let cells = '';
    const now = new Date(); now.setHours(0, 0, 0, 0);
    for (let i = 90; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const ds = localDs(d);
      let intensity = 0;
      const hasWater = (S.water.entries || []).some((e) => e.date === ds);
      const habitsDone = (S.habits || []).filter((h) => (h.completedDates || []).includes(ds)).length;
      const hasWorkout = (S.workouts || []).some((w) => w.date === ds);
      if (hasWater || habitsDone > 0) intensity = 1;
      if (hasWorkout || habitsDone >= 2) intensity = 2;
      if (hasWorkout && habitsDone >= 2 && hasWater) intensity = 3;
      const isRest = isRestDay(ds);
      cells += `<div class="hm-cell ${isRest ? 'hm-rest' : `hm-${intensity}`}" title="${ds}${isRest ? ' · Rest day' : ''}"></div>`;
    }
    return cells;
  }
}

/* ── MOOD ── */
function renderAnMood(body) {
  const data = getAnalyticsMoodData(period);
  const logged = data.filter((d) => d.mood);
  const counts = {};
  data.forEach((d) => { if (d.mood) counts[d.mood] = (counts[d.mood] || 0) + 1; });
  const total = logged.length;
  const pct = (m) => (total ? Math.round(((counts[m] || 0) / total) * 100) : 0);
  const allEntries = (S.mood?.entries || []).filter((e) => e.intensity != null);
  const avgI = allEntries.length ? Math.round(allEntries.reduce((a, e) => a + e.intensity, 0) / allEntries.length) : 0;
  const avgE = allEntries.length ? Math.round(allEntries.reduce((a, e) => a + e.energy, 0) / allEntries.length) : 0;
  const recent20 = data.slice(-20).reverse();
  body.innerHTML = periodTabsHTML()
    + (compare ? `<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:8px;padding:6px 10px;background:var(--bg-overlay);border-radius:8px"><span>📊 <strong>${getAnalyticsPeriodLabel(period)}</strong> vs previous</span></div>` : '')
    + `<div class="section-title">Mood Distribution</div>
  <div class="card mb12"><div style="display:flex;flex-direction:column;gap:8px;padding:4px 0">
    ${MOODS.map((m) => `<div><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
      <span>${m.emoji} ${m.label}</span><span style="color:var(--text-muted)">${counts[m.key] || 0} (${pct(m.key)}%)</span></div>
      <div class="xp-bar-wrap"><div class="xp-bar" style="width:${pct(m.key)}%;background:${m.color};height:8px"></div></div></div>`).join('')}
  </div></div>
  <div class="section-title">Intensity & Energy</div>
  <div class="card mb12" style="padding:12px"><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
    <div style="text-align:center;padding:8px;border-radius:8px;background:var(--bg-overlay)">
      <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">Avg Intensity</div>
      <div style="font-size:22px;font-weight:800">${avgI || '—'}${avgI ? '<span style="font-size:11px">/10</span>' : ''}</div></div>
    <div style="text-align:center;padding:8px;border-radius:8px;background:var(--bg-overlay)">
      <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">Avg Energy</div>
      <div style="font-size:22px;font-weight:800">${avgE || '—'}${avgE ? '<span style="font-size:11px">/10</span>' : ''}</div></div>
  </div></div>
  <div class="section-title">Recent Check-ins</div>
  <div class="card mb12">${recent20.filter((d) => d.mood).map((d) => {
    const m = MOODS.find((x) => x.key === d.mood);
    return `<div class="flex-between mb8"><span style="font-size:13px">${m ? `${m.emoji} ${m.label}` : escapeHtml(d.mood)}</span><span style="font-size:11px;color:var(--text-muted)">${escapeHtml(d.ds)}</span></div>`;
  }).join('') || '<div style="font-size:12px;color:var(--text-muted)">No check-ins in this period.</div>'}</div>`;
  wirePeriodTabs(body);
}
