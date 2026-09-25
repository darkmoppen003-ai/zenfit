/* ── ZenFit V2 · features/dashboard.js ─────────────────────
   Home screen (orb removed — dashboard opens first), mirroring
   V1 renderHome section-for-section: hero, level ring,
   Today's Progress, character card + TODAY blocks, active
   quests, mood, achievements ring, steps, rest day, weight.
────────────────────────────────────────────────────────────── */
import { S, update } from '../core/store.js';
import { xpForLevel } from '../core/utils.js';
import { escapeHtml, sanitizeNumber } from '../core/sanitize.js';
import { showNotif, openOverlay, onEnter } from '../core/ui.js';
import { icon } from '../core/icons.js';
import {
  today, todayNutrition, todayWater, todayBurned, todayStudyMinutes,
  latestWeight, stepsToday, tasksDueToday, tasksDoneToday,
  isRestDay, weekRestCount,
} from '../core/selectors.js';
import { ensureDailyQuests, completeQuest } from './quests.js';
import { MOODS, logMoodDay, moodImgs } from './zen.js';
import { ACHIEVEMENTS, earnedIds, checkAchievements } from '../core/achievements.js';

const RANK_COLORS = { E: '#888', D: '#4cdb8a', C: '#4a9eff', B: '#c084fc', A: '#f5a623', S: '#ff5a5a' };
const RANK_NAMES = { E: 'Novice Hunter', D: 'Awakened Hunter', C: 'Rising Warrior', B: 'Iron Sentinel', A: 'Apex Predator', S: 'Legendary Sovereign' };
const RANK_LEVELS = { E: 1, D: 8, C: 16, B: 24, A: 32, S: 40 };
const RANK_EMOJI = { S: '🥷', A: '⚔️', B: '🛡️', C: '🏹', D: '🗡️', E: '👤' };
const STAT_DEFS = [
  { key: 'strength', icon: '⚔️', label: 'Strength', color: 'var(--danger)' },
  { key: 'discipline', icon: '🧠', label: 'Discipline', color: 'var(--primary)' },
  { key: 'health', icon: '❤️', label: 'Health', color: 'var(--success)' },
  { key: 'endurance', icon: '🏃', label: 'Endurance', color: 'var(--info)' },
  { key: 'wisdom', icon: '📚', label: 'Wisdom', color: 'var(--warning)' },
];

function avatarSrc() {
  const g = S.profile?.gender === 'female' ? 'female' : 'male';
  return `./assets/${g}/rank_${S.player.rank}_idle.gif`;
}

export function renderDashboard(host) {
  ensureDailyQuests();
  const p = S.player;
  const t = today();
  const hr = new Date().getHours();
  const greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  const name = S.profile?.name || p.name || 'Hunter';
  const xpNeed = xpForLevel(p.level);
  const rc = RANK_COLORS[p.rank] || '#888';
  const streak = (S.habits || []).reduce((a, h) => Math.max(a, h.streak || 0), 0);

  const water = todayWater();
  const nut = todayNutrition();
  const burned = todayBurned();
  const net = nut.cal - burned;
  const studyMins = todayStudyMinutes();
  const zenMins = S.zen?.history?.[t] || 0;
  const doneH = (S.habits || []).filter((h) => (h.completedDates || h.doneDates || []).includes(t)).length;
  const totalH = (S.habits || []).length;
  const dueTasks = tasksDueToday();
  const doneT = tasksDoneToday();
  const wGoal = S.water.dailyGoalMl || 3000;
  const cGoal = S.nutrition.dailyGoal.cal || 2000;

  /* ── Today's Progress goals (V1 dynamic set) ── */
  const goalDefs = [
    { key: 'Water', v: water >= wGoal, color: 'var(--water)', icon: '💧', hide: false },
    { key: 'Calories', v: nut.cal >= cGoal * 0.8, color: 'var(--warning)', icon: '🍽️', hide: false },
    { key: 'Habits', v: totalH ? doneH > 0 : 'skip', color: 'var(--success)', icon: '✅', hide: !totalH },
    { key: 'Tasks', v: (S.tasks || []).length ? doneT.length > 0 : 'skip', color: 'var(--danger)', icon: '⚔️', hide: !(S.tasks || []).length },
    { key: 'Workout', v: (S.workouts || []).some((w) => w.date === t), color: 'var(--energy)', icon: '🏋️', hide: false },
    { key: 'Quests', v: (S.quests.list || []).length ? (S.quests.list || []).every((q) => q.done) : 'skip', color: 'var(--primary)', icon: '⭐', hide: !(S.quests.list || []).length },
    { key: 'Mind', v: studyMins >= 1 || zenMins >= 1, color: 'var(--primary)', icon: '🧘', hide: false },
  ];
  const active = goalDefs.filter((g) => !g.hide);
  const goalCount = active.filter((g) => g.v === true).length;
  const ringPct = active.length ? goalCount / active.length : 0;

  const incompleteQ = (S.quests.list || []).filter((q) => !q.done);
  const bonusQ = (S.bonusTasks?.list || []).filter((q) => !q.done);
  const allQDone = incompleteQ.length === 0;
  const showQ = allQDone ? bonusQ.slice(0, 3) : incompleteQ.slice(0, 3);
  const questLabel = allQDone ? 'Bonus Tasks' : 'Active Quests';

  const earned = earnedIds();
  const achPct = Math.round((earned.size / ACHIEVEMENTS.length) * 100);
  const steps = stepsToday();
  const wToday = (S.weightLog || []).filter((w) => w.date === t).pop();
  const rest = isRestDay(t);
  const moodLogged = (S.mood.entries || []).some((e) => e.date === t);

  host.innerHTML = `
  <!-- HERO -->
  <div class="card mb12" style="padding:16px">
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">${greet} 👋</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-size:22px;font-weight:700;font-family:var(--font-display)">${escapeHtml(name)}</div>
      <div id="dash-avatar" style="width:46px;height:46px;border-radius:50%;overflow:hidden;border:2px solid ${rc};cursor:pointer;flex-shrink:0">
        ${S.profilePic ? `<img src="${S.profilePic}" alt="" style="width:100%;height:100%;object-fit:cover">`
          : `<div style="width:100%;height:100%;background:${rc}22;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:${rc}">${escapeHtml(((name || 'H')[0] || 'H').toUpperCase())}</div>`}
      </div>
    </div>
    <div class="flex-between">
      <div><div style="font-size:11px;color:var(--text-muted)">STREAK</div>
      <div style="font-size:18px;font-weight:800"><div>🔥</div><div>${streak}d</div></div></div>
      <div class="text-center"><div style="font-size:11px;color:var(--text-muted)">Level ${p.level}</div>
      <div id="dash-rank" title="Rank" style="font-size:20px;font-weight:800;font-family:var(--font-display);color:${rc};cursor:pointer">RANK ${escapeHtml(p.rank)}</div>
      <div style="font-size:10px;color:var(--text-muted)">${RANK_NAMES[p.rank] || ''}</div></div>
    </div>
  </div>

  <!-- LEVEL RING + PROGRESS -->
  <div class="grid2 mb12">
    <div class="card-sm text-center">
      ${ring(64, p.level, Math.min(1, p.xp / xpNeed), 'var(--primary)')}
      <div style="font-size:13px;font-weight:700" class="mt8">Level ${p.level}</div>
      <div style="font-size:11px;color:var(--text-muted)">${p.xp} / ${xpNeed} XP</div>
    </div>
    <div class="card-sm">
      <div style="font-size:12px;font-weight:600">⚡ Today's Progress</div>
      <div style="font-size:34px;font-weight:800;font-family:var(--font-display);color:var(--primary);line-height:1">${goalCount}<span style="font-size:16px;font-family:var(--font-display);color:var(--text-muted)">/${active.length}</span></div>
      <div class="xp-bar-wrap" style="height:8px"><div class="xp-bar" style="width:${Math.round(ringPct * 100)}%;background:linear-gradient(90deg,var(--primary),var(--success))"></div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:4px;font-size:11px">
        ${active.map((g) => {
          const met = g.v === true;
          return `<div style="display:flex;align-items:center;gap:4px;color:${g.color}">`
            + `<span style="width:14px;height:14px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;background:${met ? 'var(--success)' : 'transparent'};border:1.5px solid ${met ? 'var(--success)' : 'currentColor'};color:${met ? '#000' : 'transparent'};flex-shrink:0">${met ? '✓' : ''}</span>`
            + `${g.key}</div>`;
        }).join('')}
      </div>
    </div>
  </div>

  <!-- CHARACTER CARD -->
  <div class="card mb12" id="dash-char" style="padding:0;overflow:hidden"></div>

  <!-- TODAY BLOCKS -->
  <div class="flex-between mb8"><div class="section-title" style="margin:0">Today</div>
  <div style="font-size:11px;color:var(--text-muted)">tap a block →</div></div>
  <div class="stat-blocks mb12" id="dash-blocks"></div>

  <!-- QUESTS -->
  <div class="flex-between mb8"><div class="section-title" style="margin:0">${questLabel} ${allQDone ? '<span style="font-size:10px;color:var(--success)">✓ All done!</span>' : ''}</div>
  <button class="btn btn-sm" style="font-size:11px" id="dash-qs">View all</button></div>
  <div id="dash-quests" class="mb12"></div>

  <!-- MOOD -->
  <div class="card mood-card">
    <div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0;margin-bottom:8px">
      <div style="font-size:11px;color:var(--text-primary);font-weight:600">How was your mood today?</div>
      <div style="font-size:9px;color:var(--text-muted)">${moodLogged ? 'Logged ✓' : '+5 XP'}</div>
    </div>
    <div class="mood-grid" id="dash-moods"></div>
    <div style="text-align:center;margin-top:6px">
      <button class="btn btn-sm" id="dash-moodan" style="font-size:10px;padding:4px 12px">📊 Mood Analytics</button>
    </div>
  </div>

  <!-- ACHIEVEMENTS + STEPS -->
  <div class="grid2 mb12">
    <div class="card-sm text-center" id="dash-ach" style="cursor:pointer">
      <div style="font-size:20px;line-height:1;margin-bottom:6px">🏆</div>
      ${ring(84, `${earned.size}/${ACHIEVEMENTS.length}`, earned.size / ACHIEVEMENTS.length, 'var(--warning)')}
      <div style="font-size:11px;color:var(--text-muted)" class="mt8">${achPct}% complete</div>
    </div>
    <div class="card-sm text-center">
      <div style="font-size:11px;color:var(--text-muted)">🚶 Steps Today</div>
      <div style="font-size:24px;font-weight:700;color:var(--energy)">${steps}<span style="font-size:13px;color:var(--text-muted)"> steps</span></div>
      <div style="font-size:10px;color:var(--text-muted)">~${Math.round(steps * 0.04)} kcal burned</div>
      <div class="flex gap8 mt8"><input type="number" id="steps-input" placeholder="add steps" min="0" style="text-align:center;flex:1;min-width:0" aria-label="Add steps">
      <button class="btn btn-primary btn-sm" id="steps-add">+Add</button></div>
    </div>
  </div>

  <!-- REST + WEIGHT -->
  <div class="grid2 mb12">
    <div class="card-sm text-center">
      <div style="font-size:11px;color:var(--text-muted)">${rest ? '🛌 Resting Today' : '🛌 Rest Day'}</div>
      <div style="font-size:22px;font-weight:700">${rest ? 'Resting' : 'Active'}</div>
      <div style="font-size:10px;color:var(--text-muted)">${rest ? 'No XP deduction' : 'Max 3/week (Mon–Sat)'}</div>
      <button class="btn btn-sm ${rest ? 'btn-primary' : 'btn-ghost'} mt8" id="dash-rest">${rest ? '✓ Set' : 'Set Rest'}</button>
    </div>
    <div class="card-sm text-center">
      <div style="font-size:11px;color:var(--text-muted)">⚖️ Log Today's Weight</div>
      <div style="font-size:22px;font-weight:700" id="dash-weight-val">${wToday ? `${wToday.kg} kg` : '— kg'}</div>
      <div class="flex gap8 mt8"><input type="number" id="dw-input" placeholder="kg" min="20" max="400" step="0.1" style="text-align:center;flex:1;min-width:0" aria-label="Weight in kg">
      <button class="btn btn-primary btn-sm" id="dw-log">Log</button></div>
      <div id="dash-wdetail" style="font-size:11px;color:var(--info);margin-top:6px;cursor:pointer">Tap for details →</div>
    </div>
  </div>`;

  /* Character card body */
  paintChar(host.querySelector('#dash-char'), rc);

  /* TODAY blocks — V1 anatomy, uniform component (no overflow) */
  const blocks = [
    { icon: icon('drop'), color: 'var(--water)', label: 'Water', value: `${Math.round(water / 100) / 10}/${Math.round(wGoal / 100) / 10}L`, bar: Math.min(100, Math.round((water / wGoal) * 100)), go: 'water' },
    { icon: icon('nutrition'), color: 'var(--warning)', label: 'Cal', value: `${nut.cal}/${cGoal}`, bar: Math.min(100, Math.round((nut.cal / cGoal) * 100)), go: 'nutrition' },
    { icon: icon('flame'), color: net <= 0 ? 'var(--success)' : 'var(--danger)', label: 'Net Cal', value: `${net > 0 ? '+' : ''}${net}`, bar: null, go: ['workout', 'burn'] },
    { icon: icon('checkSquare'), color: 'var(--success)', label: 'Habits', value: `${doneH}/${totalH}`, bar: null, go: 'habits' },
    { icon: icon('tasks'), color: 'var(--info)', label: 'Tasks', value: `${doneT.length}/${dueTasks.length + doneT.length}`, bar: null, go: 'tasks' },
    { icon: icon('lotus'), color: 'var(--primary)', label: 'Mind', value: `${zenMins}z ${studyMins}s`, bar: null, go: 'mind' },
  ];
  const bb = host.querySelector('#dash-blocks');
  blocks.forEach((b) => {
    const d = document.createElement('div');
    d.className = 'stat-block';
    d.setAttribute('role', 'button');
    d.setAttribute('tabindex', '0');
    d.setAttribute('aria-label', `${b.label}: ${b.value}`);
    d.innerHTML = `<div class="sb-top"><span class="sb-icon" style="color:${b.color}">${b.icon}</span>`
      + `<span class="sb-label" style="color:${b.color}">${b.label}</span>`
      + `<span class="sb-value" style="color:${b.color}">${escapeHtml(String(b.value))}</span></div>`
      + (b.bar != null ? `<div class="stat-bar-wrap"><div class="stat-bar" style="width:${b.bar}%;background:${b.color}"></div></div>` : '');
    const go = () => (Array.isArray(b.go) ? window.ZF.go(b.go[0], b.go[1]) : window.ZF.go(b.go));
    d.onclick = go;
    d.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    bb.appendChild(d);
  });

  /* Quests preview — whole row clickable, all-done states */
  const qb = host.querySelector('#dash-quests');
  const qkey = allQDone ? 'bonusTasks' : 'quests';
  if (!showQ.length) {
    qb.innerHTML = '<div class="card-sm" style="text-align:center;padding:10px;color:var(--success);font-size:12px">🎉 All done!</div>';
  }
  showQ.forEach((q) => {
    const idx = (allQDone ? S.bonusTasks.list : S.quests.list).indexOf(q);
    const row = document.createElement('div');
    row.className = `quest-card${q.done ? ' done' : ''}`;
    row.style.cursor = 'pointer';
    if (q.done) row.style.opacity = '.5';
    row.innerHTML = `<span style="font-size:18px;width:24px">${escapeHtml(q.icon || '⚡')}</span>`
      + `<div style="flex:1"><div style="font-size:13px">${escapeHtml(q.title || q.text)}</div>`
      + `<div style="font-size:11px;color:var(--text-muted)">+${q.xp} XP</div></div>`
      + `<div class="quest-check${q.done ? ' done' : ''}" style="flex-shrink:0">${q.done ? '✓' : ''}</div>`;
    row.onclick = () => completeQuest(qkey, idx);
    qb.appendChild(row);
  });
  host.querySelector('#dash-qs').onclick = () => window.ZF.go('quests');

  /* Mood — twemoji buttons, selected state */
  const todayMood = (S.mood.entries || []).find((e) => e.date === t)?.mood;
  const mg = host.querySelector('#dash-moods');
  mg.innerHTML = MOODS.map((m) => {
    const sel = todayMood === m.key;
    return `<button class="mood-btn${sel ? ' sel' : ''}" data-dmood="${m.key}" title="${m.label}"`
      + ` style="${sel ? `--mood-c:${m.color};--mood-bg:${m.color}22` : ''}">${moodImgs(m)}</button>`;
  }).join('');
  mg.querySelectorAll('[data-dmood]').forEach((b) => {
    b.onclick = () => { logMoodDay(b.dataset.dmood); };
  });
  host.querySelector('#dash-moodan').onclick = () => window.ZF.go('analytics', 'mood');
  host.querySelector('#dash-ach').onclick = () => window.ZF.go('achievements');

  /* Steps */
  onEnter(host.querySelector('#dw-input'), () => host.querySelector('#dw-log').click());
  onEnter(host.querySelector('#steps-input'), () => host.querySelector('#steps-add').click());
  host.querySelector('#steps-add').onclick = () => {
    const v = sanitizeNumber(host.querySelector('#steps-input').value, { min: 0, max: 200000, fallback: NaN, integer: true });
    if (!Number.isFinite(v) || v <= 0) { showNotif('Enter a valid step count', '!'); return; }
    update((s) => {
      s.steps = s.steps || [];
      const ex = s.steps.findIndex((e) => e.date === t);
      const total = ex >= 0 ? s.steps[ex].steps + v : v;
      if (ex >= 0) s.steps[ex].steps = total; else s.steps.push({ date: t, steps: v });
      s.burned = s.burned || [];
      const bi = s.burned.findIndex((e) => e.date === t && e.source === 'steps');
      const cal = Math.round(total * 0.04);
      if (bi >= 0) s.burned[bi].calories = cal;
      else s.burned.push({ activity: 'steps', duration: 0, met: 2, weightKg: latestWeight(), calories: cal, date: t, ts: Date.now(), source: 'steps' });
    });
    showNotif(`+${v} steps`, 'OK');
  };

  /* Rest */
  host.querySelector('#dash-rest') && (host.querySelector('#dash-rest').onclick = () => {
    if ((S.restDays || []).includes(t)) { showNotif('Already set as rest day for today', '🛌'); return; }
    if (weekRestCount(t) >= 3) { showNotif('Max 3 rest days per week (Mon-Sat)', '!'); return; }
    update((s) => { s.restDays = [...(s.restDays || []), t]; });
    showNotif('Today is a rest day — no XP deduction', '🛌');
  });

  /* Weight (V1: once per day, syncs profile+player, no XP) */
  host.querySelector('#dw-log').onclick = () => {
    const kg = sanitizeNumber(host.querySelector('#dw-input').value, { min: 20, max: 400, fallback: NaN });
    if (!Number.isFinite(kg)) { showNotif('Enter a valid weight (20–400 kg)', '!'); return; }
    if ((S.weightLog || []).some((w) => w.date === t)) { showNotif('Weight already logged for today', '⚖️'); return; }
    update((s) => {
      s.weightLog = [...(s.weightLog || []), { date: t, kg }];
      s.profile.weightKg = kg; s.player.weightKg = kg;
    });
    checkAchievements();
    showNotif(`Weight logged: ${kg}kg · Profile updated ✓`, '⚖️');
  };

  /* Hidden admin entry: 5 taps on rank (owner only + password) */
  let taps = 0, tapTimer = null;
  host.querySelector('#dash-rank').onclick = () => {
    taps++;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { taps = 0; }, 1500);
    if (taps >= 5) { taps = 0; window.ZF.go('admin'); }
  };
  host.querySelector('#dash-avatar').onclick = () => window.ZF.go('profile');

  /* Weight details → history overlay */
  host.querySelector('#dash-wdetail').onclick = () => {
    const log = (S.weightLog || []).slice().reverse().slice(0, 14);
    const vals = (S.weightLog || []).map((w) => w.kg);
    const min = Math.min(...vals), max = Math.max(...vals);
    const delta = vals.length >= 2 ? (vals[vals.length - 1] - vals[0]).toFixed(1) : '—';
    openOverlay(`<div style="text-align:left;max-height:70vh;overflow-y:auto">
      <div style="font-size:15px;font-weight:700;margin-bottom:4px">⚖️ Weight History</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Range ${min}–${max} kg · change ${delta} kg</div>
      ${log.map((w) => `<div class="flex-between mb8"><span style="font-size:13px">${escapeHtml(w.date)}</span><strong>${w.kg} kg</strong></div>`).join('') || '<div style="font-size:13px;color:var(--text-muted)">No entries yet.</div>'}
      <button class="btn btn-ghost btn-full mt12" onclick="document.getElementById('zf-overlay')?.remove()">Close</button></div>`);
  };
}

function zenStreak() {
  return S.zen?.currentStreak || 0;
}

function ring(size, center, frac, color) {
  const r = 26, c = 2 * Math.PI * r;
  return `<div style="position:relative;width:${size}px;height:${size}px;margin:0 auto">`
    + `<svg width="${size}" height="${size}" viewBox="0 0 64 64" style="transform:rotate(-90deg);display:block">`
    + `<circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--bg-overlay)" stroke-width="7"/>`
    + `<circle cx="32" cy="32" r="${r}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"`
    + ` stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.min(1, Math.max(0, frac)))}"/></svg>`
    + `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;white-space:nowrap">${escapeHtml(String(center))}</div></div>`;
}

function paintChar(box, rc) {
  const p = S.player;
  const xpNeed = xpForLevel(p.level);
  const xpPct = xpNeed > 0 ? Math.min(100, Math.round((p.xp / xpNeed) * 100)) : 0;
  const stats = p.stats || {};
  const order = ['E', 'D', 'C', 'B', 'A', 'S'];
  const cur = order.indexOf(p.rank);
  // V1: card starts expanded; collapses when the day rolls over.
  let isCollapsed = S.collapsedSections?.['dash-char'] === true;
  try {
    const dayKey = today();
    if (localStorage.getItem('zenfit_charCardDay') !== dayKey) {
      localStorage.setItem('zenfit_charCardDay', dayKey);
      isCollapsed = true;
      update((s) => { s.collapsedSections = { ...(s.collapsedSections || {}), 'dash-char': true }; }, { silent: true });
    }
  } catch { /* private mode — keep persisted state */ }
  box.innerHTML = `
    <div class="flex-between char-head" id="dash-char-head">
      <div class="flex gap8"><span class="char-head-icon">👤</span>
      <span class="char-head-title">Character Card</span>
      <span class="badge char-rank-badge">Rank ${escapeHtml(p.rank)}</span></div>
      <span id="dash-char-chev" class="char-chev" style="${isCollapsed ? '' : 'transform:rotate(180deg)'}">▼</span>
    </div>
    <div id="dash-char-body">
      <div class="char-card-box flush">
        <div class="char-top-row">
          <div class="char-avatar-col"><div class="char-avatar-frame">
            <img id="charAvatarImg" src="${avatarSrc()}" alt="character"
              onerror="this.style.display='none';document.getElementById('charAvatarFallback').style.display='flex'">
            <div id="charAvatarFallback" class="char-fallback">${RANK_EMOJI[p.rank] || '👤'}</div>
          </div></div>
          <div class="char-stats-col">
            <div class="char-section-label">PLAYER STATS</div>
            <div style="margin-bottom:10px"><div class="flex-between char-xp-row"><span class="char-xp-label">XP</span><span class="char-xp-val">${p.xp}/${xpNeed}</span></div>
            <div class="char-stat-bar-wrap"><div class="char-stat-bar-fill" style="width:${xpPct}%;background:var(--primary)"></div></div></div>
            ${STAT_DEFS.map((s) => {
              const v = stats[s.key] ?? 10;
              return `<div class="char-stat-block"><div class="char-stat-row">`
                + `<span class="char-stat-name">${s.icon} ${s.label}</span>`
                + `<span class="char-stat-val" style="color:${s.color}">${v}</span></div>`
                + `<div class="char-stat-bar-wrap"><div class="char-stat-bar-fill" style="width:${Math.min(100, v)}%;background:${s.color}"></div></div></div>`;
            }).join('')}
          </div>
        </div>
        <div class="char-evo-wrap"><div class="char-evo-bar">
          ${order.map((r) => `<div class="char-evo-step${r === p.rank ? ' evo-current' : order.indexOf(r) < cur ? ' evo-past' : ''}"
            data-rank="${r}" style="${r === p.rank ? `border-color:${RANK_COLORS[r]};box-shadow:0 0 8px ${RANK_COLORS[r]}44` : ''}">
            <div class="char-evo-rank" style="color:${RANK_COLORS[r]}">${r}</div>
            <div class="char-evo-name">${RANK_NAMES[r]}</div></div>`).join('')}
        </div></div>
      </div>
    </div>`;
  const sync = () => {
    box.querySelector('#dash-char-body').style.display = isCollapsed ? 'none' : 'block';
    box.querySelector('#dash-char-chev').style.transform = isCollapsed ? '' : 'rotate(180deg)';
  };
  sync();
  box.querySelector('#dash-char-head').onclick = () => {
    isCollapsed = !isCollapsed;
    update((s) => { s.collapsedSections = { ...(s.collapsedSections || {}), 'dash-char': isCollapsed }; }, { silent: true });
    window.ZF.save();
    sync();
  };
  box.querySelectorAll('[data-rank]').forEach((elm) => {
    elm.onclick = (e) => {
      e.stopPropagation();
      const r = elm.dataset.rank;
      const p = S.player;
      const curIdx = ['E', 'D', 'C', 'B', 'A', 'S'].indexOf(p.rank);
      const tarIdx = ['E', 'D', 'C', 'B', 'A', 'S'].indexOf(r);
      const reqLevel = RANK_LEVELS[r];
      const isEarned = tarIdx <= curIdx;
      const isCurrent = r === p.rank;
      let xpLine = '';
      if (!isEarned) {
        let xpLeft = xpForLevel(p.level) - p.xp;
        for (let lv = p.level + 1; lv < reqLevel; lv++) xpLeft += xpForLevel(lv);
        xpLine = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px;text-align:left">`
          + `<div class="card-sm"><div style="font-size:10px;color:var(--text-muted)">CURRENT</div><div style="font-size:14px;font-weight:700">Lv ${p.level}</div></div>`
          + `<div class="card-sm"><div style="font-size:10px;color:var(--text-muted)">REQUIRED</div><div style="font-size:14px;font-weight:700">Lv ${reqLevel}</div></div>`
          + `<div class="card-sm"><div style="font-size:10px;color:var(--text-muted)">LEVELS</div><div style="font-size:14px;font-weight:700">${Math.max(0, reqLevel - p.level)} to go</div></div>`
          + `<div class="card-sm"><div style="font-size:10px;color:var(--text-muted)">~XP NEEDED</div><div style="font-size:14px;font-weight:700">${xpLeft}</div></div></div>`;
      }
      openOverlay(`<div style="font-size:36px;font-weight:900;color:${RANK_COLORS[r]}">${r}</div>
        <h2 style="font-family:var(--font-display)">${RANK_NAMES[r]}</h2>
        <p style="color:var(--text-secondary);font-size:13px">Requires level ${reqLevel} · ${isCurrent ? 'Current rank' : isEarned ? 'Earned ✓' : 'Locked'}</p>
        ${xpLine}
        <button class="btn btn-primary mt12" onclick="document.getElementById('zf-overlay')?.remove()">Close</button>`);
    };
  });
}
