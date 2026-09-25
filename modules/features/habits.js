/* ── ZenFit V2 · features/habits.js ────────────────────────
   V1 habits screen: add form (name/difficulty/category/icon/
   description), habit cards with icon, difficulty badge,
   14-day completion curve, streak, XP, monthly %, Done button.
────────────────────────────────────────────────────────────── */
import { S, update, deductXP, updStat } from '../core/store.js';
import { escapeHtml, sanitizeText, sanitizeEnum } from '../core/sanitize.js';
import { showNotif, awardXP, onEnter } from '../core/ui.js';
import { today, isRestDay } from '../core/selectors.js';
import { checkAutoQuests } from './quests.js';
import { checkAchievements } from '../core/achievements.js';

const HABIT_XP = { easy: 20, medium: 40, hard: 70 };
const HABIT_COLORS = ['#4a9eff', '#f5a623', '#00d4aa', '#4cdb8a', '#ff5a5a', '#c084fc', '#f472b6', '#fb923c'];
const DIFF_BADGE = { easy: 'badge-green', medium: 'badge-amber', hard: 'badge-red' };

/** V1 miniCurve — 14-day SVG completion curve. */
export function miniCurve(dates, color) {
  const now = new Date();
  const pts = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    pts.push(dates.includes(ds) ? 1 : 0);
  }
  const w = 280, h = 40, pad = 4;
  const coords = pts.map((v, i) => ({
    x: pad + i * ((w - 2 * pad) / 13),
    y: v === 1 ? h - pad - 16 : h - pad,
  }));
  let d2 = `M ${coords[0].x},${coords[0].y}`;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1], curr = coords[i];
    const cpx = (prev.x + curr.x) / 2;
    d2 += ` C ${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`;
  }
  const area = `${d2} L ${coords[13].x},${h - pad} L ${coords[0].x},${h - pad} Z`;
  const dots = coords.map((c, i) => `<circle cx="${c.x}" cy="${c.y}" r="2.5" fill="${pts[i] ? color : 'var(--border-strong)'}"/>`).join('');
  return `<svg class="habit-curve" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">`
    + `<path d="${area}" fill="${color}22"/><path d="${d2}" fill="none" stroke="${color}" stroke-width="2"/>${dots}</svg>`;
}

export function habitMonthPct(h) {
  const dates = h.completedDates || h.doneDates || [];
  if (!dates.length) return 0;
  const now = new Date();
  const n = dates.filter((d) => {
    const dd = new Date(`${d}T00:00:00`);
    return (now - dd) / 86400000 <= 30;
  }).length;
  return Math.min(100, Math.round((n / 30) * 100));
}

export function calcHabitStreak(dates) {
  const set = new Set(dates || []);
  const n = new Date();
  let cursor = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  if (!set.has(cursor)) {
    n.setDate(n.getDate() - 1);
    cursor = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }
  let s = 0;
  while (set.has(cursor)) {
    s++;
    const [y, m, d] = cursor.split('-').map(Number);
    const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() - 1);
    cursor = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }
  return s;
}

export function renderHabits(host) {
  const t = today();
  const habits = S.habits || [];
  host.innerHTML = `
  <div class="card mb16">
    <div class="section-title">Add Custom Habit</div>
    <div class="grid2" style="gap:8px;margin-bottom:8px">
      <input type="text" id="h-name" placeholder="Habit name" maxlength="80">
      <select id="h-diff"><option value="easy">Easy (+20 XP)</option><option value="medium" selected>Medium (+40 XP)</option><option value="hard">Hard (+70 XP)</option></select>
      <input type="text" id="h-cat" placeholder="Category (Health, Mind, Fitness...)" maxlength="30">
      <input type="text" id="h-icon" placeholder="Emoji icon (e.g. 📖)" maxlength="8">
    </div>
    <textarea id="h-desc" placeholder="Description (optional)..." style="height:40px;margin-bottom:8px" maxlength="200"></textarea>
    <button class="btn btn-primary" id="h-add">Add Habit</button>
  </div>
  <div class="section-title">My Habits (${habits.length})</div>
  <div id="h-list">${habits.length === 0 ? '<div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 0"><img loading="lazy" decoding="async" src="assets/mascot/habits.png" style="width:128px;height:128px;object-fit:contain" alt=""><div style="color:var(--text-muted);font-size:13px">No habits yet. Add your first habit above!</div></div>' : ''}</div>`;

  onEnter(host.querySelector('#h-name'), () => host.querySelector('#h-add').click());
  host.querySelector('#h-add').onclick = () => {
    const name = sanitizeText(host.querySelector('#h-name').value, 80);
    if (!name) { showNotif('Enter a habit name', '!'); return; }
    update((s) => {
      s.habits = [...(s.habits || []), {
        name,
        difficulty: sanitizeEnum(host.querySelector('#h-diff').value, ['easy', 'medium', 'hard'], 'easy'),
        category: sanitizeText(host.querySelector('#h-cat').value, 30),
        icon: sanitizeText(host.querySelector('#h-icon').value, 8) || '✅',
        description: sanitizeText(host.querySelector('#h-desc').value, 200),
        streak: 0, completedDates: [], createdAt: t,
      }];
    });
    showNotif('Habit added', 'OK');
  };

  const list = host.querySelector('#h-list');
  habits.forEach((h, i) => {
    const done = (h.completedDates || h.doneDates || []).includes(t);
    const color = HABIT_COLORS[i % HABIT_COLORS.length];
    const pct = habitMonthPct(h);
    const row = document.createElement('div');
    row.className = `card-sm mb10 habit-card-${i % 8}`;
    row.style.border = `1px solid ${color}22`;
    row.innerHTML = `
      <div class="flex-between mb8"><div class="flex gap8">
        <span style="font-size:18px;width:28px;height:28px;background:${color}22;border-radius:8px;display:flex;align-items:center;justify-content:center">${escapeHtml(h.icon || '✅')}</span>
        <div><div style="font-size:13px;font-weight:600">${escapeHtml(h.name)}</div>
        ${h.category ? `<div style="font-size:11px;color:${color};opacity:.8">${escapeHtml(h.category)}</div>` : ''}</div>
        <span class="badge ${DIFF_BADGE[h.difficulty] || 'badge-amber'}">${escapeHtml(h.difficulty || 'medium')}</span></div>
        <button class="btn btn-icon btn-sm" data-hdel="${i}" style="color:var(--danger)">×</button></div>
      ${h.description ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">${escapeHtml(h.description)}</div>` : ''}
      <div style="margin-bottom:8px">${miniCurve(h.completedDates || h.doneDates || [], color)}</div>
      <div class="flex-between"><div style="display:flex;gap:10px;align-items:center">
        <span style="font-size:12px;color:${color};font-weight:600">🔥 ${h.streak || 0} day streak</span>
        <span style="font-size:11px;color:var(--text-muted)">+${HABIT_XP[h.difficulty] || 20} XP</span>
        <span style="font-size:11px;color:var(--text-muted)">${pct}% this month</span></div>
        <button class="btn btn-sm${done ? '' : ' btn-primary'}" data-hdone="${i}"
          style="${done ? `background:${color}22;border-color:${color};color:${color}` : ''}">${done ? '✓ Done' : 'Mark Done'}</button></div>`;
    row.querySelector('[data-hdel]').onclick = () => {
      const h = (S.habits || [])[i];
      const t = today();
      const wasDone = (h?.completedDates || h?.doneDates || []).includes(t);
      update((s) => { s.habits.splice(i, 1); });
      if (wasDone && !isRestDay(t)) deductXP(HABIT_XP[h?.difficulty] || 20, 'Habit deleted: ' + (h?.name || ''));
    };
    row.querySelector('[data-hdone]').onclick = () => toggleHabit(i);
    list.appendChild(row);
  });
}

/** V1 toggleHabit by index. Un-check deducts XP (free on rest days). */
export function toggleHabit(i) {
  const t = today();
  const h = (S.habits || [])[i];
  if (!h) return;
  const dates = h.completedDates || h.doneDates || [];
  if (dates.includes(t)) {
    update((s) => {
      const x = s.habits[i];
      x.completedDates = (x.completedDates || x.doneDates || []).filter((d) => d !== t);
      delete x.doneDates;
      x.streak = calcHabitStreak(x.completedDates);
    });
    if (!isRestDay(t)) deductXP(HABIT_XP[h.difficulty] || 20, 'Habit: ' + h.name);
  } else {
    update((s) => {
      const x = s.habits[i];
      x.completedDates = [...(x.completedDates || x.doneDates || [])];
      delete x.doneDates;
      x.completedDates.push(t);
      x.streak = calcHabitStreak(x.completedDates);
      x.bestStreak = Math.max(x.bestStreak || 0, x.streak);
    });
    awardXP(HABIT_XP[h.difficulty] || 20, 'Habit: ' + h.name);
    updStat('discipline', 2);
  }
  checkAutoQuests();
  checkAchievements();
}
