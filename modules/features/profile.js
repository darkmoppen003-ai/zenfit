/* ── ZenFit V2 · features/profile.js ───────────────────────
   V1 profile screen: identity card + photo, personal form
   (incl. country/timezone), collapsible body analytics,
   macro recommendations, achievements glance, daily goals,
   settings (notifications, sound, tutorial, data tools).
────────────────────────────────────────────────────────────── */
import { S, update, getDeviceId, APP_VERSION, APP_BUILD } from '../core/store.js';
import {
  calcBMI, bmiCategory, calcBMR, calcTDEE, calcBodyFat,
  calcIdealWeight, calcWHR, macroSplit, goalLabel,
} from '../core/utils.js';
import { COUNTRY_TZ_MAP } from '../core/countries.js';
import { escapeHtml, sanitizeText, sanitizeNumber, sanitizeEnum } from '../core/sanitize.js';
import { showNotif, sfx, collapseHeader, wireCollapsibles } from '../core/ui.js';
import { latestWeight, todayNutrition, todayWater } from '../core/selectors.js';
import { exportDataFile, importData, confirmReset } from '../core/backup.js';
import { renderNotifSettings } from '../core/notify.js';
import { LeaderboardAPI } from '../core/cloud.js';
import { earnedIds } from '../core/achievements.js';

const GOAL_OPTS = [
  ['lose', 'Lose Weight (-500 kcal)'], ['lose_aggressive', 'Aggressive Cut (-750 kcal)'],
  ['recomp', 'Body Recomposition'], ['gain', 'Gain Muscle (+350 kcal)'],
  ['performance', 'Athletic Performance'], ['heart', 'Cardiovascular Health'],
  ['maintain', 'Maintain Weight'],
];
const ACT_OPTS = [
  ['sedentary', 'Sedentary (desk job)'], ['light', 'Light (1-3 days/week)'],
  ['moderate', 'Moderate (3-5 days)'], ['active', 'Active (6-7 days)'],
  ['veryactive', 'Very Active (2x/day)'],
];

export function renderProfile(host) {
  const pr = S.profile || {};
  const p = S.player;
  const w = pr.weightKg || p.weightKg || latestWeight();
  const gender = pr.gender || 'male';
  const bmi = calcBMI(w, pr.heightCm);
  const bmiCat = bmiCategory(bmi);
  const bmr = calcBMR({ weightKg: w, heightCm: pr.heightCm, age: pr.age, gender });
  const tdee = calcTDEE(bmr, pr.activityLevel || 'moderate');
  const bf = calcBodyFat({ weightKg: w, heightCm: pr.heightCm, age: pr.age, gender });
  const ideal = calcIdealWeight(pr.heightCm, gender);
  const whr = calcWHR(pr.waistCm, pr.hipCm);
  const macros = macroSplit(tdee, pr.goal || 'maintain');
  const nut = todayNutrition();
  const water = todayWater();

  const ach = {
    meals: S.nutrition.entries.length,
    workouts: (S.workouts || []).length,
    study: (S.study.sessions || []).length,
    habits: (S.habits || []).reduce((a, h) => a + ((h.completedDates || h.doneDates || []).length), 0),
    water: (S.water.entries || []).length,
    streak: (S.habits || []).reduce((a, h) => Math.max(a, h.streak || 0), 0),
  };

  host.innerHTML = `
  <div class="section-title">Profile</div>
  <div class="card mb12" style="display:flex;align-items:center;gap:16px;padding:16px">
    <div class="profile-pic-wrap" id="pf-pic" title="Change photo">
      ${S.profilePic ? `<img src="${S.profilePic}" alt="Profile" style="width:90px;height:90px;border-radius:50%;object-fit:cover;border:2px solid var(--primary)">`
        : `<div style="width:90px;height:90px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--info));display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:700;color:#fff;border:2px solid var(--primary)">${escapeHtml(((pr.name || p.name || 'W')[0] || 'W').toUpperCase())}</div>`}
      <div class="profile-pic-edit">✎</div>
    </div>
    <div style="flex:1"><div style="font-size:18px;font-weight:700;font-family:var(--font-display)">${escapeHtml(pr.name || p.name)}</div>
    <div style="font-size:13px;color:var(--text-muted)">Level ${p.level} · Rank ${escapeHtml(p.rank)}</div>
    <button class="btn btn-sm btn-ghost mt8" id="pf-change">✎ Change Photo</button></div>
  </div>

  <div class="card mb16">
    <div class="section-title">Personal Profile</div>
    <div class="grid2" style="gap:10px;margin-bottom:12px">
      <div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px">Name</label>
        <input type="text" id="pr-name" value="${escapeHtml(pr.name || p.name || '')}" placeholder="Your name" maxlength="40"></div>
      <div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px">Age</label>
        <input type="number" id="pr-age" value="${pr.age || ''}" placeholder="Years" min="10" max="120"></div>
      <div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px">Gender</label>
        <select id="pr-gender"><option value="male"${gender === 'male' ? ' selected' : ''}>Male</option><option value="female"${gender === 'female' ? ' selected' : ''}>Female</option></select></div>
      <div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px">Height (cm)</label>
        <input type="number" id="pr-height" value="${pr.heightCm || ''}" placeholder="e.g. 175" min="120" max="230"></div>
      <div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px">Weight (kg)</label>
        <input type="number" id="pr-weight" value="${pr.weightKg || p.weightKg || ''}" placeholder="e.g. 70" min="25" max="400" step="any"></div>
      <div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px">Waist (cm) — optional</label>
        <input type="number" id="pr-waist" value="${pr.waistCm || ''}" placeholder="For WHR" min="0" max="200" step="any"></div>
      <div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px">Hip (cm) — optional</label>
        <input type="number" id="pr-hip" value="${pr.hipCm || ''}" placeholder="For WHR" min="0" max="250" step="any"></div>
      <div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px">Activity Level</label>
        <select id="pr-activity">${ACT_OPTS.map(([v, l]) => `<option value="${v}"${(pr.activityLevel || 'moderate') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px">Goal</label>
        <select id="pr-goal">${GOAL_OPTS.map(([v, l]) => `<option value="${v}"${(pr.goal || 'maintain') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <div style="grid-column:1/-1;margin-top:8px;padding-top:10px;border-top:1px solid var(--border-mid)">
        <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px">Country <span style="font-size:10px">(for accurate timezone)</span></label>
        <input type="text" id="pr-country" list="country-list" value="${escapeHtml(pr.country || '')}" placeholder="Search your country..." style="margin-top:4px" maxlength="60">
        <datalist id="country-list">${COUNTRY_TZ_MAP.map((c) => `<option value="${c.code} — ${c.name}">`).join('')}</datalist></div>
    </div>
    <button class="btn btn-primary" id="pf-save">Save Profile & Recalculate</button>
  </div>

  ${bmi > 0 ? `
  <div class="card mb16">
    ${collapseHeader('body-analytics', 'Body Analytics', '📊', 'BMI, BMR, TDEE & more')}
    <div class="collapsible-body${isCollapsed('body-analytics') ? ' collapsed' : ''}" id="body-analytics">
      <div class="grid3 mb16 mt12">
        <div class="card-sm" style="text-align:center"><div style="font-size:11px;color:var(--text-muted)">BMI</div>
          <div style="font-size:22px;font-weight:700;font-family:var(--font-display);color:${bmiCat.color};margin:4px 0">${bmi}</div>
          <div style="font-size:12px;color:${bmiCat.color};font-weight:500">${bmiCat.label}</div></div>
        <div class="card-sm" style="text-align:center"><div style="font-size:11px;color:var(--text-muted)">BMR</div>
          <div style="font-size:22px;font-weight:700;font-family:var(--font-display);color:var(--info);margin:4px 0">${bmr}</div>
          <div style="font-size:12px;color:var(--text-muted)">kcal/day at rest</div></div>
        <div class="card-sm" style="text-align:center"><div style="font-size:11px;color:var(--text-muted)">TDEE</div>
          <div style="font-size:22px;font-weight:700;font-family:var(--font-display);color:var(--warning);margin:4px 0">${tdee}</div>
          <div style="font-size:12px;color:var(--text-muted)">maintenance kcal</div></div>
        <div class="card-sm" style="text-align:center"><div style="font-size:11px;color:var(--text-muted)">Body Fat %</div>
          <div style="font-size:22px;font-weight:700;font-family:var(--font-display);color:var(--primary);margin:4px 0">${bf || '—'}${bf ? '%' : ''}</div>
          <div style="font-size:12px;color:var(--text-muted)">estimated</div></div>
        <div class="card-sm" style="text-align:center"><div style="font-size:11px;color:var(--text-muted)">Ideal Weight</div>
          <div style="font-size:22px;font-weight:700;font-family:var(--font-display);color:var(--success);margin:4px 0">${ideal || '—'}${ideal ? 'kg' : ''}</div>
          <div style="font-size:12px;color:var(--text-muted)">Devine formula</div></div>
        <div class="card-sm" style="text-align:center"><div style="font-size:11px;color:var(--text-muted)">WHR</div>
          <div style="font-size:22px;font-weight:700;font-family:var(--font-display);color:var(--water);margin:4px 0">${whr || '—'}</div>
          <div style="font-size:12px;color:var(--text-muted)">waist-to-hip</div></div>
      </div>
    </div>
  </div>` : ''}

  <div class="card mb16">
    ${collapseHeader('macros', 'Recommended Macros', '🥗', `For ${goalLabel(pr.goal)} (${macros.cal >= tdee ? '+' : ''}${macros.cal - tdee} kcal/day)`)}
    <div class="collapsible-body${isCollapsed('macros') ? ' collapsed' : ''}" id="macros">
      <div class="food-detail-grid mt12">
        <div class="food-detail-item"><div class="fdv" style="color:var(--warning)">${macros.cal}</div><div class="fdl">kcal/day</div></div>
        <div class="food-detail-item"><div class="fdv" style="color:var(--danger)">${macros.protein}g</div><div class="fdl">per day</div></div>
        <div class="food-detail-item"><div class="fdv" style="color:var(--info)">${macros.carbs}g</div><div class="fdl">per day</div></div>
        <div class="food-detail-item"><div class="fdv" style="color:var(--primary)">${macros.fat}g</div><div class="fdl">per day</div></div>
        <div class="food-detail-item"><div class="fdv" style="color:#7c3aed">${macros.sugar}g</div><div class="fdl">per day</div></div>
      </div>
      <button class="btn btn-primary btn-sm mt12" id="pf-applymacros">Apply These Macros to Goals →</button>
    </div>
  </div>

  <div class="card mb16">
    ${collapseHeader('ach glance', 'Achievements', '🏆', 'Your progress at a glance')}
    <div class="collapsible-body${isCollapsed('ach glance') ? ' collapsed' : ''}" id="ach glance">
      <div class="grid3 mt12">
        ${aB('🍽️', nut.count + '<br>Meals')} ${aB('🏋️', (S.workouts || []).length + '<br>Workouts')}
        ${aB('📚', (S.study.sessions || []).length + '<br>Study Sessions')} ${aB('✅', ach.habits + '<br>Habits Done')}
        ${aB('💧', (S.water.entries || []).length + '<br>Water Logs')} ${aB('🔥', ach.streak + '<br>Best Streak')}
      </div>
      <button class="btn btn-sm btn-ghost btn-full mt8" id="pf-ach">View all ${earnedIds().size}/43 →</button>
    </div>
  </div>

  <div class="card mb16">
    ${collapseHeader('daily-goals', 'Daily Goals', '🎯', 'Calorie, protein & water targets')}
    <div class="collapsible-body${isCollapsed('daily-goals') ? ' collapsed' : ''}" id="daily-goals">
      <div class="mt12" style="display:flex;flex-direction:column;gap:10px">
        ${goalRow('Daily Calorie Goal', 'dg-cal', S.nutrition.dailyGoal.cal, 'kcal', nut.cal)}
        ${goalRow('Protein Goal', 'dg-pro', S.nutrition.dailyGoal.protein, 'g', Math.round(nut.protein))}
        ${goalRow('Fiber Goal', 'dg-fib', S.nutrition.dailyGoal.fiber, 'g', Math.round(nut.fiber))}
        ${goalRow('Sugar Goal', 'dg-sug', S.nutrition.dailyGoal.sugar, 'g', Math.round(nut.sugar))}
        ${goalRow('Water Goal', 'dg-wat', S.water.dailyGoalMl, 'ml', water)}
      </div>
    </div>
  </div>

  <div class="section-title">Settings</div>
  <div class="card mb16">
    <div style="margin-top:4px">
      ${collapseHeader('notif-collapse', 'Notification Settings', '🔔', 'Local reminders & system alerts')}
      <div class="collapsible-body${isCollapsed('notif-collapse') ? ' collapsed' : ''}" id="notif-collapse">
        <div id="notif-settings-box" class="mt12"></div>
      </div>
    </div>
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border-mid)">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div><div style="font-size:13px;font-weight:600">🔊 Sound Effects</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Futuristic system sounds for notifications, achievements & navigation</div></div>
        <label style="position:relative;display:inline-block;width:42px;height:24px;flex-shrink:0;margin-left:12px">
          <input type="checkbox" id="sound-toggle" ${S.soundEnabled !== false ? 'checked' : ''} style="opacity:0;width:0;height:0">
          <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${S.soundEnabled !== false ? 'var(--primary-dark)' : 'var(--bg-overlay)'};border-radius:24px;transition:.3s;border:1px solid var(--border-strong)">
          <span style="position:absolute;height:18px;width:18px;left:${S.soundEnabled !== false ? '20px' : '3px'};bottom:2px;background:#fff;border-radius:50%;transition:.3s"></span></span>
        </label></div>
    </div>
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border-mid)">
      <button class="btn btn-full" id="pf-tutorial">🎓 Review Tutorial</button>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px">Replay the full onboarding and navigation guide anytime</div>
    </div>
  </div>

  <div class="section-title">Data Management</div>
  <div class="card"><div class="flex gap8 flex-wrap">
      <button class="btn btn-sm" id="pf-export">Share / Export</button>
      <label class="btn btn-sm" style="cursor:pointer">Import Backup<input type="file" id="pf-import" accept=".json,.zip" style="display:none"></label>
      <button class="btn btn-sm btn-danger" id="pf-reset">Reset All Data</button>
    </div>
    <div style="font-size:11px;color:var(--text-muted)" class="mt8">Share or Export your data as a .json backup file. Import it on another device to restore your progress. Device: ${escapeHtml(getDeviceId())}</div></div>

  <div style="text-align:center;padding:20px 0 8px;color:var(--text-muted);font-size:11px">
    <div style="margin-bottom:4px;font-weight:600;color:var(--text-secondary)">ZenFit Health RPG</div>
    <div id="pf-ver">v${APP_VERSION} · Build ${APP_BUILD}</div>
    <button class="btn btn-sm mt8" id="pf-update" style="border-color:var(--primary);color:var(--primary);font-size:11px">🔄 Check for Update</button>
  </div>`;

  function goalRow(label, id, val, unit, todayVal) {
    return `<div class="flex-between"><span style="font-size:13px">${label} <span style="color:var(--text-muted);font-size:11px">(today ${todayVal}${unit})</span></span>
      <div class="flex gap8"><input type="number" id="${id}" value="${val}" style="width:90px;text-align:right">
      <span style="font-size:12px;color:var(--text-secondary)">${unit}</span></div></div>`;
  }
  function aB(icon, val) {
    return `<div class="card-sm" style="text-align:center"><div style="font-size:20px;margin-bottom:4px">${icon}</div>`
      + `<div style="font-size:18px;font-weight:700;font-family:var(--font-display);color:var(--primary)">${val}</div></div>`;
  }
  function isCollapsed(key) {
    return !!(S.collapsedSections && S.collapsedSections[key]);
  }

  wireCollapsibles(host);

  renderNotifSettings(host.querySelector('#notif-settings-box'));

  const pickPhoto = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return;
      if (f.size > 10 * 1024 * 1024) { showNotif('Image too large — max 10MB', '!'); return; }
      const r = new FileReader();
      r.onload = () => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          const scale = Math.min(1, 512 / Math.max(img.width, img.height));
          c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          update((s) => { s.profilePic = c.toDataURL('image/jpeg', 0.85); });
          showNotif('Profile photo updated', 'OK');
        };
        img.src = String(r.result);
      };
      r.readAsDataURL(f);
    };
    inp.click();
  };
  host.querySelector('#pf-pic').onclick = pickPhoto;
  host.querySelector('#pf-change').onclick = pickPhoto;

  host.querySelector('#pf-save').onclick = () => {
    const countryRaw = sanitizeText(host.querySelector('#pr-country').value, 60);
    update((s) => {
      s.profile = {
        ...(s.profile || {}),
        filled: true,
        name: sanitizeText(host.querySelector('#pr-name').value, 40),
        age: sanitizeNumber(host.querySelector('#pr-age').value, { min: 0, max: 120, fallback: 0, integer: true }),
        gender: sanitizeEnum(host.querySelector('#pr-gender').value, ['male', 'female'], 'male'),
        heightCm: sanitizeNumber(host.querySelector('#pr-height').value, { min: 0, max: 230, fallback: 0, integer: true }),
        weightKg: sanitizeNumber(host.querySelector('#pr-weight').value, { min: 0, max: 400, fallback: 0 }),
        waistCm: sanitizeNumber(host.querySelector('#pr-waist').value, { min: 0, max: 200, fallback: 0 }),
        hipCm: sanitizeNumber(host.querySelector('#pr-hip').value, { min: 0, max: 250, fallback: 0 }),
        activityLevel: sanitizeEnum(host.querySelector('#pr-activity').value, ACT_OPTS.map((o) => o[0]), 'moderate'),
        goal: sanitizeEnum(host.querySelector('#pr-goal').value, GOAL_OPTS.map((o) => o[0]), 'maintain'),
        country: countryRaw.split(' — ')[0],
      };
      if (s.profile.name) s.player.name = s.profile.name;
      if (s.profile.weightKg) s.player.weightKg = s.profile.weightKg;
    });
    showNotif('Profile saved!', 'OK');
    if (S.globalLeaderboardOptIn) setTimeout(() => LeaderboardAPI.sync(), 500);
  };

  host.querySelector('#pf-applymacros').onclick = () => {
    update((s) => {
      s.nutrition.dailyGoal = { cal: macros.cal, protein: macros.protein, carbs: macros.carbs, fat: macros.fat };
    }, { silent: true });
    window.ZF.save();
    showNotif('Macros applied to goals!', 'OK');
    window.ZF.rerender();
  };
  host.querySelector('#pf-ach').onclick = () => window.ZF.go('achievements');

  const saveGoal = (id, fn) => {
    host.querySelector(id).onchange = (e) => {
      const v = sanitizeNumber(e.target.value, { min: 0, max: 20000, fallback: 0, integer: true });
      update((s) => fn(s, v), { silent: true });
      window.ZF.save();
    };
  };
  saveGoal('#dg-cal', (s, v) => { s.nutrition.dailyGoal.cal = v; });
  saveGoal('#dg-pro', (s, v) => { s.nutrition.dailyGoal.protein = v; });
  saveGoal('#dg-fib', (s, v) => { s.nutrition.dailyGoal.fiber = v; });
  saveGoal('#dg-sug', (s, v) => { s.nutrition.dailyGoal.sugar = v; });
  saveGoal('#dg-wat', (s, v) => { s.water.dailyGoalMl = v; });

  host.querySelector('#sound-toggle').onchange = (e) => {
    update((s) => { s.soundEnabled = e.target.checked; }, { silent: true });
    window.ZF.save();
    if (e.target.checked) sfx('nav');
    window.ZF.rerender();
  };
  host.querySelector('#pf-tutorial').onclick = () => {
    import('./guide.js').then((m) => m.replayTutorial()).catch(() => {
      update((s) => { s.onboarding = { completed: false }; }, { silent: true });
      try { localStorage.removeItem('zf_tour_seen'); } catch {}
      window.ZF.save();
      location.reload();
    });
  };
  host.querySelector('#pf-export').onclick = exportDataFile;
  host.querySelector('#pf-import').onchange = (e) => { if (e.target.files[0]) importData(e.target.files[0]); };
  host.querySelector('#pf-reset').onclick = confirmReset;
  host.querySelector('#pf-update').onclick = async () => {
    if (!('serviceWorker' in navigator)) { showNotif('Update check not available', '!'); return; }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) { showNotif('Update check not available', '!'); return; }
      showNotif('Checking for updates...', '🔄');
      let found = false;
      const onUpdate = () => { found = true; };
      reg.addEventListener('updatefound', onUpdate);
      await reg.update();
      setTimeout(() => {
        reg.removeEventListener('updatefound', onUpdate);
        if (!found) showNotif(`Already up to date! (${APP_BUILD})`, '✓');
      }, 8000);
    } catch { showNotif('Update check failed', '!'); }
  };
}
