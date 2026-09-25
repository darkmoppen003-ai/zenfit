/* ── ZenFit V2 · features/workout.js ───────────────────────
   V1 training system, faithfully mirrored:
   tabs Log | Plans | Burn.
   Log: summary bar, exercise form + live preview, today's log.
   Plans: builder + saved plans (Log/Edit/Copy/Delete).
   Burn: balance banner, totals, burn calculator, NLP quick log,
   auto + manual rows.
   Entries mirror V1 shapes; XP 15/8 workouts, max(10,cal/5)
   activities, calculator logs grant no XP.
────────────────────────────────────────────────────────────── */
import { S, update, deductXP, updStat } from '../core/store.js';
import { calcBurn, getTodayStr } from '../core/utils.js';
import { escapeHtml, sanitizeText, sanitizeNumber } from '../core/sanitize.js';
import { showNotif, awardXP, celebrateFirst, onEnter } from '../core/ui.js';
import { latestWeight, todayNutrition, today } from '../core/selectors.js';
import { checkAutoQuests } from './quests.js';
import { checkAchievements } from '../core/achievements.js';

let sub = 'log';
let planExercises = [];
let pendingActivity = null;

const MET_DB = {
  walk: 3.5, walking: 3.5, 'slow walk': 2.5, 'brisk walk': 4.3, 'fast walk': 5.0,
  jog: 7.0, jogging: 7.0, run: 9.8, running: 9.8, sprint: 16.0,
  cycle: 6.8, cycling: 6.8, bicycle: 6.8, biking: 6.8, 'fast cycle': 10.0,
  'weight training': 3.5, weights: 3.5, 'strength training': 3.5, bodyweight: 4.0,
  pushups: 3.8, pullups: 4.0, squats: 5.0, hiit: 10.0, tabata: 11.0,
  'circuit training': 8.0, crossfit: 9.0, elliptical: 5.0, treadmill: 7.0,
  rowing: 7.0, stairmaster: 9.0, 'jump rope': 11.0, 'stationary bike': 6.8, spinning: 8.5,
  football: 8.0, soccer: 8.0, basketball: 7.5, cricket: 4.5, badminton: 5.5,
  tennis: 7.0, swimming: 7.0, yoga: 2.5, pilates: 3.5, stretching: 2.0,
  stairs: 8.0, 'stair climbing': 8.0, dancing: 5.0, housework: 3.0,
  burpees: 9.0, 'mountain climbers': 8.0, 'box jumps': 9.5, plank: 3.0,
  boxing: 10.0, kickboxing: 9.5, 'martial arts': 8.0, zumba: 6.5, aerobics: 6.0,
  abs: 4.0, core: 4.0, crunches: 3.5, deadlift: 6.0, 'bench press': 5.0, 'shoulder press': 4.5,
  'brisk walk': 4.3, 'fast walk': 5.0, swimming: 7.0, tennis: 7.3, football: 8.0,
  basketball: 8.0, badminton: 5.5, volleyball: 4.0, cricket: 5.0, stretching: 2.5,
  pilates: 3.0, dance: 5.5, zumba: 6.0, boxing: 9.0, kickboxing: 10.0,
  'martial arts': 8.0, 'stair climbing': 9.0, custom: 5.0,
};

/** V1 lookupMET: EXERCISE_DB exact → includes → MET_DB exact → includes → type default. */
export function lookupMET(name, type) {
  const n = (name || '').toLowerCase();
  let met = 0;
  const exdb = (typeof window !== 'undefined' && window.EXERCISE_DB) || {};
  if (exdb) {
    met = exdb[n] || 0;
    if (!met) {
      for (const [k, v] of Object.entries(exdb)) {
        if (n.includes(k) || k.includes(n)) { met = v; break; }
      }
    }
  }
  if (!met) met = MET_DB[n];
  if (!met) {
    for (const [k, v] of Object.entries(MET_DB)) {
      if (n.includes(k) || k.includes(n)) { met = v; break; }
    }
  }
  if (!met) met = type === 'Cardio' ? 7 : type === 'HIIT' ? 10 : type === 'Yoga' ? 3 : type === 'Body Weight' ? 4 : type === 'Dance' ? 5.5 : 3.5;
  return met;
}

/** V1 parseActivityNLP — longest MET_DB match, speed/incline modifiers. */
export function parseActivityNLP(text) {
  const t = sanitizeText(text, 200).toLowerCase();
  let duration = 0;
  const dm = t.match(/(\d+\.?\d*)\s*(min|minute|minutes|mins|hr|hour|hours|h\b)/);
  if (dm) { duration = parseFloat(dm[1]); if (dm[2].startsWith('h')) duration *= 60; }
  let inclineDeg = 0;
  const im = t.match(/(\d+\.?\d*)\s*(degree|deg|%|percent)?\s*(incline|grade|slope)/);
  if (im) { inclineDeg = parseFloat(im[1]); if (im[2] === '%') inclineDeg = Math.atan(inclineDeg / 100) * (180 / Math.PI); }
  let speedKmh = 0;
  const sm = t.match(/(\d+\.?\d*)\s*(km\/h|kmh|kph|mph)/);
  if (sm) { speedKmh = parseFloat(sm[1]); if (sm[2] === 'mph') speedKmh *= 1.609; }
  let met = 4.0, actName = 'activity', bl = 0;
  for (const [k, v] of Object.entries(MET_DB)) {
    if (t.includes(k) && k.length > bl) { met = v; actName = k; bl = k.length; }
  }
  if (actName.includes('walk')) {
    if (speedKmh >= 7) met = 6.0;
    else if (speedKmh >= 5.5) met = 5.0;
    else if (speedKmh >= 4.5) met = 4.3;
    else if (speedKmh > 0) met = 2.5;
  }
  if (actName.includes('run') || actName.includes('jog')) {
    if (speedKmh >= 16) met = 16.0;
    else if (speedKmh >= 13) met = 12.5;
    else if (speedKmh >= 10) met = 10.0;
    else if (speedKmh >= 8) met = 8.5;
    else if (speedKmh >= 6) met = 7.0;
  }
  if (inclineDeg > 0) met = Math.min(met * (1 + (inclineDeg * 0.1) / 5), 20);
  return { actName, duration, met, inclineDeg, speedKmh };
}

export function getTDEEfromProfile() {
  const pr = S.profile || {};
  if (!pr.heightCm || !pr.weightKg || !pr.age) return S.nutrition.dailyGoal.cal || 2000;
  return tdeeOf(pr);
}
function tdeeOf(pr) {
  const w = pr.weightKg, h = pr.heightCm, age = pr.age;
  const bmr = pr.gender === 'male'
    ? Math.round(10 * w + 6.25 * h - 5 * age + 5)
    : Math.round(10 * w + 6.25 * h - 5 * age - 161);
  const mult = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, veryactive: 1.9 };
  return Math.round(bmr * (mult[pr.activityLevel] || 1.55));
}

export function renderWorkout(host, subTab) {
  if (subTab === 'log' || subTab === 'plans' || subTab === 'burn') sub = subTab;
  host.innerHTML = `
  <div class="chart-tab-bar" data-no-swipe>
    <div class="chart-tab${sub === 'log' ? ' active' : ''}" data-wtab="log">🏋️ Log</div>
    <div class="chart-tab${sub === 'plans' ? ' active' : ''}" data-wtab="plans">📋 Plans</div>
    <div class="chart-tab${sub === 'burn' ? ' active' : ''}" data-wtab="burn">🔥 Burn</div>
  </div>
  <div id="w-body"></div>`;
  host.querySelectorAll('[data-wtab]').forEach((t) => {
    t.onclick = () => window.ZF.go('workout', t.dataset.wtab);
  });
  const body = host.querySelector('#w-body');
  if (sub === 'log') renderLog(body);
  else if (sub === 'plans') renderPlansTab(body);
  else renderBurn(body);
}

/* ── LOG ── */
function renderLog(body) {
  const t = today();
  const todayW = (S.workouts || []).filter((w) => w.date === t);
  const todayCal = todayW.reduce((a, w) => a + (w.caloriesBurned || 0), 0);
  const todaySets = todayW.reduce((a, w) => a + (w.sets || 0), 0);
  const todayVol = todayW.reduce((a, w) => a + (w.sets || 0) * (w.reps || 0) * (w.weight || 0), 0);

  body.innerHTML = `
  <div class="card mb12" style="display:flex;gap:0;padding:0;overflow:hidden">
    <div style="flex:1;padding:12px 10px;text-align:center;border-right:1px solid var(--border-mid)">
      <div style="font-size:18px;font-weight:700;font-family:var(--font-display);color:var(--danger)">${todayCal}</div>
      <div style="font-size:10px;color:var(--text-muted)">kcal burned</div></div>
    <div style="flex:1;padding:12px 10px;text-align:center;border-right:1px solid var(--border-mid)">
      <div style="font-size:18px;font-weight:700;font-family:var(--font-display);color:var(--primary)">${todaySets}</div>
      <div style="font-size:10px;color:var(--text-muted)">sets done</div></div>
    <div style="flex:1;padding:12px 10px;text-align:center;border-right:1px solid var(--border-mid)">
      <div style="font-size:18px;font-weight:700;font-family:var(--font-display);color:var(--info)">${todayW.length}</div>
      <div style="font-size:10px;color:var(--text-muted)">exercises</div></div>
    <div style="flex:1;padding:12px 10px;text-align:center;cursor:pointer" id="w-vol">
      <div style="font-size:18px;font-weight:700;font-family:var(--font-display);color:var(--warning)">${todayVol > 0 ? Math.round(todayVol / 1000) + 'k' : '-'}</div>
      <div style="font-size:10px;color:var(--water)">vol kg → Burn ↗</div></div>
  </div>
  <div class="card mb12">
    <div class="section-title">Log Exercise</div>
    <div class="grid2" style="gap:8px;margin-bottom:8px">
      <input type="text" id="w-name" placeholder="Exercise name" maxlength="80">
      <select id="w-type">
        <option>Strength</option><option>Body Weight</option><option>Cardio</option>
        <option>HIIT</option><option>Yoga</option><option>Other</option>
      </select>
      <input type="number" id="w-sets" placeholder="Sets" min="0" max="100">
      <input type="number" id="w-reps" placeholder="Reps" min="0" max="5000">
      <input type="number" id="w-weight" placeholder="Weight (kg)" min="0" max="1000" step="any">
      <input type="number" id="w-duration" placeholder="Duration (min)" min="0" max="600">
    </div>
    <textarea id="w-notes" placeholder="Notes..." style="height:40px;margin-bottom:8px" maxlength="200"></textarea>
    <div id="w-preview" style="display:none;background:var(--bg-raised);border-radius:10px;padding:12px;margin-bottom:10px;border:1px solid var(--border-mid)">
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;letter-spacing:1px">LIVE PREVIEW</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">
        <div id="wp-cal" style="font-size:22px;font-weight:800;color:var(--danger)">0<span style="font-size:12px;color:var(--text-muted);font-weight:400"> kcal</span></div>
        <div id="wp-vol" style="font-size:14px;font-weight:600;color:var(--info)"></div>
        <div id="wp-met" style="font-size:11px;color:var(--text-muted)"></div>
      </div>
      <div style="height:4px;background:var(--bg-overlay);border-radius:2px;margin-top:8px;overflow:hidden">
        <div id="wp-bar-fill" style="height:100%;background:var(--danger);width:0%;border-radius:2px;transition:width .3s"></div></div>
      <div id="wp-link" style="margin-top:8px;font-size:11px;color:var(--water);cursor:pointer"></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary" id="w-logbtn">+ Log Exercise</button>
      <button class="btn btn-sm" id="w-useplan" style="border-color:var(--primary);color:var(--primary)">Use Plan</button>
    </div>
  </div>
  <div class="section-title">Today's Log (${todayW.length})</div>
  <div id="w-today">${todayW.length === 0 ? '<div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 0"><img loading="lazy" decoding="async" src="assets/mascot/workout.png" style="width:128px;height:128px;object-fit:contain" alt=""><div style="color:var(--text-muted);font-size:13px">No exercises logged today yet.</div></div>' : ''}</div>`;

  const preview = () => wLivePreview(body);
  ['#w-name', '#w-sets', '#w-reps', '#w-weight', '#w-duration'].forEach((sel) => {
    body.querySelector(sel).oninput = preview;
  });
  body.querySelector('#w-type').onchange = (e) => {
    if (e.target.value === 'Body Weight') {
      const w = latestWeight();
      body.querySelector('#w-weight').value = w != null ? Number(w).toFixed(1) : '';
    }
    preview();
  };
  body.querySelector('#w-logbtn').onclick = () => logWorkout();
  body.querySelector('#w-useplan').onclick = () => window.ZF.go('workout', 'plans');
  body.querySelector('#w-vol').onclick = () => window.ZF.go('workout', 'burn');
  body.querySelector('#wp-link') && (body.querySelector('#wp-link').onclick = () => window.ZF.go('workout', 'burn'));

  const list = body.querySelector('#w-today');
  todayW.slice().reverse().slice(0, 20).forEach((w) => {
    const idx = S.workouts.indexOf(w);
    const cal = w.caloriesBurned || 0;
    const vol = (w.sets || 0) * (w.reps || 0) * (w.weight || 0);
    const row = document.createElement('div');
    row.className = 'card-sm mb8';
    row.innerHTML = `<div class="flex-between mb4"><div class="flex gap8">
        <span style="font-size:13px;font-weight:600">${escapeHtml(w.name)}</span>
        <span class="badge badge-purple">${escapeHtml(w.type || '')}</span></div>
        <div class="flex gap8"><span style="font-size:11px;color:var(--text-muted)">${escapeHtml(w.date || '')}</span>
        <button class="btn btn-icon btn-sm" data-wdel="${idx}" style="color:var(--danger)">×</button></div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:var(--text-secondary)">
        ${w.sets ? `<span>${w.sets} sets</span>` : ''}${w.reps ? `<span>× ${w.reps} reps</span>` : ''}
        ${w.weight ? `<span>@ ${w.weight}kg</span>` : ''}${w.duration ? `<span>${w.duration} min</span>` : ''}
        ${cal ? `<span style="color:var(--danger)">🔥 ${cal} kcal</span>` : ''}
        ${vol > 0 ? `<span style="color:var(--info)">${vol >= 1000 ? (vol / 1000).toFixed(1) + 'k' : vol} kg·vol</span>` : ''}
      </div>${w.notes ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">${escapeHtml(w.notes)}</div>` : ''}`;
    row.querySelector('[data-wdel]').onclick = () => {
      const xp = S.workouts[idx]?.xpAwarded || 0;
      update((s) => { s.workouts.splice(idx, 1); });
      if (xp > 0) deductXP(xp, 'Workout removed');
    };
    list.appendChild(row);
  });
}

function wLivePreview(body) {
  const v = (sel) => body.querySelector(sel)?.value ?? '';
  const name = sanitizeText(v('#w-name'), 80);
  const type = v('#w-type') || 'Strength';
  const sets = sanitizeNumber(v('#w-sets'), { min: 0, max: 100, fallback: 0, integer: true });
  const reps = sanitizeNumber(v('#w-reps'), { min: 0, max: 5000, fallback: 0, integer: true });
  const weight = sanitizeNumber(v('#w-weight'), { min: 0, max: 1000, fallback: 0 });
  const dur = sanitizeNumber(v('#w-duration'), { min: 0, max: 600, fallback: 0, integer: true });
  const wt = type === 'Body Weight' && weight === 0 ? latestWeight() : latestWeight();
  const effW = type === 'Body Weight' && weight === 0 ? wt : (weight || wt);
  const box = body.querySelector('#w-preview');
  if (!box) return;
  if (!name && !sets && !dur) { box.style.display = 'none'; return; }
  box.style.display = 'block';
  const met = lookupMET(name, type);
  let effDur = dur;
  if (!dur && sets > 0) effDur = sets * (weight > 0 ? 2.5 : 1.5);
  const cal = effDur > 0 ? Math.round(calcBurn(met, effDur, effW)) : 0;
  const vol = sets * reps * weight;
  const tdee = getTDEEfromProfile();
  const pct = tdee > 0 ? Math.min(100, Math.round((cal / tdee) * 100)) : 0;
  body.querySelector('#wp-cal').innerHTML = `${cal}<span style="font-size:12px;color:var(--text-muted);font-weight:400"> kcal</span>`;
  body.querySelector('#wp-vol').textContent = vol > 0 ? `${vol >= 1000 ? (vol / 1000).toFixed(1) + 'k' : vol} kg volume` : '';
  body.querySelector('#wp-met').textContent = name ? `MET ${met} · ${type}` : '';
  body.querySelector('#wp-bar-fill').style.width = `${pct}%`;
  body.querySelector('#wp-link').textContent = cal > 0 ? `≈ ${pct}% of daily burn budget → Burn ↗` : '';
}

export function logWorkout(override = null) {
  const g = (id) => document.querySelector(`#${id}`)?.value;
  const name = sanitizeText(override?.name || g('w-name') || '', 80);
  if (!name) { showNotif('Enter exercise name', '!'); return null; }
  const type = override?.type || g('w-type') || 'Strength';
  const sets = override?.sets ?? sanitizeNumber(g('w-sets'), { min: 0, max: 100, fallback: 0, integer: true });
  const wt = override?.weight ?? sanitizeNumber(g('w-weight'), { min: 0, max: 1000, fallback: 0 });
  const effectiveWeight = type === 'Body Weight' && wt === 0 ? latestWeight() : wt || latestWeight();
  let duration = override?.duration ?? sanitizeNumber(g('w-duration'), { min: 0, max: 600, fallback: 0, integer: true });
  if (!duration && sets > 0) duration = Math.round(sets * (wt > 0 ? 2.5 : 1.5));
  const met = lookupMET(name, type);
  const caloriesBurned = duration > 0 ? calcBurn(met, duration, effectiveWeight) : 0;
  const xpW = caloriesBurned > 0 ? 15 : 8;
  const day = today();
  update((s) => {
    s.workouts = [...(s.workouts || []), {
      name, type, sets,
      reps: override?.reps ?? sanitizeNumber(g('w-reps'), { min: 0, max: 5000, fallback: 0, integer: true }),
      weight: wt, duration,
      notes: sanitizeText(override?.notes || g('w-notes') || '', 200),
      date: day, ts: Date.now(), caloriesBurned, xpAwarded: xpW,
    }];
    if (caloriesBurned > 0) {
      s.burned = [...(s.burned || []), {
        activity: name, duration, met, weightKg: effectiveWeight,
        calories: caloriesBurned, date: day, ts: Date.now(), source: 'workout',
      }];
    }
  });
  celebrateFirst('workoutFirstLog', '💪 First workout logged! Let the gains begin.');
  updStat('strength', 5);
  updStat('endurance', 2);
  awardXP(xpW, 'Exercise logged');
  checkAutoQuests();
  checkAchievements();
  return { name, caloriesBurned };
}

/* ── PLANS ── */
function renderPlansTab(body) {
  const plans = S.workoutPlans || [];
  body.innerHTML = `
  <div class="card mb16">
    <div class="section-title">Create Workout Plan</div>
    <input type="text" id="plan-name" placeholder="Plan name (e.g. Push Day, Leg Day, PPL Day A...)" style="margin-bottom:8px" maxlength="80">
    <textarea id="plan-desc" placeholder="Description (optional)..." style="height:44px;margin-bottom:8px" maxlength="200"></textarea>
    <div id="plan-exercises"><div class="section-title" style="margin-top:8px">Exercises</div><div id="exercise-list"></div></div>
    <button class="btn btn-sm" id="pe-add" style="margin-bottom:12px">+ Add Exercise</button><br>
    <button class="btn btn-primary" id="plan-save">Save Plan</button>
  </div>
  <div class="section-title">My Plans (${plans.length})</div>
  ${plans.length === 0 ? '<div style="color:var(--text-muted);font-size:13px">No plans yet. Create one above!</div>' : ''}
  <div id="wp-list"></div>`;

  const drawPE = () => {
    const c = body.querySelector('#exercise-list');
    c.innerHTML = planExercises.map((ex, i) => `
      <div style="background:var(--bg-overlay);border-radius:8px;padding:10px;margin-bottom:8px">
        <div class="flex-between mb8"><span style="font-size:13px;font-weight:500">${escapeHtml(ex.name || `Exercise ${i + 1}`)}</span>
        <button class="btn btn-icon btn-sm" data-rempe="${i}" style="color:var(--danger)">×</button></div>
        <div class="grid2" style="gap:6px">
          <input type="text" placeholder="Exercise name" value="${escapeHtml(ex.name || '')}" data-pename="${i}" style="font-size:12px;padding:6px 10px" maxlength="60">
          <select data-petype="${i}" style="font-size:12px;padding:6px 10px">
            ${['Strength', 'Body Weight', 'Cardio', 'HIIT', 'Yoga', 'Other'].map((t) => `<option${ex.type === t ? ' selected' : ''}>${t}</option>`).join('')}
          </select>
          <input type="number" placeholder="Sets" value="${ex.sets || ''}" data-pesets="${i}" style="font-size:12px;padding:6px 10px" min="0">
          <input type="number" placeholder="Reps" value="${ex.reps || ''}" data-pereps="${i}" style="font-size:12px;padding:6px 10px" min="0">
          <input type="number" placeholder="Weight (kg)" value="${ex.weight || ''}" data-pewt="${i}" style="font-size:12px;padding:6px 10px" min="0">
          <input type="number" placeholder="Minutes" value="${ex.duration || ''}" data-pedur="${i}" style="font-size:12px;padding:6px 10px" min="0">
        </div></div>`).join('');
    c.querySelectorAll('[data-pename]').forEach((inp) => { inp.oninput = () => { planExercises[Number(inp.dataset.pename)].name = inp.value; }; });
    c.querySelectorAll('[data-petype]').forEach((inp) => { inp.oninput = () => { planExercises[Number(inp.dataset.petype)].type = inp.value; }; });
    c.querySelectorAll('[data-pesets]').forEach((inp) => { inp.oninput = () => { planExercises[Number(inp.dataset.pesets)].sets = +inp.value || 0; }; });
    c.querySelectorAll('[data-pereps]').forEach((inp) => { inp.oninput = () => { planExercises[Number(inp.dataset.pereps)].reps = +inp.value || 0; }; });
    c.querySelectorAll('[data-pewt]').forEach((inp) => { inp.oninput = () => { planExercises[Number(inp.dataset.pewt)].weight = +inp.value || 0; }; });
    c.querySelectorAll('[data-pedur]').forEach((inp) => { inp.oninput = () => { planExercises[Number(inp.dataset.pedur)].duration = +inp.value || 0; }; });
    c.querySelectorAll('[data-rempe]').forEach((b) => { b.onclick = () => { planExercises.splice(Number(b.dataset.rempe), 1); drawPE(); }; });
  };
  drawPE();
  body.querySelector('#pe-add').onclick = () => { planExercises.push({ name: '', type: 'Strength', sets: 0, reps: 0, weight: 0, duration: 0 }); drawPE(); };
  body.querySelector('#plan-save').onclick = () => {
    const name = sanitizeText(body.querySelector('#plan-name').value, 80);
    if (!name) { showNotif('Enter plan name', '!'); return; }
    if (!planExercises.length) { showNotif('Add at least one exercise', '!'); return; }
    update((s) => {
      s.workoutPlans = [...(s.workoutPlans || []), {
        name, description: sanitizeText(body.querySelector('#plan-desc').value, 200),
        exercises: [...planExercises], createdAt: getTodayStr(),
      }];
    });
    planExercises = [];
    showNotif(`Plan "${name}" saved!`, '📋');
  };

  const list = body.querySelector('#wp-list');
  plans.forEach((plan, i) => {
    const d = document.createElement('div');
    d.className = 'plan-card';
    d.innerHTML = `<div class="flex-between mb10">
        <div><div style="font-size:14px;font-weight:600">${escapeHtml(plan.name)}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${(plan.exercises || []).length} exercises · ~${estimatePlanDuration(plan)} min</div></div>
        <div class="flex gap8">
          <button class="btn btn-primary btn-sm" data-wplog="${i}">Log</button>
          <button class="btn btn-sm" data-wpedit="${i}" style="border-color:var(--primary);color:var(--primary)">Edit</button>
          <button class="btn btn-sm" data-wpcopy="${i}" style="border-color:var(--water);color:var(--water)">Copy</button>
          <button class="btn btn-icon btn-sm" data-wpdel="${i}" style="color:var(--danger)">×</button>
        </div></div>
      ${plan.description ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">${escapeHtml(plan.description)}</div>` : ''}
      <div style="display:flex;flex-direction:column;gap:4px">
        ${(plan.exercises || []).map((ex) => `<div style="font-size:12px;color:var(--text-secondary);padding:4px 8px;background:var(--bg-overlay);border-radius:6px;display:flex;gap:16px">
          <span style="font-weight:500;color:var(--text-primary);flex:1">${escapeHtml(ex.name || '')}</span>
          ${ex.sets ? `<span>${ex.sets} sets</span>` : ''}${ex.reps ? `<span>× ${ex.reps}</span>` : ''}
          ${ex.weight ? `<span>${ex.weight}kg</span>` : ''}${ex.duration ? `<span>${ex.duration}min</span>` : ''}</div>`).join('')}
      </div>`;
    d.querySelector('[data-wplog]').onclick = () => logPlan(i);
    d.querySelector('[data-wpedit]').onclick = () => {
      planExercises = (plan.exercises || []).map((ex) => ({ ...ex }));
      update((s) => { s.workoutPlans.splice(i, 1); });
      window.ZF.rerender();
      setTimeout(() => {
        const host = document.querySelector('#w-body');
        if (!host) return;
        host.querySelector('#plan-name').value = plan.name || '';
        host.querySelector('#plan-desc').value = plan.description || '';
        host.querySelector('#plan-name').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
      showNotif('Plan loaded — edit and save', 'OK');
    };
    d.querySelector('[data-wpcopy]').onclick = () => {
      update((s) => { s.workoutPlans = [...s.workoutPlans, { ...plan, name: `${plan.name} (copy)` }]; });
    };
    d.querySelector('[data-wpdel]').onclick = () => {
      openConfirm(`Delete "${plan.name}"?`, () => update((s) => { s.workoutPlans.splice(i, 1); }));
    };
    list.appendChild(d);
  });
}

function openConfirm(msg, onYes) {
  openOverlaySafe(`<p style="font-size:14px">${escapeHtml(msg)}</p>
    <div class="flex gap8 mt12" style="justify-content:center">
      <button class="btn btn-ghost" id="cf-no">Cancel</button>
      <button class="btn btn-danger" id="cf-yes">Delete</button></div>`);
  document.getElementById('cf-no').onclick = () => document.getElementById('zf-overlay')?.remove();
  document.getElementById('cf-yes').onclick = () => { document.getElementById('zf-overlay')?.remove(); onYes(); };
}
function openOverlaySafe(html) {
  document.getElementById('zf-overlay')?.remove();
  const o = document.createElement('div');
  o.className = 'overlay'; o.id = 'zf-overlay';
  o.innerHTML = `<div class="overlay-box">${html}</div>`;
  document.body.appendChild(o);
}

function estimatePlanDuration(plan) {
  return (plan.exercises || []).reduce((a, ex) => a + (ex.duration || (ex.sets || 3) * 2), 0);
}

export function logPlan(i) {
  const plan = (S.workoutPlans || [])[i];
  if (!plan) return;
  let totalCal = 0;
  const day = today();
  update((s) => {
    (plan.exercises || []).forEach((ex) => {
      const met = lookupMET(ex.name, ex.type);
      const dur = ex.duration || (ex.sets || 3) * 2;
      const cal = calcBurn(met, dur, s.player.weightKg || 70);
      totalCal += cal;
      s.workouts = [...s.workouts, {
        name: ex.name, type: ex.type, sets: ex.sets || 0, reps: ex.reps || 0,
        weight: ex.weight || 0, duration: dur, notes: `From plan: ${plan.name}`,
        date: day, ts: Date.now(), caloriesBurned: cal,
      }];
      if (cal > 0) {
        s.burned = [...s.burned, {
          activity: ex.name, duration: dur, met, weightKg: s.player.weightKg || 70,
          calories: cal, date: day, ts: Date.now(), source: 'workout',
        }];
      }
    });
  });
  updStat('strength', (plan.exercises || []).length);
  awardXP(Math.min(40, 10 + Math.floor(totalCal / 100)), 'Plan complete!');
  checkAutoQuests();
  checkAchievements();
  showNotif(`${plan.name}: ${totalCal} kcal`, '🔥');
}

/* ── BURN ── */
const ACT_CATS = {
  'Walking & Running': ['walk', 'brisk walk', 'fast walk', 'jog', 'run', 'sprint', 'treadmill'],
  Cycling: ['cycle', 'fast cycle'],
  'Strength & HIIT': ['weight training', 'bodyweight', 'hiit', 'tabata', 'circuit training', 'crossfit', 'pushups', 'pullups', 'squats'],
  'Sports & Recreation': ['swimming', 'tennis', 'football', 'basketball', 'badminton', 'volleyball', 'cricket'],
  Flexibility: ['yoga', 'stretching', 'pilates'],
  'Other Cardio': ['elliptical', 'stairmaster', 'rowing', 'jump rope', 'dance', 'zumba', 'boxing', 'kickboxing', 'martial arts'],
};

function renderBurn(body) {
  const t = today();
  const allT = (S.burned || []).filter((e) => e.date === t);
  const fromW = allT.filter((e) => e.source === 'workout');
  const fromA = allT.filter((e) => e.source !== 'workout');
  const total = allT.reduce((a, e) => a + (e.calories || 0), 0);
  const nut = todayNutrition();
  const tdee = getTDEEfromProfile();
  const net = nut.cal - total;
  const diff = net - tdee;
  const balClass = diff < -50 ? 'deficit' : diff > 50 ? 'surplus' : 'balanced';
  const balColor = diff < -50 ? 'var(--success)' : diff > 50 ? 'var(--danger)' : 'var(--info)';
  const balLabel = diff < -50 ? 'Deficit +' : diff > 50 ? 'Surplus -' : 'Balanced =';
  const w = latestWeight();

  body.innerHTML = `
  <div class="cal-balance-banner ${balClass}">
    <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:2px">vs Maintenance (${tdee} kcal TDEE)</div>
      <div style="font-size:28px;font-weight:800;font-family:var(--font-display);color:${balColor}">${Math.abs(diff)} kcal ${diff < 0 ? 'under' : 'over'}</div>
      <div style="font-size:12px;font-weight:600;color:${balColor}">${balLabel}</div></div>
    <div style="text-align:right;font-size:11px;color:var(--text-muted)">
      <div>Eaten: <b style="color:var(--warning)">${nut.cal}</b> kcal</div>
      <div>Burned: <b style="color:var(--danger)">${total}</b> kcal</div>
      <div>Net: <b style="color:${balColor}">${net}</b> kcal</div></div>
  </div>
  <div class="card mb12" style="padding:0;display:flex;overflow:hidden">
    <div style="flex:1;padding:12px;text-align:center;border-right:1px solid var(--border-mid)">
      <div style="font-size:20px;font-weight:700;font-family:var(--font-display);color:var(--danger)">${total}</div>
      <div style="font-size:10px;color:var(--text-muted)">total burned</div></div>
    <div style="flex:1;padding:12px;text-align:center;border-right:1px solid var(--border-mid)">
      <div style="font-size:20px;font-weight:700;font-family:var(--font-display);color:var(--primary)">${fromW.reduce((a, e) => a + (e.calories || 0), 0)}</div>
      <div style="font-size:10px;color:var(--text-muted)">from workouts</div></div>
    <div style="flex:1;padding:12px;text-align:center">
      <div style="font-size:20px;font-weight:700;font-family:var(--font-display);color:var(--warning)">${fromA.reduce((a, e) => a + (e.calories || 0), 0)}</div>
      <div style="font-size:10px;color:var(--text-muted)">manual logged</div></div>
  </div>
  <div class="card mb12">
    <div class="section-title">Calorie Burn Calculator</div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
      <label style="font-size:12px;color:var(--text-secondary);white-space:nowrap">Your weight:</label>
      <input type="number" id="calc-wt" value="${w}" min="30" max="300" style="width:80px">
      <span style="font-size:12px;color:var(--text-muted)">kg</span>
      <button class="btn btn-sm" id="calc-wtsave" style="font-size:11px">Save</button>
    </div>
    <div style="margin-bottom:8px"><label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Activity</label>
      <select id="calc-act" style="width:100%">
        ${Object.entries(ACT_CATS).map(([cat, acts]) => `<optgroup label="${cat}">${acts.map((a) => `<option value="${a}">${a.charAt(0).toUpperCase() + a.slice(1)}</option>`).join('')}</optgroup>`).join('')}
        <option value="custom">Custom (enter MET manually)</option>
      </select></div>
    <div class="grid2" style="gap:8px;margin-bottom:8px">
      <div><label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:3px">Duration (min)</label>
        <input type="number" id="calc-dur" placeholder="30" min="1" max="600"></div>
      <div><label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:3px">Intensity</label>
        <select id="calc-int"><option value="1.0">Normal</option><option value="1.2">Moderate</option><option value="1.5">Vigorous</option><option value="1.8">Max Effort</option></select></div>
    </div>
    <div id="calc-met-row" style="display:none;margin-bottom:8px">
      <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:3px">Custom MET value</label>
      <input type="number" id="calc-met-val" placeholder="e.g. 6.5" step="0.1" min="1" max="20">
      <div style="font-size:10px;color:var(--text-muted);margin-top:3px">MET 2=light, 4=moderate, 6=vigorous, 10+=intense</div></div>
    <div id="calc-result" style="background:var(--bg-raised);border-radius:10px;padding:14px;margin-bottom:10px;border:1px solid var(--border-mid)">
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Enter duration above to see estimate</div></div>
    <button class="btn btn-primary" id="calc-log">Log Activity</button>
  </div>
  <div class="card mb12">
    <div class="section-title">Quick Log (Natural Language)</div>
    <input type="text" id="cb-nlp" placeholder='e.g. "30 min run" or "45 min weights"' style="margin-bottom:8px" maxlength="200">
    <div id="cb-prev" style="margin-bottom:8px"></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary btn-sm" id="cb-preview">Preview</button>
      <button class="btn btn-primary btn-sm" id="log-act-btn" style="display:none">Log Activity</button>
    </div>
  </div>
  <div id="burn-lists"></div>`;

  const prev = () => burnCalcPreview(body);
  body.querySelector('#calc-act').onchange = prev;
  body.querySelector('#calc-dur').oninput = prev;
  body.querySelector('#calc-int').onchange = prev;
  const metVal = body.querySelector('#calc-met-val');
  metVal && (metVal.oninput = prev);
  body.querySelector('#calc-wt').oninput = prev;
  body.querySelector('#calc-wtsave').onclick = () => {
    const v = sanitizeNumber(body.querySelector('#calc-wt').value, { min: 30, max: 300, fallback: 70 });
    update((s) => { s.player.weightKg = v; s.profile.weightKg = v; }, { silent: true });
    window.ZF.save();
    showNotif('Weight saved', 'OK');
  };
  body.querySelector('#calc-log').onclick = () => {
    const act = body.querySelector('#calc-act').value || 'exercise';
    const dur = sanitizeNumber(body.querySelector('#calc-dur').value, { min: 0, max: 600, fallback: 0 });
    if (dur <= 0) { showNotif('Enter a duration first', '!'); return; }
    const intMult = parseFloat(body.querySelector('#calc-int').value) || 1.0;
    const wt = sanitizeNumber(body.querySelector('#calc-wt').value, { min: 30, max: 300, fallback: latestWeight() });
    const isCustom = act === 'custom';
    const met = (isCustom ? sanitizeNumber(body.querySelector('#calc-met-val').value, { min: 1, max: 20, fallback: 4 }) : MET_DB[act] || 4) * intMult;
    const cal = Math.round(calcBurn(met, dur, wt));
    update((s) => {
      s.burned = [...(s.burned || []), {
        activity: act, duration: dur, met, weightKg: wt, calories: cal,
        date: t, ts: Date.now(), source: 'manual',
      }];
    });
    showNotif(`${act} logged — ${cal} kcal burned`, 'OK');
  };

  onEnter(body.querySelector('#cb-nlp'), () => body.querySelector('#cb-preview').click());
  body.querySelector('#cb-preview').onclick = () => {
    const txt = sanitizeText(body.querySelector('#cb-nlp').value, 200);
    if (!txt.trim()) return;
    const wt = latestWeight();
    const parsed = parseActivityNLP(txt);
    pendingActivity = { ...parsed, text: txt, weightKg: wt };
    const cal = calcBurn(parsed.met, parsed.duration, wt);
    pendingActivity.calories = cal;
    const box = body.querySelector('#cb-prev');
    const btn = body.querySelector('#log-act-btn');
    if (parsed.duration <= 0) {
      box.innerHTML = '<div style="color:var(--danger);font-size:13px">Could not detect duration.</div>';
      btn.style.display = 'none';
      return;
    }
    box.innerHTML = `<div style="background:rgba(255,77,106,.09);border:1px solid rgba(255,77,106,.27);border-radius:8px;padding:12px">
      <div style="font-size:13px;font-weight:500;text-transform:capitalize;margin-bottom:6px">${escapeHtml(parsed.actName)} · ${parsed.duration} min · MET ${parsed.met}</div>
      <div style="font-size:18px;font-weight:800;color:var(--danger)">🔥 ${cal} kcal</div></div>`;
    btn.style.display = 'block';
  };
  body.querySelector('#log-act-btn').onclick = () => {
    if (!pendingActivity?.calories) return;
    const xpA = Math.max(10, Math.round(pendingActivity.calories / 5));
    update((s) => {
      s.burned = [...(s.burned || []), {
        activity: pendingActivity.text || pendingActivity.actName, duration: pendingActivity.duration,
        met: pendingActivity.met, weightKg: pendingActivity.weightKg, calories: pendingActivity.calories,
        date: t, ts: Date.now(), source: 'activity',
        inclineDeg: pendingActivity.inclineDeg, speedKmh: pendingActivity.speedKmh, xpAwarded: xpA,
      }];
    });
    pendingActivity = null;
    updStat('endurance', 3);
    awardXP(xpA, 'Activity burned!');
    checkAutoQuests();
    checkAchievements();
  };

  const lists = body.querySelector('#burn-lists');
  const row = (e, gi, fromW) => `
    <div class="card-sm mb8 flex gap12">
      <div style="width:34px;height:34px;background:rgba(255,77,106,.09);border:1px solid rgba(255,77,106,.27);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${fromW ? '🏋️' : '🔥'}</div>
      <div style="flex:1"><div style="font-size:13px;font-weight:500;text-transform:capitalize">${escapeHtml(e.activity)}</div>
      <div style="font-size:11px;color:var(--text-secondary)">${e.duration}min · MET ${e.met?.toFixed ? e.met.toFixed(1) : e.met || '?'} · ${e.weightKg}kg${e.inclineDeg > 0 ? ` · ${e.inclineDeg}°` : ''}</div></div>
      <div style="text-align:right;flex-shrink:0"><div style="font-size:15px;font-weight:600;color:var(--danger)">-${e.calories}</div>
      <div style="font-size:10px;color:var(--text-muted)">kcal</div></div>
      <button class="btn btn-icon btn-sm" data-bdel="${gi}" style="color:var(--danger)">×</button></div>`;
  let html2 = '';
  if (fromW.length) html2 += `<div class="section-title">From Workouts (auto)</div>` + fromW.map((e) => row(e, S.burned.indexOf(e), true)).join('');
  if (fromA.length) html2 += `<div class="section-title">Manual Activities (${fromA.length})</div>` + fromA.map((e) => row(e, S.burned.indexOf(e), false)).join('');
  if (!fromW.length && !fromA.length) html2 += '<div class="card text-center" style="color:var(--text-muted)">No burned calories yet today.</div>';
  lists.innerHTML = html2;
  lists.querySelectorAll('[data-bdel]').forEach((b) => {
    b.onclick = () => {
      const gi = Number(b.dataset.bdel);
      const xp = S.burned[gi]?.xpAwarded || 0;
      update((s) => { s.burned.splice(gi, 1); });
      if (xp > 0) deductXP(xp, 'Activity removed');
    };
  });
}

function burnCalcPreview(body) {
  const act = body.querySelector('#calc-act').value;
  const isCustom = act === 'custom';
  body.querySelector('#calc-met-row').style.display = isCustom ? 'block' : 'none';
  const dur = sanitizeNumber(body.querySelector('#calc-dur').value, { min: 0, max: 600, fallback: 0 });
  const intMult = parseFloat(body.querySelector('#calc-int').value) || 1.0;
  const wt = sanitizeNumber(body.querySelector('#calc-wt').value, { min: 30, max: 300, fallback: latestWeight() });
  let met = MET_DB[act] || MET_DB[(act || '').toLowerCase()] || 4;
  if (isCustom) met = sanitizeNumber(body.querySelector('#calc-met-val').value, { min: 1, max: 20, fallback: 4 });
  met *= intMult;
  const box = body.querySelector('#calc-result');
  if (!dur) {
    box.innerHTML = '<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Enter duration above to see estimate</div>';
    return;
  }
  const cal = Math.round(calcBurn(met, dur, wt));
  box.innerHTML = `<div style="font-size:11px;color:var(--text-muted)">ESTIMATE</div>
    <div style="font-size:24px;font-weight:800;color:var(--danger)">🔥 ${cal} <span style="font-size:12px">kcal</span></div>
    <div style="font-size:11px;color:var(--text-muted)">${escapeHtml(act)} · ${dur} min · MET ${met.toFixed(1)} · ${wt}kg</div>`;
}
