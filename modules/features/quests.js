/* ── ZenFit V2 · features/quests.js ────────────────────────
   V1 quest system, faithfully mirrored:
   6 fixed daily quests (+100/120 XP) with auto-completion,
   20-item bonus pool (5 random/day), dashboard specials
   (q1 auto-logs water, q2 logs a meal plan, q4 needs 2 habits).
────────────────────────────────────────────────────────────── */
import { S, update } from '../core/store.js';
import { getTodayStr } from '../core/utils.js';
import { escapeHtml, sanitizeText, sanitizeNumber } from '../core/sanitize.js';
import { showNotif, awardXP, sfx, openOverlay } from '../core/ui.js';
import { todayWater, todayBurned } from '../core/selectors.js';
import { checkAchievements } from '../core/achievements.js';

const BONUS_POOL = [
  { icon: '🌅', title: 'Wake up before 7 AM', xp: 50 }, { icon: '🧘', title: 'Meditate 5 minutes', xp: 40 },
  { icon: '📵', title: 'No phone for 1 hour', xp: 60 }, { icon: '🥤', title: 'Drink water first thing in morning', xp: 30 },
  { icon: '🚶', title: 'Take 10,000 steps', xp: 80 }, { icon: '📓', title: 'Journal for 5 minutes', xp: 40 },
  { icon: '🌿', title: 'Eat a fruit or vegetable snack', xp: 35 }, { icon: '💤', title: 'Sleep before midnight', xp: 50 },
  { icon: '🧹', title: 'Clean your workspace', xp: 30 }, { icon: '📚', title: 'Read for 15 minutes', xp: 45 },
  { icon: '🏃', title: 'Do 50 jumping jacks', xp: 40 }, { icon: '🎯', title: 'Complete all daily quests', xp: 150 },
  { icon: '🤸', title: 'Do 20 pushups', xp: 50 }, { icon: '🌊', title: 'Take a cold shower', xp: 60 },
  { icon: '💡', title: 'Learn one new thing', xp: 35 }, { icon: '🍳', title: 'Cook a meal from scratch', xp: 45 },
  { icon: '✍️', title: 'Write your goals for tomorrow', xp: 35 }, { icon: '🌳', title: '15 minutes outdoors', xp: 40 },
  { icon: '🧃', title: 'Avoid sugary drinks all day', xp: 55 }, { icon: '🎵', title: 'Listen to something uplifting', xp: 25 },
];

export function generateQuests() {
  if (S.quests.date === getTodayStr()) return;
  update((s) => {
    s.quests = {
      date: getTodayStr(),
      list: [
        { id: 'q1', icon: '💧', title: 'Drink 3L water', done: false, xp: 100 },
        { id: 'q2', icon: '🍽️', title: 'Log 3 meals', done: false, xp: 100 },
        { id: 'q3', icon: '🏋️', title: 'Complete a workout', done: false, xp: 100 },
        { id: 'q4', icon: '✅', title: 'Complete 2 habits', done: false, xp: 100 },
        { id: 'q5', icon: '📖', title: 'Study 30+ minutes', done: false, xp: 120 },
        { id: 'q6', icon: '🔥', title: 'Burn 200+ calories', done: false, xp: 100 },
      ],
    };
  }, { silent: true });
}

export function generateBonusTasks() {
  if (S.bonusTasks?.date === getTodayStr()) return;
  const picked = [...BONUS_POOL].sort(() => Math.random() - 0.5).slice(0, 5);
  update((s) => {
    s.bonusTasks = { date: getTodayStr(), list: picked.map((t, i) => ({ ...t, id: `b${i}`, done: false })) };
  }, { silent: true });
}

export function ensureDailyQuests() {
  generateQuests();
  generateBonusTasks();
}

/** Auto-complete quests whose conditions are now met (called after logged actions). */
export function checkAutoQuests() {
  const t = getTodayStr();
  if (S.quests.date !== t) return;
  if ((S.water.entries || []).filter((e) => e.date === t).reduce((a, b) => a + (b.ml || 0), 0) >= (S.water.dailyGoalMl || 3000)) autoQ('q1');
  if (S.nutrition.entries.filter((e) => e.date === t).length >= 3) autoQ('q2');
  if ((S.workouts || []).filter((w) => w.date === t).length > 0) autoQ('q3');
  if ((S.habits || []).filter((h) => (h.completedDates || h.doneDates || []).includes(t)).length >= 2) autoQ('q4');
  if ((S.study.sessions || []).filter((s) => s.date === t).reduce((a, b) => a + (b.duration ?? b.minutes ?? 0), 0) >= 30) autoQ('q5');
  if (todayBurned() >= 200) autoQ('q6');
}

export function autoQ(id) {
  const q = S.quests.list.find((x) => x.id === id);
  if (q && !q.done) {
    update((s) => {
      s.quests.list.find((x) => x.id === id).done = true;
      s.questsDoneTotal = (s.questsDoneTotal || 0) + 1;
    });
    sfx('quest');
    awardXP(q.xp, 'Quest complete!');
    checkAchievements();
  }
}

/** Dashboard tap behavior with V1 specials. */
export function completeQuest(listKey, idx, onDone) {
  const list = listKey === 'bonusTasks' ? (S.bonusTasks?.list || []) : S.quests.list;
  const q = list[idx];
  if (!q || q.done) return;
  if (q.id === 'q1') {
    update((s) => { s.quests.list.find((x) => x.id === 'q1').done = true; s.questsDoneTotal = (s.questsDoneTotal || 0) + 1; });
    const remaining = Math.max(0, (S.water.dailyGoalMl || 3000) - todayWater());
    if (remaining > 0) {
      update((s) => { s.water.entries = [...s.water.entries, { ml: remaining, date: getTodayStr(), ts: Date.now() }]; });
      showNotif(`Auto-logged ${Math.round(remaining / 100) / 10}L water!`, '💧');
    } else showNotif('Water goal already met!', '💧');
    awardXP(q.xp, 'Quest: ' + q.title);
    checkAchievements();
    onDone?.();
    return;
  }
  if (q.id === 'q2') {
    const plans = S.mealPlans || [];
    if (!plans.length) { showNotif('No predefined meals. Add one from Meal Planner first!', '🍽️'); return; }
    if (plans.length === 1) { logMealPlan(0); finishQ(q, listKey); onDone?.(); return; }
    openOverlay(`<div class="section-title">Select Meal Plan</div>` +
      plans.map((p, pi) => `<button class="btn btn-full mb8" data-mp="${pi}">${escapeHtml(p.name || `Meal ${pi + 1}`)}</button>`).join('') +
      `<button class="btn btn-ghost btn-full" id="qx-cancel">Cancel</button>`);
    document.querySelectorAll('[data-mp]').forEach((b) => {
      b.onclick = () => {
        document.getElementById('zf-overlay')?.remove();
        logMealPlan(Number(b.dataset.mp));
        finishQ(q, listKey);
        onDone?.();
      };
    });
    document.getElementById('qx-cancel').onclick = () => document.getElementById('zf-overlay')?.remove();
    return;
  }
  if (q.id === 'q4') {
    const doneToday = (S.habits || []).filter((h) => (h.completedDates || h.doneDates || []).includes(getTodayStr())).length;
    if (doneToday < 2) { showNotif('Complete at least 2 habits first!', '⚠️'); return; }
  }
  finishQ(q, listKey);
  onDone?.();
}

function finishQ(q, listKey) {
  update((s) => {
    const list = listKey === 'bonusTasks' ? s.bonusTasks.list : s.quests.list;
    list.find((x) => x.id === q.id).done = true;
    s.questsDoneTotal = (s.questsDoneTotal || 0) + 1;
  });
  sfx('quest');
  awardXP(q.xp, 'Quest: ' + q.title);
  checkAchievements();
}

export function logMealPlan(i) {
  const mp = S.mealPlans?.[i];
  if (!mp) return;
  const t = getTodayStr();
  update((s) => {
    (mp.items || []).forEach((item) => {
      s.nutrition.entries.push({
        id: Date.now() + Math.random(), name: item.name, date: t, mealType: 'meal',
        nutrients: { cal: item.cal || 0, protein: item.prot ?? item.protein ?? 0, carbs: item.carbs || 0, fat: item.fat || 0, fiber: 0 },
        xpAwarded: 30,
      });
    });
  });
  const n = (mp.items || []).length;
  awardXP(30 * n, 'Meal logged!');
  checkAutoQuests();
  checkAchievements();
}

export function renderQuests(host) {
  ensureDailyQuests();
  const quests = S.quests.list || [];
  const events = (S.events || []).filter((e) => e.status !== 'done');
  const done = quests.filter((q) => q.done).length;

  host.innerHTML = `
  <div class="section-title">Daily Quests</div>
  <div id="q-list"></div>
  <div class="insight mt8">💡 Most quests auto-complete as you track. Manual complete only if needed.</div>
  <hr>
  <div class="section-title" style="margin-top:16px">Bonus Tasks — ${(S.bonusTasks?.list || []).filter((b) => b.done).length}/${(S.bonusTasks?.list || []).length} done</div>
  <div id="q-bonus"></div>
  <div class="section-title mt16">Missions & events</div>
  <div id="q-events">${events.length ? '' : '<div class="card text-center" style="color:var(--text-muted)">No active missions. New challenges from your coach appear here.</div>'}</div>`;

  const paint = (box, list, key) => {
    list.forEach((q, idx) => {
      const row = document.createElement('div');
      row.className = `quest-card${q.done ? ' done' : ''}`;
      row.innerHTML = `<span style="font-size:18px;width:24px">${escapeHtml(q.icon || '⭐')}</span>`
        + `<div style="flex:1"><div style="font-size:13px;font-weight:500">${escapeHtml(q.title || q.text)}</div>`
        + `<div style="font-size:11px;color:var(--text-muted)">+${q.xp} XP</div></div>`
        + `<div class="quest-check${q.done ? ' done' : ''}">${q.done ? '✓' : ''}</div>`;
      row.querySelector('.quest-check').onclick = () => completeQuest(key, idx);
      box.appendChild(row);
    });
  };
  paint(host.querySelector('#q-list'), quests, 'quests');
  const bb = host.querySelector('#q-bonus');
  (S.bonusTasks?.list || []).forEach((b) => {
    const row = document.createElement('div');
    row.className = `bonus-card${b.done ? ' done' : ''}`;
    row.innerHTML = `<span style="font-size:20px;width:28px">${escapeHtml(b.icon || '🎁')}</span>`
      + `<div style="flex:1"><div style="font-size:13px;font-weight:500">${escapeHtml(b.title)}</div>`
      + `<div style="font-size:11px;color:var(--warning)">+${b.xp} Bonus XP</div></div>`
      + `<button class="btn btn-sm${b.done ? '' : ' btn-primary'}"${b.done ? ' disabled' : ''} style="${b.done ? 'opacity:.5' : ''}">${b.done ? '✓ Done' : 'Complete'}</button>`;
    if (!b.done) {
      row.querySelector('button').onclick = () => {
        update((s) => {
          s.bonusTasks.list.find((x) => x.id === b.id).done = true;
          s.questsDoneTotal = (s.questsDoneTotal || 0) + 1;
        });
        awardXP(b.xp, 'Bonus!');
        checkAchievements();
      };
    }
    bb.appendChild(row);
  });

  const ev = host.querySelector('#q-events');
  events.forEach((m) => {
    const d = document.createElement('div');
    d.className = 'bonus-card';
    d.innerHTML = `<div style="font-size:24px">${escapeHtml(m.icon || '📯')}</div>
      <div style="flex:1"><div style="font-size:13px;font-weight:600">${escapeHtml(m.title)}</div>
      <div style="font-size:12px;color:var(--text-secondary)">${escapeHtml(m.body || '')}</div>
      <div style="font-size:11px;color:var(--warning)">Reward: +${m.xp || 25} XP</div></div>
      <button class="btn btn-sm btn-success">Done</button>`;
    d.querySelector('button').onclick = () => {
      update((s) => { s.events = s.events.map((x) => (x.id === m.id ? { ...x, status: 'done' } : x)); });
      awardXP(m.xp || 25, 'Mission complete!');
    };
    ev.appendChild(d);
  });
}
