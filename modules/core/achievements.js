/* ── ZenFit V2 · core/achievements.js ──────────────────────
   The 43 V1 achievements + check logic. Single home for the
   list (dashboard ring, leaderboard grid, award checks).
   S.achievements entries are {id, date} (V1 shape).
────────────────────────────────────────────────────────────── */
import { S, save } from './store.js';
import { getTodayStr, rankForLevel } from './utils.js';
import { escapeHtml } from './sanitize.js';
import { showNotif, showLevelUp } from './ui.js';
import { todayBurned, habitStreak, entryNutrients } from './selectors.js';

export const ACHIEVEMENTS = [
  { id: 'lvl5', icon: '⭐', name: 'Rising Star', desc: 'Reach Level 5', xp: 100, cat: 'Level' },
  { id: 'lvl10', icon: '🌟', name: 'Dedicated', desc: 'Reach Level 10', xp: 200, cat: 'Level' },
  { id: 'lvl20', icon: '💫', name: 'Veteran', desc: 'Reach Level 20', xp: 500, cat: 'Level' },
  { id: 'lvl30', icon: '🔮', name: 'Elite', desc: 'Reach Level 30', xp: 1000, cat: 'Level' },
  { id: 'str3', icon: '🔥', name: 'On Fire', desc: '3-day habit streak', xp: 50, cat: 'Streak' },
  { id: 'str7', icon: '🔥', name: 'Week Warrior', desc: '7-day habit streak', xp: 100, cat: 'Streak' },
  { id: 'str14', icon: '⚡', name: 'Fortnight Fighter', desc: '14-day streak', xp: 200, cat: 'Streak' },
  { id: 'str30', icon: '👑', name: 'Month Master', desc: '30-day streak', xp: 500, cat: 'Streak' },
  { id: 'str60', icon: '💎', name: 'Diamond Will', desc: '60-day streak', xp: 1000, cat: 'Streak' },
  { id: 'wk1', icon: '🏋️', name: 'First Rep', desc: 'Log first workout', xp: 50, cat: 'Training' },
  { id: 'wk10', icon: '💪', name: 'Consistent', desc: 'Log 10 workouts', xp: 100, cat: 'Training' },
  { id: 'wk50', icon: '🦾', name: 'Iron Will', desc: 'Log 50 workouts', xp: 300, cat: 'Training' },
  { id: 'wk100', icon: '🥇', name: 'Century', desc: 'Log 100 workouts', xp: 750, cat: 'Training' },
  { id: 'burn500', icon: '🔥', name: 'Torch', desc: 'Burn 500 kcal in a day', xp: 75, cat: 'Training' },
  { id: 'burn1000', icon: '🌋', name: 'Inferno', desc: 'Burn 1000 kcal in a day', xp: 200, cat: 'Training' },
  { id: 'meal3', icon: '🥗', name: 'Meal Planner', desc: 'Log 3 meals in a day', xp: 50, cat: 'Nutrition' },
  { id: 'meal30days', icon: '🍽️', name: 'Consistent Eater', desc: 'Log meals 30 different days', xp: 200, cat: 'Nutrition' },
  { id: 'protein7', icon: '🥩', name: 'Protein Power', desc: 'Hit protein goal 7 days running', xp: 150, cat: 'Nutrition' },
  { id: 'water1', icon: '💧', name: 'Hydrated', desc: 'Hit water goal for the first time', xp: 50, cat: 'Health' },
  { id: 'water7', icon: '🌊', name: 'Flow State', desc: 'Hit water goal 7 days running', xp: 150, cat: 'Health' },
  { id: 'water30', icon: '🌀', name: 'Aqua Master', desc: 'Hit water goal 30 times', xp: 300, cat: 'Health' },
  { id: 'study60', icon: '📚', name: 'Scholar', desc: 'Study 60+ min in a day', xp: 75, cat: 'Study' },
  { id: 'study10h', icon: '🎓', name: 'Graduate', desc: 'Accumulate 10h of study', xp: 200, cat: 'Study' },
  { id: 'study50h', icon: '🧠', name: 'Sage', desc: 'Accumulate 50h of study', xp: 500, cat: 'Study' },
  { id: 'quest10', icon: '🗡️', name: 'Questor', desc: 'Complete 10 quests', xp: 100, cat: 'Quest' },
  { id: 'quest50', icon: '⚔️', name: 'Hero', desc: 'Complete 50 quests', xp: 300, cat: 'Quest' },
  { id: 'quest100', icon: '👹', name: 'Legend', desc: 'Complete 100 quests', xp: 750, cat: 'Quest' },
  { id: 'stat50', icon: '📈', name: 'Half Century', desc: 'Any stat reaches 50', xp: 150, cat: 'Stats' },
  { id: 'stat100', icon: '💯', name: 'Maxed Out', desc: 'Any stat reaches 100', xp: 500, cat: 'Stats' },
  { id: 'weightlog1', icon: '⚖️', name: 'Scale Watcher', desc: 'Log your weight for the first time', xp: 50, cat: 'Progress' },
  { id: 'weightlog7', icon: '📉', name: 'Tracking Pro', desc: 'Log weight 7 times', xp: 100, cat: 'Progress' },
  { id: 'weightlog30', icon: '📊', name: 'Data Scientist', desc: 'Log weight 30 times', xp: 250, cat: 'Progress' },
  { id: 'social1', icon: '🤝', name: 'Social Butterfly', desc: 'Add your first partner', xp: 50, cat: 'Social' },
  { id: 'social5', icon: '👥', name: 'Networker', desc: 'Add 5 partners', xp: 150, cat: 'Social' },
  { id: 'chal1', icon: '🏆', name: 'Challenger', desc: 'Complete your first challenge', xp: 75, cat: 'Social' },
  { id: 'chal10', icon: '🥇', name: 'Champion', desc: 'Complete 10 challenges', xp: 300, cat: 'Social' },
  { id: 'mood1', icon: '😊', name: 'Self Aware', desc: 'Log your first mood', xp: 25, cat: 'Mindfulness' },
  { id: 'mood7', icon: '📝', name: 'Emotional Tracker', desc: 'Log mood 7 days', xp: 100, cat: 'Mindfulness' },
  { id: 'mood30', icon: '🧘', name: 'Mindful Master', desc: 'Log mood 30 days', xp: 300, cat: 'Mindfulness' },
  { id: 'tasks50', icon: '✅', name: 'Task Crusher', desc: 'Complete 50 tasks', xp: 100, cat: 'Productivity' },
  { id: 'tasks200', icon: '⚡', name: 'Productivity Beast', desc: 'Complete 200 tasks', xp: 400, cat: 'Productivity' },
  { id: 'lvl50', icon: '👑', name: 'Legend', desc: 'Reach Level 50', xp: 2000, cat: 'Level' },
  { id: 'lvl100', icon: '🌌', name: 'Transcendent', desc: 'Reach Level 100', xp: 5000, cat: 'Level' },
];

export function earnedIds() {
  return new Set((S.achievements || []).map((a) => (typeof a === 'string' ? a : a.id)));
}

/** Shared full achievement grid (analytics gamification + hidden page). */
export function achievementsGridHTML() {
  const earned = earnedIds();
  const cats = [...new Set(ACHIEVEMENTS.map((a) => a.cat))];
  return `<div class="section-title">Achievements (${earned.size} / ${ACHIEVEMENTS.length})</div>
  <div style="margin-bottom:8px">
    <div class="xp-bar-wrap"><div class="xp-bar" style="width:${Math.round((earned.size / ACHIEVEMENTS.length) * 100)}%"></div></div>
    <div style="font-size:10px;color:var(--text-muted);margin-top:3px">${Math.round((earned.size / ACHIEVEMENTS.length) * 100)}% complete</div>
  </div>`
  + cats.map((cat) => {
    const catAchs = ACHIEVEMENTS.filter((a) => a.cat === cat);
    return `<div class="section-title" style="font-size:9px;margin-top:12px;margin-bottom:6px">${escapeHtml(cat.toUpperCase())}</div>
    <div class="ach-grid mb8">${catAchs.map((a) => `
      <div class="ach-card ${earned.has(a.id) ? 'earned' : 'locked'}">
        <div class="ach-icon">${a.icon}</div>
        <div class="ach-name">${escapeHtml(a.name)}</div>
        <div class="ach-xp">+${a.xp} XP</div>
        <div class="ach-desc">${escapeHtml(a.desc)}</div>
        ${earned.has(a.id) ? '<div style="font-size:8px;color:var(--success);margin-top:3px">✓ Earned</div>' : ''}</div>`).join('')}</div>`;
  }).join('');
}


function localDs(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Consecutive-day streak ending today where dayFn(dateStr) is truthy. */
function dayStreak(dayFn) {
  let n = 0;
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (!dayFn(localDs(d))) d.setDate(d.getDate() - 1);
  while (dayFn(localDs(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function testAchievement(id) {
  const t = getTodayStr();
  switch (id) {
    case 'lvl5': return S.player.level >= 5;
    case 'lvl10': return S.player.level >= 10;
    case 'lvl20': return S.player.level >= 20;
    case 'lvl30': return S.player.level >= 30;
    case 'lvl50': return S.player.level >= 50;
    case 'lvl100': return S.player.level >= 100;
    case 'str3': return (S.habits || []).some((h) => (h.streak ?? habitStreak(h)) >= 3);
    case 'str7': return (S.habits || []).some((h) => (h.streak ?? habitStreak(h)) >= 7);
    case 'str14': return (S.habits || []).some((h) => (h.streak ?? habitStreak(h)) >= 14);
    case 'str30': return (S.habits || []).some((h) => (h.streak ?? habitStreak(h)) >= 30);
    case 'str60': return (S.habits || []).some((h) => (h.streak ?? habitStreak(h)) >= 60);
    case 'wk1': return (S.workouts || []).length >= 1;
    case 'wk10': return (S.workouts || []).length >= 10;
    case 'wk50': return (S.workouts || []).length >= 50;
    case 'wk100': return (S.workouts || []).length >= 100;
    case 'burn500': return todayBurned() >= 500;
    case 'burn1000': return todayBurned() >= 1000;
    case 'meal3': return S.nutrition.entries.filter((e) => e.date === t).length >= 3;
    case 'meal30days': return new Set(S.nutrition.entries.map((e) => e.date)).size >= 30;
    case 'protein7': {
      const goal = S.nutrition.dailyGoal.protein || 150;
      return dayStreak((ds) => S.nutrition.entries.filter((e) => e.date === ds)
        .reduce((a, e) => a + entryNutrients(e).protein, 0) >= goal) >= 7;
    }
    case 'water1': return S.water.entries.some((e) => e.ml >= (S.water.dailyGoalMl || 3000));
    case 'water7': {
      const goal = S.water.dailyGoalMl || 3000;
      return dayStreak((ds) => S.water.entries.filter((e) => e.date === ds).reduce((a, e) => a + (e.ml || 0), 0) >= goal) >= 7;
    }
    case 'water30': {
      const goal = S.water.dailyGoalMl || 3000;
      const days = new Set(S.water.entries.filter((e) => (e.ml || 0) >= goal).map((e) => e.date));
      // count distinct goal-hit days via daily totals
      const hit = new Set();
      (S.water.entries || []).forEach((e) => {
        const total = S.water.entries.filter((x) => x.date === e.date).reduce((a, x) => a + (x.ml || 0), 0);
        if (total >= goal) hit.add(e.date);
      });
      return hit.size >= 30;
    }
    case 'study60': return (S.study.sessions || []).filter((s) => s.date === t).reduce((a, s) => a + (s.duration ?? 0), 0) >= 60;
    case 'study10h': return (S.study.sessions || []).reduce((a, s) => a + (s.duration ?? 0), 0) >= 600;
    case 'study50h': return (S.study.sessions || []).reduce((a, s) => a + (s.duration ?? 0), 0) >= 3000;
    case 'quest10': return (S.questsDoneTotal || 0) >= 10;
    case 'quest50': return (S.questsDoneTotal || 0) >= 50;
    case 'quest100': return (S.questsDoneTotal || 0) >= 100;
    case 'stat50': return Object.values(S.player.stats || {}).some((v) => v >= 50);
    case 'stat100': return Object.values(S.player.stats || {}).some((v) => v >= 100);
    case 'weightlog1': return (S.weightLog || []).filter((w) => !w.seed).length >= 1;
    case 'weightlog7': return (S.weightLog || []).filter((w) => !w.seed).length >= 7;
    case 'weightlog30': return (S.weightLog || []).filter((w) => !w.seed).length >= 30;
    case 'social1': return (S.partners || []).length >= 1;
    case 'social5': return (S.partners || []).length >= 5;
    case 'chal1': return (S.challenges || []).filter((c) => c.status === 'completed' || c.done).length >= 1;
    case 'chal10': return (S.challenges || []).filter((c) => c.status === 'completed' || c.done).length >= 10;
    case 'mood1': return (S.mood.entries || []).length >= 1;
    case 'mood7': return new Set((S.mood.entries || []).map((e) => e.date)).size >= 7;
    case 'mood30': return new Set((S.mood.entries || []).map((e) => e.date)).size >= 30;
    case 'tasks50': return (S.tasks || []).filter((x) => x.completedAt).length >= 50;
    case 'tasks200': return (S.tasks || []).filter((x) => x.completedAt).length >= 200;
    default: return false;
  }
}

/**
 * Award newly-earned achievements (V1 exact): push {id, ts},
 * increment XP directly (no recursion), level check, trophy
 * toast. onAward hook kept for callers that pass awardXP —
 * used only for the XP toast path parity.
 */
export function checkAchievements() {
  if (!S.achievements) S.achievements = [];
  const earned = earnedIds();
  const fresh = [];
  ACHIEVEMENTS.forEach((a) => {
    if (earned.has(a.id)) return;
    let met = false;
    try { met = testAchievement(a.id); } catch { met = false; }
    if (met) {
      earned.add(a.id);
      S.achievements.push({ id: a.id, ts: Date.now() });
      fresh.push(a);
    }
  });
  if (!fresh.length) return fresh;
  // Award XP without recursion — direct increment (V1)
  fresh.forEach((a) => {
    S.player.xp += a.xp;
    let lvl = S.player.level;
    while (S.player.xp >= xpForLevel(lvl)) {
      S.player.xp -= xpForLevel(lvl);
      lvl++;
      showLevelUp(lvl);
    }
    S.player.level = lvl;
    S.player.rank = rankForLevel(lvl);
    showNotif(`🏆 Achievement: ${a.name}! +${a.xp} XP`, '★');
  });
  save();
  return fresh;
}

function xpForLevel(l) {
  return Math.floor(100 * Math.pow(l, 1.5));
}
