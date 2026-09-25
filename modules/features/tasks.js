/* ── ZenFit V2 · features/tasks.js ─────────────────────────
   V1 tasks screen: Done/Pending/Overdue stats, add form
   (difficulty XP, time window, repeat incl. Mon–Sat/Custom),
   today's rows with timer + repeat badges, completed section.
   Overdue tasks trigger a one-time discipline XP penalty.
────────────────────────────────────────────────────────────── */
import { S, update, deductXP, updStat } from '../core/store.js';
import { escapeHtml, sanitizeText, sanitizeEnum, sanitizeNumber } from '../core/sanitize.js';
import { showNotif, awardXP, onEnter } from '../core/ui.js';
import { tasksDueToday, today } from '../core/selectors.js';
import { checkAchievements } from '../core/achievements.js';
import { getTodayStr } from '../core/utils.js';

const TASK_XP = { easy: 30, medium: 70, hard: 130, extreme: 220 };
const TASK_XP_LOSS = { easy: 15, medium: 35, hard: 65, extreme: 110 };
const TASK_DIFF_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard', extreme: 'Extreme' };
const TASK_DIFF_COLORS = { easy: '#4cdb8a', medium: '#f5a623', hard: '#ff5a5a', extreme: '#c084fc' };
const REPEATS = [
  ['once', 'Once (Today only)'], ['daily', 'Every Day'], ['weekdays', 'Weekdays (Mon–Fri)'],
  ['altdays', 'Alternate Days'], ['mon_sat', 'Mon–Sat'], ['custom', 'Custom Days'],
];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** V1 checkOverdueTasks: one-time XP penalty per overdue task. */
export function checkOverdueTasks() {
  const t = today();
  const now = Date.now();
  const due = tasksDueToday();
  let changed = false;
  (S.tasks || []).forEach((task) => {
    if (task.overdueCharged || task.completedAt || !task.deadlineTs) return;
    if (!due.some((x) => x.id === task.id)) return;
    if (now > task.deadlineTs) {
      task.overdueCharged = true;
      const loss = TASK_XP_LOSS[task.difficulty] || 35;
      S.player.xp = Math.max(0, S.player.xp - loss);
      changed = true;
      showNotif(`[ DISCIPLINE PENALTY ] -${loss} XP — "${task.title}" overdue`, '⚠️');
    }
  });
  if (changed) {
    update(() => {}, { silent: true });
    window.ZF.save();
  }
}

export function renderTasks(host) {
  checkOverdueTasks();
  const now = Date.now();
  const due = tasksDueToday();
  const all = S.tasks || [];
  const doneToday = all.filter((t) => t.completedAt && t.completedDate === today());
  const pending = due.filter((t) => !t.completedAt || t.completedDate !== today()).length;
  const overdue = due.filter((t) => !t.completedAt && t.deadlineTs && now > t.deadlineTs).length;

  const timeLeft = (t) => {
    if (!t.deadlineTs) return '';
    const diff = t.deadlineTs - now;
    if (diff <= 0) return '<span class="task-timer-badge task-timer-over">⏰ OVERDUE</span>';
    const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000);
    const cls = diff < 3600000 ? 'task-timer-warn' : 'task-timer-ok';
    return `<span class="task-timer-badge ${cls}">⏱ ${h > 0 ? `${h}h ` : ''}${m}m left</span>`;
  };
  const repeatBadge = (t) => {
    if (!t.repeat || t.repeat === 'once') return '';
    const labels = { daily: 'Daily', weekdays: 'Weekdays', altdays: 'Alt Days', mon_sat: 'Mon–Sat', custom: 'Custom' };
    return `<span class="task-repeat-badge">🔁 ${labels[t.repeat] || t.repeat}</span>`;
  };

  host.innerHTML = `
  <div class="grid3 mb16">
    <div class="card-sm" style="text-align:center"><div style="font-size:22px;font-weight:700;font-family:var(--font-display);color:var(--success)">${doneToday.length}</div><div style="font-size:10px;color:var(--text-muted)">Done Today</div></div>
    <div class="card-sm" style="text-align:center"><div style="font-size:22px;font-weight:700;font-family:var(--font-display);color:var(--warning)">${pending}</div><div style="font-size:10px;color:var(--text-muted)">Pending</div></div>
    <div class="card-sm" style="text-align:center"><div style="font-size:22px;font-weight:700;font-family:var(--font-display);color:var(--danger)">${overdue}</div><div style="font-size:10px;color:var(--text-muted)">Overdue</div></div>
  </div>
  <div class="card mb16">
    <div class="section-title">[ ADD NEW TASK ]</div>
    <input type="text" id="task-title" placeholder="Task description..." style="width:100%;margin-bottom:8px" maxlength="120">
    <div class="grid2" style="gap:8px;margin-bottom:8px">
      <div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px">Difficulty</label>
        <select id="task-diff">
          <option value="easy">Easy (+30 XP)</option><option value="medium" selected>Medium (+70 XP)</option>
          <option value="hard">Hard (+130 XP)</option><option value="extreme">Extreme (+220 XP)</option>
        </select></div>
      <div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px">Time Window (hrs)</label>
        <input type="number" id="task-hours" placeholder="No deadline" min="0" max="72" step="0.5"></div>
      <div style="grid-column:1/-1"><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px">Repeat</label>
        <select id="task-repeat">${REPEATS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
    </div>
    <div id="task-custom-days" style="display:none;margin-bottom:8px">
      <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:6px">Select days:</label>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${DOW.map((d, i) => `<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;padding:4px 8px;background:var(--bg-raised);border-radius:6px;border:1px solid var(--border-mid)"><input type="checkbox" id="task-day-${i}" style="width:auto;padding:0;margin:0"> ${d}</label>`).join('')}
      </div></div>
    <button class="btn btn-primary btn-full" id="t-add">[ + ADD TASK ]</button>
  </div>
  <div class="section-title">Today's Tasks (${due.length})</div>
  <div id="t-due"></div>
  <div class="section-title mt16">Completed Today (${doneToday.length})</div>
  <div id="t-done">${doneToday.length === 0 ? '<div style="color:var(--text-muted);font-size:13px">No tasks completed yet today.</div>' : ''}</div>`;

  host.querySelector('#task-repeat').onchange = (e) => {
    host.querySelector('#task-custom-days').style.display = e.target.value === 'custom' ? 'block' : 'none';
  };
  onEnter(host.querySelector('#task-title'), () => host.querySelector('#t-add').click());
  host.querySelector('#t-add').onclick = () => {
    const title = sanitizeText(host.querySelector('#task-title').value, 120);
    if (!title.trim()) { showNotif('Enter a task name', '!'); return; }
    const difficulty = sanitizeEnum(host.querySelector('#task-diff').value, ['easy', 'medium', 'hard', 'extreme'], 'medium');
    const hours = sanitizeNumber(host.querySelector('#task-hours').value, { min: 0, max: 72, fallback: 0 });
    const repeat = sanitizeEnum(host.querySelector('#task-repeat').value, REPEATS.map((r) => r[0]), 'once');
    const customDays = [];
    if (repeat === 'custom') for (let d = 0; d < 7; d++) if (host.querySelector(`#task-day-${d}`)?.checked) customDays.push(d);
    const t = getTodayStr();
    const nowTs = Date.now();
    let deadlineTs = null;
    if (hours > 0) {
      const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
      deadlineTs = midnight.getTime() + hours * 3600000;
      if (deadlineTs < nowTs) deadlineTs = nowTs + hours * 3600000;
    }
    update((s) => {
      s.tasks = [...(s.tasks || []), {
        id: `t${nowTs}`, title: title.trim(), difficulty, allocatedHours: hours,
        deadlineTs, repeat, customDays, createdDate: t, createdTs: nowTs,
        completedAt: null, completedDate: null, overdueCharged: false, lastResetDate: t,
      }];
    });
    showNotif(`[ TASK ADDED ] "${title.trim()}"`, 'OK');
  };

  const paintRow = (t, box) => {
    const isDone = !!(t.completedAt && t.completedDate === today());
    const isOverdue = !isDone && t.deadlineTs && now > t.deadlineTs;
    const dc = TASK_DIFF_COLORS[t.difficulty] || 'var(--text-secondary)';
    const row = document.createElement('div');
    row.className = `task-card task-diff-${t.difficulty}${isDone ? ' task-completed' : isOverdue ? ' task-overdue' : ''}`;
    row.innerHTML = `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px">`
      + `<div style="display:flex;align-items:flex-start;gap:8px;flex:1">`
      + `<div class="task-check${isDone ? ' done' : ''}" data-tcheck="${t.id}" style="margin-top:2px">${isDone ? '✓' : ''}</div>`
      + `<div style="flex:1"><div style="font-size:13px;font-weight:600;color:${isDone ? 'var(--text-muted)' : 'var(--text-primary)'}${isDone ? ';text-decoration:line-through' : ''}">${isDone ? '<span style="color:var(--success);margin-right:4px">✓</span>' : ''}${escapeHtml(t.title)}</div>`
      + `<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:5px">`
      + `<span class="badge" style="background:${dc}22;color:${dc};border:1px solid ${dc}44">${TASK_DIFF_LABELS[t.difficulty] || t.difficulty}</span>`
      + (isDone ? `<span class="badge badge-green">+${TASK_XP[t.difficulty] || 70} XP</span>` : '')
      + timeLeft(t) + repeatBadge(t) + `</div></div></div>`
      + `<button class="btn btn-icon btn-sm" data-tdel="${t.id}" style="color:var(--danger)">×</button></div>`;
    if (!isDone) row.querySelector('[data-tcheck]').onclick = () => completeTask(t.id);
    row.querySelector('[data-tdel]').onclick = () => deleteTask(t.id);
    box.appendChild(row);
  };
  const dueBox = host.querySelector('#t-due');
  due.forEach((t) => paintRow(t, dueBox));
  const doneBox = host.querySelector('#t-done');
  doneToday.forEach((t) => paintRow(t, doneBox));
}

export function completeTask(taskId) {
  const t = (S.tasks || []).find((x) => x.id === taskId);
  if (!t) return;
  if (t.completedAt && t.completedDate === today()) { showNotif('Already completed!', 'OK'); return; }
  const now = Date.now();
  const overdue = t.deadlineTs && now > t.deadlineTs;
  const xp = overdue ? Math.floor((TASK_XP[t.difficulty] || 70) * 0.5) : (TASK_XP[t.difficulty] || 70);
  update((s) => {
    const x = s.tasks.find((y) => y.id === taskId);
    x.completedAt = now; x.completedDate = today(); x.xpAwarded = xp; x.overdueCharged = false;
  });
  updStat('discipline', overdue ? 1 : 3);
  awardXP(xp, 'Task: ' + (t.title || t.name));
  if (overdue) showNotif(`[ TASK COMPLETE ] Late — +${xp} XP (half reward)`, '⚡');
  else showNotif(`[ TASK COMPLETE ] +${xp} XP — Discipline +3`, '⚔️');
  checkAchievements();
}

export function deleteTask(taskId) {
  const t = (S.tasks || []).find((x) => x.id === taskId);
  if (t?.completedAt && t.xpAwarded) deductXP(t.xpAwarded, 'Task deleted: ' + (t.title || ''));
  update((s) => { s.tasks = (s.tasks || []).filter((x) => x.id !== taskId); });
}
