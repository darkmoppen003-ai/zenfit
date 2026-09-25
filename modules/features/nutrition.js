/* ── ZenFit V2 · features/nutrition.js ────────────────────
   V1 nutrition screen, faithfully mirrored:
   tabs Today | Calculator | Meal Plans.
   Today: 5 macro cards, Log Food (Text/Barcode/Manual),
   editable preview, grade-tap details, entry list.
   Calculator: custom dish builder (method/oil/servings).
   Meal Plans: builder + saved plans (Log/Edit/Copy/Delete).
────────────────────────────────────────────────────────────── */
import { S, update, deductXP } from '../core/store.js';
import { escapeHtml, sanitizeText, sanitizeNumber } from '../core/sanitize.js';
import { showNotif, awardXP, celebrateFirst, openOverlay } from '../core/ui.js';
import { todayNutrition } from '../core/selectors.js';
import {
  parseFoodInput, gradeFood, gradeLabel, nn, recalcFood, FOOD_UNIT,
  fetchOFFBarcode, fetchGeminiFood,
} from '../core/nutrition-parse.js';
import { checkAutoQuests } from './quests.js';
import { checkAchievements } from '../core/achievements.js';
import { getTodayStr } from '../core/utils.js';

let tab = 'today';
let ft = 'text';
let parsedFood = null;
let dishIngredients = [];
let dishState = { name: '', method: 'raw', oil: 0, servings: 1 };
let mealPlanItems = [];
let bcStream = null;
let bcDetecting = false;

const COOKING_METHODS = {
  raw: { mult: 1, label: 'Raw / No Cook' }, steam: { mult: 0.95, label: 'Steamed' },
  boil: { mult: 0.92, label: 'Boiled' }, roast: { mult: 1.05, label: 'Roasted' },
  grill: { mult: 1.02, label: 'Grilled' }, fry: { mult: 1.25, label: 'Pan Fried' },
  deepfry: { mult: 1.45, label: 'Deep Fried' }, blend: { mult: 1.0, label: 'Blended / Smoothie' },
  bake: { mult: 1.08, label: 'Baked' }, pressure: { mult: 0.9, label: 'Pressure Cooked' },
};

const ingNutritionDB = () => (typeof window !== 'undefined' && window.INGREDIENT_NUTRITION) || {};
const commonIngredients = () => (typeof window !== 'undefined' && window.COMMON_INGREDIENTS) || [];

function getIngNutrition(name) {
  const k = name.toLowerCase().trim();
  const db = ingNutritionDB();
  let val;
  if (db[k]) val = db[k];
  else {
    for (const [key, v] of Object.entries(db)) {
      if (k.includes(key) || key.includes(k)) { val = v; break; }
    }
  }
  if (val) {
    const s = val[5] !== undefined ? val[5] : Math.round((val[2] || 0) * 0.2 * 10) / 10;
    return [val[0], val[1], val[2], val[3], val[4], s];
  }
  const cf = (S.customFoods || []).find((f) => (f.name || '').toLowerCase().trim() === k);
  if (cf) {
    const sz = cf.servingSize || 100;
    return [(cf.cal || 0) / sz * 100, (cf.protein || 0) / sz * 100, (cf.carbs || 0) / sz * 100,
      (cf.fat || 0) / sz * 100, (cf.fiber || 0) / sz * 100, (cf.sugar || 0) / sz * 100];
  }
  return null;
}

function toGrams(qty, unit) {
  unit = (unit || 'g').replace(/s$/, '');
  if (unit === 'g' || unit === 'gram') return qty;
  if (unit === 'ml') return qty;
  if (unit === 'kg') return qty * 1000;
  if (unit === 'piece' || unit === 'pc') return qty * 100;
  if (unit === 'cup') return qty * 240;
  if (unit === 'tbsp' || unit === 'tablespoon') return qty * 15;
  if (unit === 'tsp' || unit === 'teaspoon') return qty * 5;
  if (unit === 'bowl') return qty * 250;
  if (unit === 'glass') return qty * 250;
  if (unit === 'serving') return qty * 200;
  if (unit === 'slice') return qty * 30;
  return qty;
}

function calcDishNutrition() {
  const method = dishState.method || 'raw';
  const oilG = dishState.oil || 0;
  const servings = dishState.servings || 1;
  const mult = COOKING_METHODS[method]?.mult || 1;
  let totalCal = 0, totalProt = 0, totalCarbs = 0, totalFat = 0, totalFiber = 0, totalSugar = 0;
  const missing = [];
  dishIngredients.forEach((ing) => {
    const g = toGrams(parseFloat(ing.qty) || 0, ing.unit || 'g');
    const n = getIngNutrition(ing.name);
    if (n) {
      const f = g / 100;
      totalCal += n[0] * f; totalProt += n[1] * f; totalCarbs += n[2] * f;
      totalFat += n[3] * f; totalFiber += n[4] * f; totalSugar += n[5] * f;
    } else missing.push(ing.name);
  });
  if (oilG > 0) { totalCal += oilG * 9; totalFat += oilG; }
  totalCal *= mult;
  const ps = servings > 0 ? servings : 1;
  return {
    cal: Math.round(totalCal / ps), prot: Math.round(totalProt / ps * 10) / 10,
    carbs: Math.round(totalCarbs / ps * 10) / 10, fat: Math.round(totalFat / ps * 10) / 10,
    fiber: Math.round(totalFiber / ps * 10) / 10, sugar: Math.round(totalSugar / ps * 10) / 10, missing,
  };
}

function mCard(label, val, goal, unit, color) {
  const p = Math.min(100, Math.round((val / goal) * 100));
  return `<div class="card-sm"><div style="font-size:11px;color:var(--text-muted)">${label}</div>`
    + `<div style="font-size:17px;font-weight:600;font-family:var(--font-display);color:${color};margin:4px 0">${Math.round(val)}<span style="font-size:10px;color:var(--text-muted);font-family:var(--font-ui)"> ${unit}</span></div>`
    + `<div class="xp-bar-wrap"><div class="xp-bar" style="width:${p}%;background:${color}"></div></div>`
    + `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">Goal: ${goal}${unit}</div></div>`;
}

export function renderNutrition(host, subTab) {
  if (subTab === 'today' || subTab === 'calculator' || subTab === 'mealplans') tab = subTab;
  const nut = todayNutrition();
  const g = S.nutrition.dailyGoal;

  host.innerHTML = `
  <div class="chart-tab-bar" data-no-swipe>
    <div class="chart-tab${tab === 'today' ? ' active' : ''}" data-ntab="today">📊 Today</div>
    <div class="chart-tab${tab === 'calculator' ? ' active' : ''}" data-ntab="calculator">🔬 Calculator</div>
    <div class="chart-tab${tab === 'mealplans' ? ' active' : ''}" data-ntab="mealplans">📋 Meal Plans</div>
  </div>
  <div id="nut-body"></div>`;

  host.querySelectorAll('[data-ntab]').forEach((t) => {
    t.onclick = () => { tab = t.dataset.ntab; window.ZF.go('nutrition', tab); };
  });
  const body = host.querySelector('#nut-body');
  stopBCCamera();
  if (tab === 'today') renderToday(body, nut, g);
  else if (tab === 'calculator') renderCalculator(body);
  else renderPlans(body);
}

/* ── TODAY ── */
function renderToday(body, nut, g) {
  const te = S.nutrition.entries.filter((e) => e.date === getTodayStr());
  body.innerHTML = `
  <div class="grid5 mb16">${mCard('Calories', nut.cal, g.cal, 'kcal', 'var(--warning)')}${mCard('Protein', nut.protein, g.protein, 'g', 'var(--danger)')}${mCard('Carbs', nut.carbs, g.carbs, 'g', 'var(--info)')}${mCard('Fat', nut.fat, g.fat, 'g', 'var(--primary)')}${mCard('Sugar', nut.sugar, g.sugar, 'g', 'var(--energy)')}</div>
  <div class="card mb16">
    <div class="section-title">Log Food</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <button class="btn btn-sm${ft === 'text' ? ' btn-primary' : ''}" data-ft="text">📝 Text</button>
      <button class="btn btn-sm${ft === 'barcode' ? ' btn-primary' : ''}" data-ft="barcode">📷 Barcode</button>
      <button class="btn btn-sm${ft === 'manual' ? ' btn-primary' : ''}" data-ft="manual">✏️ Manual</button>
    </div>
    <div id="ft-text" style="${ft === 'text' ? '' : 'display:none'}">
      <input type="text" id="food-input" placeholder="e.g. 2 chapati, 3 eggs, 200g rice, 250ml milk, 1 bowl dal..." style="margin-bottom:8px" maxlength="300">
      <div id="food-res"></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-primary" id="food-parse">Parse</button>
        <button class="btn btn-primary" id="log-food-btn" style="display:none">Log Entry</button>
      </div>
    </div>
    <div id="ft-barcode" style="${ft === 'barcode' ? '' : 'display:none'}">
      <div id="bc-camera-wrap" style="display:none;margin-bottom:10px;border-radius:10px;overflow:hidden;position:relative;background:#000;aspect-ratio:4/3">
        <video id="bc-video" autoplay playsinline style="width:100%;height:100%;object-fit:cover;display:block"></video>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">
          <div style="width:70%;aspect-ratio:3/1;border:2px solid var(--water);border-radius:6px;box-shadow:0 0 0 9999px rgba(0,0,0,.45)"></div>
        </div>
        <button id="bc-stop" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,.6);color:#fff;border:none;border-radius:20px;padding:4px 10px;font-size:12px;cursor:pointer">✕ Stop</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <button class="btn btn-primary" id="bc-camera-btn">📷 Scan Barcode</button>
        <input type="number" id="bc-input" placeholder="Or enter barcode..." style="flex:1">
        <button class="btn" id="bc-lookup">Lookup</button>
      </div>
      <div id="bc-res" style="margin-top:10px"></div>
    </div>
    <div id="ft-manual" style="${ft === 'manual' ? '' : 'display:none'}">
      <div class="grid2" style="gap:8px;margin-bottom:8px">
        <input type="text" id="m-name" placeholder="Food name" list="my-foods-list" style="grid-column:1/-1" maxlength="80">
        <datalist id="my-foods-list">${(S.customFoods || []).map((f) => `<option value="${escapeHtml(f.name)} — ${f.servingSize || 100}${f.servingUnit || 'g'}">`).join('')}</datalist>
        <input type="number" id="m-cal" placeholder="Calories (kcal)">
        <input type="number" id="m-protein" placeholder="Protein (g)">
        <input type="number" id="m-carbs" placeholder="Carbs (g)">
        <input type="number" id="m-fat" placeholder="Fat (g)">
        <input type="number" id="m-fiber" placeholder="Fiber (g)">
        <input type="number" id="m-sugar" placeholder="Sugar (g)">
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:8px 10px;background:var(--bg-raised);border-radius:8px">
        <span style="font-size:12px;color:var(--text-secondary);flex-shrink:0">Serving size:</span>
        <input type="number" id="m-ss" value="100" min="0.1" step="any" style="width:60px;text-align:center">
        <select id="m-su" style="width:80px">
          <option value="g">g</option><option value="ml">ml</option><option value="piece">piece</option>
          <option value="cup">cup</option><option value="bowl">bowl</option><option value="tbsp">tbsp</option><option value="tsp">tsp</option>
        </select>
        <span style="font-size:11px;color:var(--text-muted)">— nutrients above are per this serving</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;cursor:pointer" id="m-save-wrap">
        <div id="m-save-toggle" style="width:36px;height:20px;border-radius:10px;background:var(--success);transition:background .2s;position:relative;flex-shrink:0">
          <div id="m-save-knob" style="width:16px;height:16px;border-radius:50%;background:#fff;position:absolute;top:2px;left:18px;transition:left .2s"></div>
        </div>
        <input type="checkbox" id="m-save-food" checked style="display:none">
        <label style="font-size:12px;color:var(--text-secondary)">Save to My Foods for future use</label>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" id="m-log">Log Food</button>
        <button class="btn btn-sm" id="m-saveonly" style="border-color:var(--success);color:var(--success)">💾 Save Food</button>
        ${(S.customFoods || []).length > 0 ? `<button class="btn btn-sm" id="m-myfoods" style="border-color:var(--primary);color:var(--primary)">📌 My Foods (${(S.customFoods || []).length})</button>` : ''}
      </div>
    </div>
  </div>
  <div class="section-title">Today (${te.length})</div>
  <div id="nut-list">${te.length === 0 ? `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 0"><img loading="lazy" decoding="async" src="assets/mascot/nutrition.png" style="width:128px;height:128px;object-fit:contain" alt=""><div style="color:var(--text-muted);font-size:13px">No meals logged.</div></div>` : ''}</div>`;

  body.querySelectorAll('[data-ft]').forEach((b) => {
    b.onclick = () => { ft = b.dataset.ft; parsedFood = null; window.ZF.rerender(); };
  });

  /* Text parse */
  const input = body.querySelector('#food-input');
  const doParse = () => parseFoodInputUI(body);
  body.querySelector('#food-parse').onclick = doParse;
  input.onkeydown = (e) => { if (e.key === 'Enter') doParse(); };
  body.querySelector('#log-food-btn').onclick = () => logParsedFood();
  if (parsedFood?.length) drawPreview(body);

  /* Barcode */
  body.querySelector('#bc-camera-btn').onclick = () => startBCCamera(body);
  body.querySelector('#bc-stop').onclick = () => stopBCCamera();
  body.querySelector('#bc-lookup').onclick = () => doBC(body);
  body.querySelector('#bc-input').onkeydown = (e) => { if (e.key === 'Enter') doBC(body); };

  /* Manual */
  body.querySelector('#m-save-wrap').onclick = () => {
    const cb = body.querySelector('#m-save-food');
    cb.checked = !cb.checked;
    body.querySelector('#m-save-toggle').style.background = cb.checked ? 'var(--success)' : 'var(--bg-overlay)';
    body.querySelector('#m-save-knob').style.left = cb.checked ? '18px' : '2px';
  };
  // tapping a custom-food suggestion fills its nutrients
  body.querySelector('#m-name').onchange = (e) => {
    const v = e.target.value;
    const m = v.match(/^(.*) — (\d+(?:\.\d+)?)(g|ml|piece|cup|bowl|tbsp|tsp)$/);
    const f = (S.customFoods || []).find((x) => x.name === (m ? m[1] : v));
    if (!f) return;
    e.target.value = f.name;
    const set = (id, val) => { body.querySelector(id).value = val ?? ''; };
    set('#m-cal', f.cal); set('#m-protein', f.protein); set('#m-carbs', f.carbs);
    set('#m-fat', f.fat); set('#m-fiber', f.fiber); set('#m-sugar', f.sugar);
    body.querySelector('#m-ss').value = f.servingSize || 100;
    body.querySelector('#m-su').value = f.servingUnit || 'g';
  };
  body.querySelector('#m-log').onclick = () => logMF(body);
  body.querySelector('#m-saveonly').onclick = () => saveFoodOnly(body);
  body.querySelector('#m-myfoods') && (body.querySelector('#m-myfoods').onclick = () => showMyFoods());

  /* Entry list */
  const list = body.querySelector('#nut-list');
  te.forEach((e) => {
    const gi = S.nutrition.entries.indexOf(e);
    const row = document.createElement('div');
    row.className = 'card-sm mb8 flex gap12';
    row.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center">`
      + `<div class="grade grade-tap grade-${gradeFood(e.nutrients)}" data-fd="${gi}">${gradeFood(e.nutrients)}</div><div class="bc-hint">tap</div></div>`
      + `<div style="flex:1"><div style="font-size:13px;font-weight:500;text-transform:capitalize">${escapeHtml(e.name)}${e.unit ? ` × ${e.qty}${e.unit}` : (e.qty > 1 ? ` ×${e.qty}` : '')}</div>`
      + `<div style="font-size:11px;color:var(--text-secondary)">${nn(e.nutrients.cal)} kcal · P:${nn(e.nutrients.protein ?? e.nutrients.prot)}g · C:${nn(e.nutrients.carbs)}g · F:${nn(e.nutrients.fat)}g · S:${nn(e.nutrients.sugar)}g</div></div>`
      + `<button class="btn btn-icon btn-sm" data-deln="${gi}" style="color:var(--danger)">×</button>`;
    row.querySelector('[data-fd]').onclick = () => showFoodDetails({
      name: e.name, qty: e.qty, unit: e.unit || '', nutrients: e.nutrients,
    });
    row.querySelector('[data-deln]').onclick = () => {
      const idx = Number(row.querySelector('[data-deln]').dataset.deln);
      const xp = S.nutrition.entries[idx]?.xpAwarded || 0;
      update((s) => { s.nutrition.entries.splice(idx, 1); });
      if (xp > 0) deductXP(xp, 'Meal removed');
    };
    list.appendChild(row);
  });
}

function parseFoodInputUI(body) {
  const val = sanitizeText(body.querySelector('#food-input').value, 300);
  const { parsed, failed } = parseFoodInput(val, S.customFoods);
  const box = body.querySelector('#food-res');
  if (!failed.length) {
    parsedFood = parsed;
    if (!parsed.length) {
      box.innerHTML = '<div style="color:var(--danger);font-size:13px">Could not recognize. Try "2 chapati", "3 eggs", "200g rice", or "250ml milk".</div>';
      return;
    }
    drawPreview(body);
    return;
  }
  box.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:4px 0">Recognizing with AI: ${escapeHtml(failed.join(', '))}…</div>`;
  fetchGeminiFood(failed.join(', ')).then((aiParsed) => {
    if (!aiParsed?.length) { fallbackPrompt(body, parsed, failed); return; }
    aiParsed.forEach((f) => saveGeminiFoodToCustom(f));
    parsedFood = parsed.concat(aiParsed);
    drawPreview(body);
  }).catch(() => fallbackPrompt(body, parsed, failed));
}

function fallbackPrompt(body, parsed, failed) {
  const box = body.querySelector('#food-res');
  const btn = body.querySelector('#log-food-btn');
  parsedFood = parsed;
  box.innerHTML = '<div style="color:var(--danger);font-size:13px;margin-bottom:6px">Could not recognize some items. Log them manually:</div>'
    + failed.map((f) => `<div style="padding:6px 0;border-bottom:1px solid var(--border-mid)"><span>${escapeHtml(f)}</span> <span style="color:var(--danger);font-size:12px">— not recognized</span></div>`).join('')
    + '<button class="btn btn-primary btn-sm" style="margin-top:8px" id="food-gomanual">✏️ Log manually</button>';
  if (btn) btn.style.display = 'none';
  box.querySelector('#food-gomanual').onclick = () => { ft = 'manual'; window.ZF.rerender(); };
  if (parsed.length) { parsedFood = parsed; drawPreview(body); if (btn) btn.style.display = 'block'; }
}

function drawPreview(body) {
  const box = body.querySelector('#food-res');
  const btn = body.querySelector('#log-food-btn');
  if (!box) return;
  box.innerHTML = (parsedFood || []).map((f, i) => {
    const n = f.nutrients;
    return `<div class="card-sm mb8" style="padding:10px">`
      + `<div style="display:flex;align-items:flex-start;gap:10px">`
      + `<div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;padding-top:2px">`
      + `<div class="grade grade-tap grade-${gradeFood(n)}" data-pfd="${i}">${gradeFood(n)}</div><div class="bc-hint">tap</div></div>`
      + `<div style="flex:1;min-width:0">`
      + `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">`
      + `<div style="font-size:13px;font-weight:500;text-transform:capitalize">${escapeHtml(f.name)}</div>`
      + `<button class="btn btn-icon btn-sm" data-prm="${i}" style="color:var(--danger);flex-shrink:0">×</button></div>`
      + `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">`
      + `<input type="number" data-pqty="${i}" value="${f.qty || 1}" min="0.1" step="any" style="width:55px;text-align:center;padding:4px" aria-label="Quantity">`
      + `<select data-punit="${i}" style="width:65px;padding:4px" aria-label="Unit">`
      + ['g', 'ml', 'kg', 'cup', 'tbsp', 'tsp', 'piece', 'bowl'].map((u) =>
        `<option value="${u}"${f.unit === u || (u === 'piece' && f.unit === 'pc') ? ' selected' : ''}>${u}</option>`).join('')
      + `</select></div>`
      + `<div><span style="font-size:14px;font-weight:700;font-family:var(--font-display);color:var(--warning)" data-pcal="${i}">${nn(n.cal)}</span>`
      + `<span style="font-size:11px;color:var(--text-muted);margin-left:6px" data-pmacro="${i}">P ${nn(n.protein ?? n.prot)} · C ${nn(n.carbs)} · F ${nn(n.fat)}</span></div>`
      + `</div></div></div>`;
  }).join('');
  if (btn) btn.style.display = (parsedFood?.length ? 'block' : 'none');
  box.querySelectorAll('[data-pfd]').forEach((elm) => {
    elm.onclick = () => {
      const f = parsedFood[Number(elm.dataset.pfd)];
      showFoodDetails({ name: f.name, qty: f.qty, unit: f.unit || '', nutrients: f.nutrients });
    };
  });
  box.querySelectorAll('[data-prm]').forEach((b) => {
    b.onclick = () => { parsedFood.splice(Number(b.dataset.prm), 1); drawPreview(body); };
  });
  box.querySelectorAll('[data-pqty],[data-punit]').forEach((inp) => {
    inp.oninput = inp.onchange = () => {
      const card = inp.closest('.card-sm');
      const i = Number((card.querySelector('[data-pqty]') || card.querySelector('[data-punit]')).dataset.pqty ?? card.querySelector('[data-punit]').dataset.punit);
      const q = parseFloat(box.querySelector(`[data-pqty="${i}"]`).value) || 0;
      const u = box.querySelector(`[data-punit="${i}"]`).value;
      const f = parsedFood[i];
      f.nutrients = recalcFood(f, q, u);
      f.qty = q; f.unit = u;
      box.querySelector(`[data-pcal="${i}"]`).textContent = nn(f.nutrients.cal);
      box.querySelector(`[data-pmacro="${i}"]`).textContent = `P ${nn(f.nutrients.protein)} · C ${nn(f.nutrients.carbs)} · F ${nn(f.nutrients.fat)}`;
    };
  });
}

function logParsedFood() {
  if (!parsedFood?.length) return;
  parsedFood.forEach((f) => saveGeminiFoodToCustom(f));
  const t = getTodayStr();
  update((s) => {
    parsedFood.forEach((f) => s.nutrition.entries.push({
      name: f.name, qty: f.qty, unit: f.unit || '', nutrients: f.nutrients, date: t, xpAwarded: 30,
    }));
  });
  celebrateFirst('nutritionFirstMeal', '🥗 First meal logged! Your nutrition journey begins.');
  update((s) => { s.player.stats = { ...(s.player.stats || {}), health: Math.min(100, (s.player.stats?.health || 10) + parsedFood.length) }; }, { silent: true });
  awardXP(30 * parsedFood.length, 'Meals logged!');
  parsedFood = null;
  checkAutoQuests();
  checkAchievements();
}

export function saveGeminiFoodToCustom(f) {
  if (!f || f.source !== 'gemini') return;
  if ((S.customFoods || []).some((x) => (x.name || '').toLowerCase() === (f.name || '').toLowerCase())) return;
  const qty = Number(f.qty) || 1;
  const unit = String(f.unit || 'g').toLowerCase().replace(/s$/, '');
  const n = f.nutrients || {};
  const r1 = (v) => Math.round(v * 10) / 10;
  let servingSize, servingUnit, scaled;
  if (unit === 'g' || unit === 'gram' || unit === 'ml' || unit === 'milliliter') {
    const f2 = 100 / qty;
    scaled = { cal: Math.round(n.cal * f2), protein: r1(n.protein * f2), carbs: r1(n.carbs * f2), fat: r1(n.fat * f2), fiber: r1((n.fiber || 0) * f2), sugar: r1((n.sugar || 0) * f2) };
    servingSize = 100; servingUnit = unit.startsWith('m') ? 'ml' : 'g';
  } else if (unit === 'kg') {
    const f2 = 100 / (qty * 1000);
    scaled = { cal: Math.round(n.cal * f2), protein: r1(n.protein * f2), carbs: r1(n.carbs * f2), fat: r1(n.fat * f2), fiber: r1((n.fiber || 0) * f2), sugar: r1((n.sugar || 0) * f2) };
    servingSize = 100; servingUnit = 'g';
  } else {
    const f2 = 1 / qty;
    scaled = { cal: Math.round(n.cal * f2), protein: r1(n.protein * f2), carbs: r1(n.carbs * f2), fat: r1(n.fat * f2), fiber: r1((n.fiber || 0) * f2), sugar: r1((n.sugar || 0) * f2) };
    servingSize = 1; servingUnit = unit || 'serving';
  }
  update((s) => {
    s.customFoods = [...(s.customFoods || []), { name: f.name, ...scaled, source: 'gemini', servingSize, servingUnit }];
  }, { silent: true });
}

export function showFoodDetails(e) {
  const g = gradeFood(e.nutrients), l = gradeLabel(g), n = e.nutrients;
  openOverlay(`<div style="text-align:right;margin-bottom:6px">
      <button onclick="document.getElementById('zf-overlay')?.remove()" style="background:none;border:none;color:var(--text-muted);font-size:18px;cursor:pointer;padding:4px">✕</button></div>
    <div class="food-detail-grade grade-${g}">${g}</div>
    <div class="food-detail-label">${l}</div>
    <div style="font-size:16px;font-weight:600;text-align:center;margin:10px 0 2px">${escapeHtml(e.name)}</div>
    <div style="font-size:11px;color:var(--text-secondary);text-align:center;margin-bottom:2px">${e.qty || 1}${e.unit ? ` ${e.unit}` : ''}</div>
    <div class="food-detail-grid">
      <div class="food-detail-item"><div class="fdv" style="color:var(--warning)">${nn(n.cal)}</div><div class="fdl">Calories</div></div>
      <div class="food-detail-item"><div class="fdv" style="color:var(--success)">${nn(n.protein ?? n.prot)}g</div><div class="fdl">Protein</div></div>
      <div class="food-detail-item"><div class="fdv" style="color:var(--info)">${nn(n.carbs)}g</div><div class="fdl">Carbs</div></div>
      <div class="food-detail-item"><div class="fdv" style="color:var(--primary)">${nn(n.fat)}g</div><div class="fdl">Fat</div></div>
      <div class="food-detail-item"><div class="fdv">${nn(n.fiber)}g</div><div class="fdl">Fiber</div></div>
      <div class="food-detail-item"><div class="fdv">${nn(n.sugar)}g</div><div class="fdl">Sugar</div></div>
    </div>`);
}

/* ── Manual + My Foods ── */
function readManual(body) {
  return {
    name: sanitizeText(body.querySelector('#m-name').value, 80) || 'Custom',
    n: {
      cal: sanitizeNumber(body.querySelector('#m-cal').value, { min: 0, max: 5000, fallback: 0 }),
      protein: sanitizeNumber(body.querySelector('#m-protein').value, { min: 0, max: 500, fallback: 0 }),
      carbs: sanitizeNumber(body.querySelector('#m-carbs').value, { min: 0, max: 500, fallback: 0 }),
      fat: sanitizeNumber(body.querySelector('#m-fat').value, { min: 0, max: 500, fallback: 0 }),
      fiber: sanitizeNumber(body.querySelector('#m-fiber').value, { min: 0, max: 200, fallback: 0 }),
      sugar: sanitizeNumber(body.querySelector('#m-sugar').value, { min: 0, max: 500, fallback: 0 }),
    },
    servingSize: sanitizeNumber(body.querySelector('#m-ss').value, { min: 0.1, max: 5000, fallback: 100 }),
    servingUnit: body.querySelector('#m-su').value || 'g',
  };
}

function logMF(body) {
  const { name, n, servingSize, servingUnit } = readManual(body);
  update((s) => {
    s.nutrition.entries.push({ name, qty: servingSize, unit: servingUnit, nutrients: n, date: getTodayStr(), xpAwarded: 30 });
  });
  celebrateFirst('nutritionFirstMeal', '🥗 First meal logged! Your nutrition journey begins.');
  if (body.querySelector('#m-save-food')?.checked !== false && name !== 'Custom') {
    update((s) => {
      if (!(s.customFoods || []).some((f) => f.name.toLowerCase() === name.toLowerCase())) {
        s.customFoods = [...(s.customFoods || []), { name, ...n, source: 'manual', servingSize, servingUnit }];
        showNotif(`"${name}" saved to My Foods`, '📌');
      }
    }, { silent: true });
  }
  update((s) => { s.player.stats = { ...(s.player.stats || {}), health: Math.min(100, (s.player.stats?.health || 10) + 1) }; }, { silent: true });
  awardXP(30, 'Meal logged!');
  checkAutoQuests();
  checkAchievements();
}

function saveFoodOnly(body) {
  const { name, n, servingSize, servingUnit } = readManual(body);
  if (!name || name === 'Custom') { showNotif('Enter a food name', '!'); return; }
  if (!n.cal && !n.protein && !n.carbs && !n.fat) { showNotif('Enter at least one nutrient value', '!'); return; }
  if ((S.customFoods || []).some((f) => f.name.toLowerCase() === name.toLowerCase())) {
    showNotif(`"${name}" already exists in My Foods`, '!'); return;
  }
  update((s) => {
    s.customFoods = [...(s.customFoods || []), { name, ...n, source: 'manual', servingSize, servingUnit }];
  });
  showNotif(`"${name}" saved to My Foods`, '📌');
}

function showMyFoods() {
  if (!S.customFoods?.length) return;
  openOverlay(`<div style="max-height:70vh;overflow-y:auto;text-align:left">
    <div style="font-size:14px;font-weight:700;margin-bottom:12px">📌 My Foods (${S.customFoods.length})</div>
    ${S.customFoods.map((f, i) => `<div style="display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--border-mid)">
      <div style="flex:1"><div style="font-size:13px;font-weight:600">${escapeHtml(f.name)}</div>
      <div style="font-size:10px;color:var(--text-muted)">${f.cal} kcal · P:${f.protein}g · C:${f.carbs}g · F:${f.fat}g · S:${f.sugar || 0}g</div>
      <div style="font-size:9px;color:var(--text-muted)">per ${f.servingSize || 100}${f.servingUnit || 'g'} · ${escapeHtml(f.source || 'manual')}</div></div>
      <button class="btn btn-sm" data-mflog="${i}">Log</button>
      <button class="btn btn-sm btn-ghost" data-mfdel="${i}">✕</button></div>`).join('')}
    <button class="btn btn-ghost btn-full mt12" onclick="document.getElementById('zf-overlay')?.remove()">Close</button></div>`);
  document.querySelectorAll('[data-mflog]').forEach((b) => {
    b.onclick = () => {
      const f = S.customFoods[Number(b.dataset.mflog)];
      const r = parseFoodInput(`100g ${f.name}`, S.customFoods).parsed[0]
        || { name: f.name, qty: 100, unit: 'g', nutrients: { cal: f.cal, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber, sugar: f.sugar } };
      update((s) => {
        s.nutrition.entries.push({ name: r.name, qty: r.qty, unit: r.unit, nutrients: r.nutrients, date: getTodayStr(), xpAwarded: 30 });
      });
      document.getElementById('zf-overlay')?.remove();
      awardXP(30, 'Meal logged!');
      checkAutoQuests();
      checkAchievements();
    };
  });
  document.querySelectorAll('[data-mfdel]').forEach((b) => {
    b.onclick = () => {
      update((s) => { s.customFoods.splice(Number(b.dataset.mfdel), 1); });
      document.getElementById('zf-overlay')?.remove();
      window.ZF.rerender();
    };
  });
}

/* ── Barcode ── */
async function startBCCamera(body) {
  const wrap = body.querySelector('#bc-camera-wrap');
  const video = body.querySelector('#bc-video');
  const btn = body.querySelector('#bc-camera-btn');
  if (!navigator.mediaDevices?.getUserMedia) { showNotif('Camera not supported on this browser', '!'); return; }
  try {
    bcStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } });
    video.srcObject = bcStream;
    wrap.style.display = 'block';
    if (btn) btn.style.display = 'none';
    bcDetecting = true;
    runBCDetect(body, video);
    showNotif('Point camera at barcode', '📷');
  } catch (e) {
    showNotif(e.name === 'NotAllowedError' ? 'Camera permission denied. Please allow camera access.' : 'Camera error: ' + e.message, '!');
  }
}

function stopBCCamera() {
  bcDetecting = false;
  if (bcStream) { bcStream.getTracks().forEach((t) => t.stop()); bcStream = null; }
  document.querySelectorAll('#bc-camera-wrap').forEach((w) => { w.style.display = 'none'; });
  document.querySelectorAll('#bc-camera-btn').forEach((b) => { b.style.display = ''; });
}

async function runBCDetect(body, video) {
  if (!('BarcodeDetector' in window)) {
    const r = body.querySelector('#bc-res');
    if (r) r.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">Live detection needs Chrome/Edge — type the barcode below instead.</div>';
    return;
  }
  try {
    const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    while (bcDetecting && document.body.contains(video)) {
      try {
        const codes = await det.detect(video);
        if (codes?.length) {
          body.querySelector('#bc-input').value = codes[0].rawValue;
          stopBCCamera();
          doBC(body);
          return;
        }
      } catch {}
      await new Promise((res) => setTimeout(res, 400));
    }
  } catch {}
}

async function doBC(body) {
  const bc = sanitizeText(body.querySelector('#bc-input').value, 32);
  if (!bc) return;
  const box = body.querySelector('#bc-res');
  box.innerHTML = '<div style="color:var(--text-secondary)">Looking up...</div>';
  try {
    const f = await fetchOFFBarcode(bc);
    if (!f) { box.innerHTML = '<div style="color:var(--danger)">Not found.</div>'; return; }
    const g = gradeFood(f.nutrients);
    box.innerHTML = `<div class="quest-card"><span class="grade grade-${g}">${g}</span>
      <div style="flex:1"><div style="font-size:13px">${escapeHtml(f.name)}</div>
      <div style="font-size:11px;color:var(--text-muted)">${f.nutrients.cal} kcal/100g · serving ~${f.servingQty}g</div></div>
      <button class="btn btn-sm btn-success" id="bc-log">Log</button></div>`;
    box.querySelector('#bc-log').onclick = () => showBCServingDialog(f, box);
  } catch { box.innerHTML = '<div style="color:var(--danger)">Lookup failed — check connection.</div>'; }
}

function scaleBCNutrients(base, servingSize, servings) {
  const f = (servingSize / 100) * servings;
  const r1 = (v) => Math.round(v * 10) / 10;
  return { cal: Math.round(base.cal * f), protein: r1(base.protein * f), carbs: r1(base.carbs * f), fat: r1(base.fat * f), fiber: r1((base.fiber || 0) * f), sugar: r1((base.sugar || 0) * f) };
}

function showBCServingDialog(f, box) {
  const defServing = f.servingQty || 100;
  window._bcBaseNutrients = f.nutrients;
  openOverlay(`<div style="font-size:15px;font-weight:700;margin-bottom:4px">${escapeHtml(f.name)}</div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">per 100g values · adjust serving</div>
    <div class="flex gap8" style="margin-bottom:8px">
      <label style="font-size:12px;flex:1">Serving Size (g)<input type="number" id="bc-ss" value="${defServing}" min="1" max="1000"></label>
      <label style="font-size:12px;flex:1">Servings<input type="number" id="bc-serv" value="1" min="0.25" step="0.25"></label></div>
    <div id="bc-preview" style="font-size:13px;margin-bottom:10px"></div>
    <button class="btn btn-primary btn-full" id="bc-confirm">Log Item</button>`);
  const preview = () => {
    const ss = Number(document.getElementById('bc-ss').value) || defServing;
    const sv = Number(document.getElementById('bc-serv').value) || 1;
    const n = scaleBCNutrients(window._bcBaseNutrients, ss, sv);
    document.getElementById('bc-preview').innerHTML = `<b>${n.cal}</b> kcal · P ${n.protein} · C ${n.carbs} · F ${n.fat} · S ${n.sugar}`;
  };
  document.getElementById('bc-ss').oninput = preview;
  document.getElementById('bc-serv').oninput = preview;
  preview();
  document.getElementById('bc-confirm').onclick = () => {
    const ss = Number(document.getElementById('bc-ss').value) || defServing;
    const sv = Number(document.getElementById('bc-serv').value) || 1;
    const n = scaleBCNutrients(window._bcBaseNutrients, ss, sv);
    update((s) => {
      s.nutrition.entries.push({ name: f.name, qty: ss * sv, unit: 'g', servingSize: ss, servings: sv, nutrients: n, date: getTodayStr(), xpAwarded: 30 });
    });
    document.getElementById('zf-overlay')?.remove();
    celebrateFirst('nutritionFirstMeal', '🥗 First meal logged! Your nutrition journey begins.');
    awardXP(30, 'Meal logged!');
    checkAutoQuests();
    checkAchievements();
    window.ZF.rerender();
  };
}

function scaleTo(n, f) {
  return {
    cal: Math.round(n.cal * f), protein: Math.round(n.protein * f * 10) / 10,
    carbs: Math.round(n.carbs * f * 10) / 10, fat: Math.round(n.fat * f * 10) / 10,
    fiber: Math.round((n.fiber || 0) * f * 10) / 10, sugar: Math.round((n.sugar || 0) * f * 10) / 10,
  };
}

/* ── CALCULATOR ── */
function renderCalculator(body) {
  const n = dishIngredients.length > 0 ? calcDishNutrition() : null;
  body.innerHTML = `
  <div class="card mb12">
    <div class="section-title">Custom Dish Calculator</div>
    <div class="grid2" style="gap:8px;margin-bottom:8px">
      <div><label style="font-size:11px;color:var(--text-muted)">Cooking Method</label>
        <select id="dish-method" style="margin-top:4px">
          ${Object.entries(COOKING_METHODS).map(([k, v]) => `<option value="${k}"${dishState.method === k ? ' selected' : ''}>${v.label} (×${v.mult})</option>`).join('')}
        </select></div>
      <div><label style="font-size:11px;color:var(--text-muted)">Oil / Fat Added (g)</label>
        <input type="number" id="dish-oil" placeholder="0" value="${dishState.oil || ''}" min="0" max="200" style="margin-top:4px"></div>
    </div>
    <div><label style="font-size:11px;color:var(--text-muted)">Servings (divide total by)</label>
      <input type="number" id="dish-servings" placeholder="1" min="1" max="20" value="${dishState.servings}" style="margin-top:4px;width:100px"></div>
  </div>
  <div class="card mb12">
    <div class="section-title">Add Ingredients</div>
    <div style="display:flex;gap:8px;margin-bottom:8px;align-items:flex-end">
      <div style="flex:1"><label style="font-size:11px;color:var(--text-muted)">Ingredient</label>
        <input type="text" id="ing-name" placeholder="e.g. Chicken Breast" list="ing-list" style="margin-top:4px" maxlength="60">
        <datalist id="ing-list">${[...commonIngredients(), ...(S.customFoods || []).map((f) => f.name)].map((i) => `<option value="${escapeHtml(i)}">`).join('')}</datalist></div>
      <div style="width:70px"><label style="font-size:11px;color:var(--text-muted)">Qty</label>
        <input type="number" id="ing-qty" placeholder="100" min="0" style="margin-top:4px"></div>
      <div style="width:70px"><label style="font-size:11px;color:var(--text-muted)">Unit</label>
        <select id="ing-unit" style="margin-top:4px"><option value="g">g</option><option value="ml">ml</option><option value="piece">piece</option><option value="cup">cup</option><option value="tbsp">tbsp</option></select></div>
      <button class="btn btn-primary btn-sm" id="ing-add" style="margin-bottom:1px">+</button>
    </div>
    <div id="ing-list-box">${dishIngredients.map((ing, i) => `
      <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg-raised);border-radius:8px;margin-bottom:4px">
        <div style="flex:1;font-size:13px">${escapeHtml(ing.name)} <span style="color:var(--text-muted);font-size:11px">${ing.qty}${ing.unit}</span></div>
        <button class="btn btn-icon btn-sm" data-ingdel="${i}" style="color:var(--danger)">×</button></div>`).join('')}</div>
  </div>
  ${n ? `<div class="card mb12"><div class="section-title">Per serving</div>
    <div class="food-detail-grid">
      <div class="food-detail-item"><div class="fdv" style="color:var(--warning)">${n.cal}</div><div class="fdl">kcal</div></div>
      <div class="food-detail-item"><div class="fdv" style="color:var(--success)">${n.prot}g</div><div class="fdl">protein</div></div>
      <div class="food-detail-item"><div class="fdv" style="color:var(--info)">${n.carbs}g</div><div class="fdl">carbs</div></div>
    </div>
    ${n.missing.length ? `<div style="font-size:11px;color:var(--warning)" class="mt8">Unknown: ${escapeHtml(n.missing.join(', '))} (skipped)</div>` : ''}
    <div class="flex gap8 mt12"><input type="text" id="dish-name-log" placeholder="Dish name…" maxlength="60" style="flex:1">
    <button class="btn btn-success" id="dish-log">Log Custom Dish</button></div></div>`
    : `<div class="card text-center" style="color:var(--text-muted)">Add ingredients to calculate nutrition.</div>`}`;

  const saveState = () => {
    dishState.method = body.querySelector('#dish-method').value;
    dishState.oil = sanitizeNumber(body.querySelector('#dish-oil').value, { min: 0, max: 200, fallback: 0 });
    dishState.servings = sanitizeNumber(body.querySelector('#dish-servings').value, { min: 1, max: 20, fallback: 1, integer: true });
  };
  body.querySelector('#dish-method').onchange = () => { saveState(); window.ZF.rerender(); };
  body.querySelector('#dish-oil').onchange = () => { saveState(); window.ZF.rerender(); };
  body.querySelector('#dish-servings').onchange = () => { saveState(); window.ZF.rerender(); };
  body.querySelector('#ing-add').onclick = () => {
    saveState();
    const name = sanitizeText(body.querySelector('#ing-name').value, 60);
    const qty = sanitizeNumber(body.querySelector('#ing-qty').value, { min: 0, max: 10000, fallback: NaN });
    const unit = body.querySelector('#ing-unit').value || 'g';
    if (!name || !Number.isFinite(qty) || qty <= 0) { showNotif('Enter ingredient name and quantity', '!'); return; }
    dishIngredients.push({ name, qty, unit });
    window.ZF.rerender();
  };
  body.querySelectorAll('[data-ingdel]').forEach((b) => {
    b.onclick = () => { dishIngredients.splice(Number(b.dataset.ingdel), 1); window.ZF.rerender(); };
  });
  body.querySelector('#dish-log') && (body.querySelector('#dish-log').onclick = () => {
    const dishName = sanitizeText(body.querySelector('#dish-name-log').value, 60) || 'Custom Dish';
    const dn = calcDishNutrition();
    if (!dn.cal) { showNotif('Add ingredients first', '!'); return; }
    const t = getTodayStr();
    update((s) => {
      s.nutrition.entries.push({
        id: Date.now(), name: dishName, date: t, mealType: 'meal', xpAwarded: 30,
        nutrients: { cal: dn.cal, protein: dn.prot, carbs: dn.carbs, fat: dn.fat, fiber: dn.fiber || 0, sugar: dn.sugar || 0 },
      });
      s.customDishes = s.customDishes || [];
      if (!s.customDishes.some((d) => d.name.toLowerCase() === dishName.toLowerCase())) {
        s.customDishes.push({ name: dishName, ingredients: [...dishIngredients], cal: dn.cal, protein: dn.prot, carbs: dn.carbs, fat: dn.fat, fiber: dn.fiber || 0, source: 'manual', date: t });
      }
      if (!(s.customFoods || []).some((f) => f.name.toLowerCase() === dishName.toLowerCase())) {
        s.customFoods = [...(s.customFoods || []), {
          name: dishName, cal: dn.cal, protein: dn.prot, carbs: dn.carbs, fat: dn.fat,
          fiber: dn.fiber || 0, sugar: dn.sugar || 0, source: 'dish', servingSize: 1, servingUnit: 'serving',
        }];
      }
    });
    showNotif(`${dishName} logged — ${dn.cal} kcal`, 'OK');
    awardXP(30, 'Meal logged!');
    dishIngredients = [];
    checkAutoQuests();
    checkAchievements();
  });
}

/* ── MEAL PLANS ── */
function renderPlans(body) {
  const plans = S.mealPlans || [];
  const tot = mealPlanItems.reduce((a, i) => a + i.cal, 0);
  body.innerHTML = `
  <div class="card mb12">
    <div class="section-title">Create Meal Plan</div>
    <input type="text" id="mp-name" placeholder="Meal name (e.g. Pre-workout Meal, Breakfast A)" style="margin-bottom:10px" maxlength="80">
    <div style="display:flex;gap:8px;margin-bottom:8px;align-items:flex-end">
      <div style="flex:1"><label style="font-size:11px;color:var(--text-muted)">Food Item</label>
        <input type="text" id="mi-name" placeholder="e.g. Oats, Chicken Breast..." list="mi-list" style="margin-top:4px" maxlength="60">
        <datalist id="mi-list">${[...commonIngredients(), ...(S.customFoods || []).map((f) => f.name)].map((i) => `<option value="${escapeHtml(i)}">`).join('')}</datalist></div>
      <div style="width:80px"><label style="font-size:11px;color:var(--text-muted)">Amount</label>
        <input type="number" id="mi-qty" value="100" min="1" style="margin-top:4px"></div>
      <div style="width:70px"><label style="font-size:11px;color:var(--text-muted)">Unit</label>
        <select id="mi-unit" style="margin-top:4px"><option value="g">g</option><option value="ml">ml</option><option value="cup">cup</option><option value="tbsp">tbsp</option><option value="piece">piece</option></select></div>
      <button class="btn btn-primary btn-sm" id="mi-add" style="margin-bottom:1px">+</button>
    </div>
    ${mealPlanItems.length > 0 ? `<div style="margin-bottom:10px">
      ${mealPlanItems.map((it, i) => `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg-raised);border-radius:8px;margin-bottom:4px">
        <div style="flex:1"><span style="font-size:13px;font-weight:500">${escapeHtml(it.name)}</span>
        <span style="font-size:11px;color:var(--text-muted);margin-left:8px">${it.qty}${it.unit}</span>
        <span style="font-size:11px;color:var(--warning);margin-left:8px">${it.cal} kcal</span>
        <span style="font-size:11px;color:var(--info);margin-left:4px">${it.prot}g prot</span></div>
        <button class="btn btn-icon btn-sm" data-mirm="${i}" style="color:var(--danger)">×</button></div>`).join('')}
      <div style="padding:8px;border-top:1px solid var(--border-mid);margin-top:6px;display:flex;justify-content:space-between">
        <span style="font-size:13px;font-weight:600">Total</span>
        <span style="font-size:13px;color:var(--warning);font-weight:700">${tot} kcal</span></div></div>
      <button class="btn btn-primary btn-full" id="mp-save">Save Meal Plan</button>`
      : `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 0"><img loading="lazy" decoding="async" src="assets/mascot/nutrition.png" style="width:128px;height:128px;object-fit:contain" alt=""><div style="color:var(--text-muted);font-size:12px">Add food items to build your meal plan</div></div>`}
  </div>
  ${plans.length > 0 ? '<div class="section-title">Saved Meal Plans (' + plans.length + ')</div>' : ''}
  ${plans.map((mp, i) => `<div class="card mb10">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div><div style="font-size:14px;font-weight:600">${escapeHtml(mp.name)}</div>
      <div style="font-size:11px;color:var(--text-muted)">${mp.items.length} items · ${mp.totalCal} kcal</div></div>
      <div style="display:flex;gap:5px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" data-mplog="${i}">Log</button>
        <button class="btn btn-sm" data-mpedit="${i}" style="border-color:var(--primary);color:var(--primary)">Edit</button>
        <button class="btn btn-sm" data-mpcopy="${i}" style="border-color:var(--water);color:var(--water)">Copy</button>
        <button class="btn btn-icon btn-sm" data-mpdel="${i}" style="color:var(--danger)">×</button>
      </div></div>
    <div style="display:flex;flex-direction:column;gap:3px">
      ${(mp.items || []).map((it) => `<div style="font-size:12px;color:var(--text-secondary);display:flex;justify-content:space-between;padding:3px 8px;background:var(--bg-overlay);border-radius:5px"><span>${escapeHtml(it.name)} · ${it.qty}${it.unit || ''}</span><span>${it.cal} kcal</span></div>`).join('')}
    </div></div>`).join('')}`;

  body.querySelector('#mi-add').onclick = () => {
    const name = sanitizeText(body.querySelector('#mi-name').value, 60);
    const qty = sanitizeNumber(body.querySelector('#mi-qty').value, { min: 1, max: 10000, fallback: 100 });
    const unit = body.querySelector('#mi-unit').value || 'g';
    if (!name) { showNotif('Enter food item name', '!'); return; }
    const n = getIngNutrition(name);
    if (!n) { showNotif('Food not found in database', '!'); return; }
    const u = unit.replace(/s$/, '');
    const fu = FOOD_UNIT[name.toLowerCase().trim()];
    let grams = qty;
    if (u === 'piece' || u === 'pc') grams = qty * (fu?.g || 100);
    else if (u === 'kg') grams = qty * 1000;
    else if (u === 'cup') grams = qty * 240;
    else if (u === 'tbsp') grams = qty * 15;
    else if (u === 'glass') grams = qty * 250;
    else if (u === 'slice') grams = qty * 30;
    else if (u === 'serving') grams = qty * 200;
    const f = grams / 100;
    mealPlanItems.push({
      name, qty, unit, cal: Math.round(n[0] * f),
      prot: Math.round(n[1] * f * 10) / 10, protein: Math.round(n[1] * f * 10) / 10,
      carbs: Math.round(n[2] * f * 10) / 10, fat: Math.round(n[3] * f * 10) / 10,
    });
    window.ZF.rerender();
  };
  body.querySelectorAll('[data-mirm]').forEach((b) => {
    b.onclick = () => { mealPlanItems.splice(Number(b.dataset.mirm), 1); window.ZF.rerender(); };
  });
  body.querySelector('#mp-save') && (body.querySelector('#mp-save').onclick = () => {
    const name = sanitizeText(body.querySelector('#mp-name').value, 80) || `Meal ${plans.length + 1}`;
    update((s) => {
      s.mealPlans = [...(s.mealPlans || []), { name, items: [...mealPlanItems], totalCal: mealPlanItems.reduce((a, i) => a + i.cal, 0) }];
    });
    mealPlanItems = [];
    showNotif(`Meal plan "${name}" saved`, 'OK');
  });
  body.querySelectorAll('[data-mplog]').forEach((b) => {
    b.onclick = () => import('./quests.js').then((m) => m.logMealPlan(Number(b.dataset.mplog)));
  });
  body.querySelectorAll('[data-mpedit]').forEach((b) => {
    b.onclick = () => {
      const mp = plans[Number(b.dataset.mpedit)];
      mealPlanItems = (mp.items || []).map((x) => ({ ...x }));
      body.querySelector('#mp-name').value = mp.name;
      window.ZF.rerender();
      showNotif('Plan loaded into builder — save to overwrite as new', 'OK');
    };
  });
  body.querySelectorAll('[data-mpcopy]').forEach((b) => {
    b.onclick = () => {
      const mp = plans[Number(b.dataset.mpcopy)];
      update((s) => { s.mealPlans = [...s.mealPlans, { ...mp, name: `${mp.name} (copy)` }]; });
    };
  });
  body.querySelectorAll('[data-mpdel]').forEach((b) => {
    b.onclick = () => update((s) => { s.mealPlans.splice(Number(b.dataset.mpdel), 1); });
  });
}
