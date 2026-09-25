/* ── ZenFit V2 · core/nutrition-parse.js ────────────────────
   V1 nutrition engine, ported verbatim (Step 12 — same behavior,
   same numbers):
     Tier 1 — parseFood: Hindi-word stripping, ALIASES,
              FOOD_UNIT + resolveQty, custom foods, INGR_DB
              (bundled worldfooddb.js global), plural fallback.
     Tier 2 — OpenFoodFacts (search + barcode product API).
     Tier 3 — Cloudflare Worker Gemini proxy.
   gradeFood(nutrients) + gradeLabel + recalcFood + nn: V1 exact.
────────────────────────────────────────────────────────────── */
import { sanitizeText } from './sanitize.js';

const WORKER_URL = 'https://zenfit-nutrition.dark-moppen003.workers.dev/';
const OFF_PRODUCT = 'https://world.openfoodfacts.org/api/v2/product/';

export const ALIASES = {
  bhindi: 'bhindi sabzi', okra: 'bhindi sabzi', lauki: 'lauki sabzi', karela: 'karela sabzi',
  baingan: 'baingan sabzi', brinjal: 'baingan sabzi', gobi: 'gobi sabzi', gobhi: 'gobi sabzi',
  aloo: 'aloo sabzi', palak: 'palak sabzi', methi: 'methi sabzi',
  'chana masala': 'chole', chickpeas: 'chole', 'rajma masala': 'rajma',
  moong: 'moong dal', 'arhar dal': 'dal', 'toor dal': 'dal', 'masoor dal': 'dal', 'dal fry': 'dal tadka',
  chapatti: 'chapati', chawal: 'rice', anda: 'egg', murgh: 'chicken curry',
  machli: 'fish curry', 'murgh makhani': 'butter chicken', 'mix sabzi': 'mix veg',
  kaddu: 'pumpkin sabzi', 'paneer ki sabzi': 'paneer sabzi',
};

export const FOOD_UNIT = {
  apple: { u: 'piece', d: 1, g: 100 }, banana: { u: 'piece', d: 1, g: 100 },
  mango: { u: 'piece', d: 1, g: 150 }, orange: { u: 'piece', d: 1, g: 130 },
  egg: { u: 'piece', d: 1, g: 50 }, 'boiled egg': { u: 'piece', d: 1, g: 50 },
  omelette: { u: 'piece', d: 1, g: 100 }, chapati: { u: 'piece', d: 1, g: 40 },
  roti: { u: 'piece', d: 1, g: 40 }, paratha: { u: 'piece', d: 1, g: 80 },
  puri: { u: 'piece', d: 1, g: 20 }, naan: { u: 'piece', d: 1, g: 90 },
  dosa: { u: 'piece', d: 1, g: 75 }, idli: { u: 'piece', d: 4, g: 20 },
  momos: { u: 'piece', d: 6, g: 10 }, samosa: { u: 'piece', d: 1, g: 50 },
  dhokla: { u: 'piece', d: 2, g: 35 }, pizza: { u: 'piece', d: 1, g: 200 },
  burger: { u: 'piece', d: 1, g: 150 }, sandwich: { u: 'piece', d: 1, g: 150 },
  'gulab jamun': { u: 'piece', d: 2, g: 30 }, ladoo: { u: 'piece', d: 2, g: 30 },
  milk: { u: 'ml', d: 250 }, water: { u: 'ml', d: 250 },
  lassi: { u: 'ml', d: 200 }, chai: { u: 'ml', d: 150 },
  coffee: { u: 'ml', d: 150 }, tea: { u: 'ml', d: 150 },
  rice: { u: 'g', d: 100 }, biryani: { u: 'g', d: 200 }, khichdi: { u: 'g', d: 150 },
  oats: { u: 'g', d: 30 }, poha: { u: 'g', d: 100 }, upma: { u: 'g', d: 150 },
  paneer: { u: 'g', d: 100 }, curd: { u: 'g', d: 100 }, dahi: { u: 'g', d: 100 },
  raita: { u: 'g', d: 100 }, chicken: { u: 'g', d: 100 },
  'whey protein': { u: 'g', d: 30 }, 'peanut butter': { u: 'g', d: 16 },
  almonds: { u: 'g', d: 30 }, salad: { u: 'g', d: 100 },
  dal: { u: 'g', d: 100 }, 'dal tadka': { u: 'g', d: 100 }, 'dal makhani': { u: 'g', d: 100 },
  rajma: { u: 'g', d: 100 }, chole: { u: 'g', d: 100 }, 'chana dal': { u: 'g', d: 100 },
  'moong dal': { u: 'g', d: 100 }, sambar: { u: 'g', d: 100 },
  'aloo sabzi': { u: 'g', d: 100 }, 'aloo gobi': { u: 'g', d: 100 },
  'bhindi sabzi': { u: 'g', d: 100 }, 'bhindi ki sabzi': { u: 'g', d: 100 },
  'palak paneer': { u: 'g', d: 100 }, 'matar paneer': { u: 'g', d: 100 },
  'butter chicken': { u: 'g', d: 100 }, 'chicken curry': { u: 'g', d: 100 },
  'egg curry': { u: 'g', d: 100 }, 'mutton curry': { u: 'g', d: 100 },
  'fish curry': { u: 'g', d: 100 },
  kheer: { u: 'g', d: 100 }, maggi: { u: 'g', d: 50 },
};

const INGR = () => (typeof window !== 'undefined' && window.INGR_DB) || {};

export function resolveQty(qty, unit, dbKey) {
  const m = FOOD_UNIT[dbKey];
  if (!m) return { s: qty, dq: qty, du: '' };
  if (!unit) {
    if (m.u === 'piece') return { s: qty, dq: qty, du: 'piece' };
    return { s: qty, dq: qty * m.d, du: m.u };
  }
  const u = unit.replace(/s$/, '');
  if (u === 'piece' || u === 'pc') return { s: qty, dq: qty, du: qty > 1 ? 'pieces' : 'piece' };
  if (u === 'g' || u === 'gram') {
    if (m.u === 'piece') { const p = qty / (m.g || 100); return { s: p, dq: qty, du: 'g' }; }
    const sv = qty / (m.d || 100); return { s: sv, dq: qty, du: 'g' };
  }
  if (u === 'ml' || u === 'milliliter') {
    if (m.u === 'ml') { const sv = qty / (m.d || 250); return { s: sv, dq: qty, du: 'ml' }; }
    const sv = qty / (m.d || 100); return { s: sv, dq: qty, du: 'ml' };
  }
  if (u === 'kg') {
    const g = qty * 1000;
    if (m.u === 'piece') { const p = g / (m.g || 100); return { s: p, dq: qty, du: 'kg' }; }
    return { s: g / (m.d || 100), dq: qty, du: 'kg' };
  }
  if (u === 'cup') {
    if (m.u === 'ml') { const sv = qty * 240 / (m.d || 250); return { s: sv, dq: qty, du: 'cup' }; }
    const g = qty * 240;
    if (m.u === 'piece') { const p = g / (m.g || 100); return { s: p, dq: qty, du: 'cup' }; }
    return { s: g / (m.d || 100), dq: qty, du: 'cup' };
  }
  if (u === 'glass') { const sv = qty * 250 / (m.d || 250); return { s: sv, dq: qty, du: 'glass' }; }
  if (u === 'bowl') {
    const g = qty * 240;
    if (m.u === 'piece') { const p = g / (m.g || 100); return { s: p, dq: qty, du: 'bowl' }; }
    return { s: g / (m.d || 100), dq: qty, du: 'bowl' };
  }
  if (u === 'tbsp') {
    const g = qty * 15;
    if (m.u === 'piece') { const p = g / (m.g || 100); return { s: p, dq: qty, du: 'tbsp' }; }
    return { s: g / (m.d || 100), dq: qty, du: 'tbsp' };
  }
  if (u === 'tsp') {
    const g = qty * 5;
    if (m.u === 'piece') { const p = g / (m.g || 100); return { s: p, dq: qty, du: 'tsp' }; }
    return { s: g / (m.d || 100), dq: qty, du: 'tsp' };
  }
  if (u === 'serving') {
    const g = qty * 200;
    if (m.u === 'piece') { const p = g / (m.g || 100); return { s: p, dq: qty, du: 'serving' }; }
    return { s: g / (m.d || 100), dq: qty, du: 'serving' };
  }
  return { s: qty, dq: qty, du: u };
}

/** V1 parseFood — single item → {name, qty, unit, nutrients} or null. */
export function parseFood(rawText, customFoods = []) {
  let text = sanitizeText(rawText, 200).toLowerCase().trim()
    .replace(/\b(ki|ka|ke|with|and|&)\b/g, ' ').replace(/\s+/g, ' ').trim();
  let qty = 1, unit = '';
  const nm = text.match(/^(\d+\.?\d*)\s*(g|ml|kg|piece|pieces|pc|pcs|cup|cups|glass|glasses|tbsp|tsp|serving|servings|bowl|bowls|slice|slices|gram|grams|milliliter|milliliters|kilogram|kilograms)\b/);
  if (nm) { qty = parseFloat(nm[1]); unit = nm[2].replace(/s$/, ''); text = text.slice(nm[0].length).trim(); }
  else {
    const qw = { half: 0.5, one: 1, two: 2, three: 3, four: 4, 'a ': 1, 'an ': 1 };
    for (const [w, v] of Object.entries(qw)) {
      if (text.startsWith(w)) { qty = v; text = text.slice(w.length).trim(); break; }
    }
  }
  if (!nm) {
    const dm = text.match(/^(\d+\.?\d*)\s+/);
    if (dm) { qty = parseFloat(dm[1]); text = text.slice(dm[0].length).trim(); }
  }
  text = text.replace(/\b(plate|small|large|medium|full)\b/g, '').trim().replace(/\s+/g, ' ');
  const cf = customFoods || [];
  const userMatch = cf.find((f) => (f.name || '').toLowerCase() === text);
  if (userMatch) return scaleCustom(userMatch, qty, unit);
  const db = INGR();
  if (ALIASES[text] && db[ALIASES[text]]) return bE(ALIASES[text], text, qty, unit);
  if (db[text]) return bE(text, text, qty, unit);
  const sing = text.replace(/es$/, '').replace(/s$/, '');
  if (sing !== text) {
    if (ALIASES[sing] && db[ALIASES[sing]]) return bE(ALIASES[sing], text, qty, unit);
    if (db[sing]) return bE(sing, text, qty, unit);
  }
  const sing2 = text.replace(/^(\w+)es\b/, '$1').replace(/^(\w+)s\b/, '$1');
  if (sing2 !== text) {
    if (ALIASES[sing2] && db[ALIASES[sing2]]) return bE(ALIASES[sing2], text, qty, unit);
    if (db[sing2]) return bE(sing2, text, qty, unit);
  }
  return null;
}

function scaleCustom(f, qty, unit) {
  const sv = f.servingSize || 100;
  const su = (f.servingUnit || 'g').replace(/s$/, '');
  const pu = (unit || '').replace(/s$/, '');
  let s = 1;
  if (pu === su || pu === 'gram' || pu === 'milliliter' || pu === '' ) s = qty / sv;
  else if (pu === 'g' && su === 'g') s = qty / sv;
  else if (pu === 'ml' && su === 'ml') s = qty / sv;
  else if ((pu === 'g' || pu === 'gram') && su === 'ml') s = qty / sv;
  else if ((pu === 'ml' || pu === 'milliliter') && su === 'g') s = qty / sv;
  else if (pu === 'kg' && su === 'g') s = qty * 1000 / sv;
  else if (pu === 'kg' && su === 'ml') s = qty * 1000 / sv;
  else if (pu === 'piece' || pu === 'pc') s = su === 'piece' ? qty : qty / sv;
  else if (pu === 'cup') { const g = qty * 240; s = (su === 'g' || su === 'ml') ? g / sv : qty; }
  else if (pu === 'bowl') { const g = qty * 240; s = (su === 'g' || su === 'ml') ? g / sv : qty; }
  else if (pu === 'serving') { const g = qty * 200; s = (su === 'g' || su === 'ml') ? g / sv : qty; }
  else if (pu === 'tbsp') { const g = qty * 15; s = (su === 'g' || su === 'ml') ? g / sv : qty; }
  else if (pu === 'tsp') { const g = qty * 5; s = (su === 'g' || su === 'ml') ? g / sv : qty; }
  else s = qty / sv;
  const dq = Math.round(qty * 10) / 10;
  return {
    name: f.name, qty: dq, unit: pu,
    nutrients: {
      cal: Math.round(f.cal * s),
      protein: Math.round((f.protein || 0) * s * 10) / 10,
      carbs: Math.round((f.carbs || 0) * s * 10) / 10,
      fat: Math.round((f.fat || 0) * s * 10) / 10,
      fiber: Math.round((f.fiber || 0) * s * 10) / 10,
      sugar: Math.round((f.sugar || 0) * s * 10) / 10,
    },
  };
}

export function bE(dbKey, orig, qty, unit) {
  const b = INGR()[dbKey];
  if (!b) return null;
  const r = resolveQty(qty, unit || '', dbKey);
  return {
    name: orig || dbKey, qty: r.dq, unit: r.du,
    nutrients: {
      cal: Math.round(b.cal * r.s),
      protein: Math.round(b.p * r.s * 10) / 10,
      carbs: Math.round(b.c * r.s * 10) / 10,
      fat: Math.round(b.f * r.s * 10) / 10,
      fiber: Math.round(b.fi * r.s * 10) / 10,
      sugar: Math.round((b.s || 0) * r.s * 10) / 10,
    },
  };
}

/** V1 gradeFood(nutrients) — exact formula. */
export function gradeFood(n) {
  n = n || {};
  const s = ((n.protein || n.prot || 0) * 4) / (n.cal || 1) * 100 + ((n.fiber || 0) * 5) - ((n.fat || 0) * 0.3);
  return s > 60 ? 'A' : s > 40 ? 'B' : s > 20 ? 'C' : s > 5 ? 'D' : 'E';
}
export function gradeLabel(g) {
  return { A: 'EXCELLENT', B: 'GOOD', C: 'AVERAGE', D: 'FAIR', E: 'POOR' }[g] || '';
}
export function nn(x) {
  return x ? Number(x).toFixed(0) : 0;
}

/** V1 recalcFood — rescale preview item to new qty/unit. */
export function recalcFood(f, newQty, newUnit) {
  const b = f._edit, nu = (newUnit || '').replace(/s$/, '');
  let cal = 0;
  if (nu === 'piece' || nu === 'pc') {
    if (b.perPiece) cal = newQty * b.perPiece;
    else if (b.per1g) {
      const fuKey = Object.keys(FOOD_UNIT).find((k) => f.name.includes(k) || k.includes(f.name));
      const fu = fuKey ? FOOD_UNIT[fuKey] : null;
      const gPerPiece = fu && fu.u === 'piece' && fu.g ? fu.g : 50;
      cal = newQty * gPerPiece * b.per1g;
    } else cal = f.nutrients.cal * newQty / (f.qty || 1);
  } else {
    let g = 0;
    if (nu === 'g' || nu === 'gram') g = newQty;
    else if (nu === 'kg') g = newQty * 1000;
    else if (nu === 'ml' || nu === 'milliliter') g = newQty;
    else if (nu === 'cup') g = newQty * 240;
    else if (nu === 'tbsp') g = newQty * 15;
    else if (nu === 'tsp') g = newQty * 5;
    else if (nu === 'bowl') g = newQty * 240;
    else if (nu === 'serving') g = newQty * 200;
    if (g > 0) {
      if (b.per1g > 0) cal = g * b.per1g;
      else if (b.perPiece) {
        const fuKey = Object.keys(FOOD_UNIT).find((k) => f.name.includes(k) || k.includes(f.name));
        const fu = fuKey ? FOOD_UNIT[fuKey] : null;
        const gPerPiece = fu && fu.u === 'piece' && fu.g ? fu.g : 50;
        cal = g / gPerPiece * b.perPiece;
      } else cal = f.nutrients.cal * g / (f.qty || 1);
    } else cal = f.nutrients.cal * newQty / (f.qty || 1);
  }
  const ratio = cal / (f.nutrients.cal || 1);
  return {
    cal: Math.round(cal),
    protein: Math.round((f.nutrients.protein || 0) * ratio * 10) / 10,
    carbs: Math.round((f.nutrients.carbs || 0) * ratio * 10) / 10,
    fat: Math.round((f.nutrients.fat || 0) * ratio * 10) / 10,
    fiber: Math.round((f.nutrients.fiber || 0) * ratio * 10) / 10,
    sugar: Math.round((f.nutrients.sugar || 0) * ratio * 10) / 10,
  };
}

/** Split raw input on commas (V1) → parsed[] + failed[]. */
export function parseFoodInput(raw, customFoods = []) {
  const items = sanitizeText(raw, 300).split(',').map((s) => s.trim()).filter(Boolean);
  const parsed = [], failed = [];
  items.forEach((s) => {
    const p = parseFood(s, customFoods);
    if (!p) { failed.push(s); return; }
    const pq = p.qty || 1, pu = p.unit || '', pc = p.nutrients?.cal || 0;
    const per1g = (pu === 'g' || pu === 'gram') ? pc / pq : (pu === 'kg') ? pc / (pq * 1000) : 0;
    const per1ml = (pu === 'ml' || pu === 'milliliter') ? pc / pq : 0;
    const isPiece = pu === 'piece' || pu === 'pc' || pu === 'pieces';
    const perPiece = isPiece ? pc / pq : 0;
    const gPerUnit = { cup: 240, tbsp: 15, tsp: 5, bowl: 240, serving: 200 };
    const per1gAlt = gPerUnit[pu] ? pc / (pq * gPerUnit[pu]) : 0;
    let per1gFromPiece = 0;
    if (isPiece && perPiece) {
      const fuKey = Object.keys(FOOD_UNIT).find((k) => p.name.includes(k) || k.includes(p.name));
      const fu = fuKey ? FOOD_UNIT[fuKey] : null;
      if (fu && fu.u === 'piece' && fu.g) per1gFromPiece = perPiece / fu.g;
    }
    p._edit = { baseQty: pq, baseUnit: pu, per1g: per1g || per1gAlt || per1gFromPiece, per1ml: per1ml || per1g, perPiece };
    parsed.push(p);
  });
  return { parsed, failed };
}

/* ── Tier 2: OpenFoodFacts (barcode) ── */
export async function fetchOFFBarcode(code) {
  const r = await fetch(`${OFF_PRODUCT}${encodeURIComponent(code)}.json`);
  const d = await r.json();
  if (d.status !== 1) return null;
  const p = d.product, n = p.nutriments || {};
  const servingQty = p.serving_quantity && p.serving_quantity > 0 ? p.serving_quantity : 100;
  const f = (k) => Math.round((n[k] || 0) * 10) / 10;
  return {
    name: p.product_name || 'Product', qty: 1, unit: 'serving',
    nutrients: {
      cal: Math.round(n['energy-kcal_100g'] || 0),
      protein: f('proteins_100g'), carbs: f('carbohydrates_100g'),
      fat: f('fat_100g'), fiber: f('fiber_100g'), sugar: f('sugars_100g'),
    },
    servingQty, source: 'barcode',
  };
}

/* ── Tier 3: Gemini via Cloudflare Worker (V1 parity: {text}, timeout, passthrough) ── */
export async function fetchGeminiFood(text, signal) {
  const ctl = new AbortController();
  const to = setTimeout(() => { try { ctl.abort(); } catch {} }, 15000);
  try {
    const r = await fetch(WORKER_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }), signal: signal || ctl.signal,
    });
    if (!r.ok) throw new Error('Gemini worker failed');
    const j = await r.json();
    const items = Array.isArray(j) ? j : j.foods || j.items || [];
    return items.map((f) => {
      if (f?.nutrients && typeof f.nutrients === 'object') return { ...f, source: 'gemini', _edit: f._edit || null };
      return geminiFoodToParsed(f, text);
    });
  } finally { clearTimeout(to); }
}

/* ── Tier 2b: OpenFoodFacts text search (manual fallback, V1 parity) ── */
export async function fetchNutritionOnline(query) {
  const r = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5`);
  const d = await r.json();
  const p = (d.products || [])[0];
  if (!p) return null;
  const n = p.nutriments || {};
  return {
    name: p.product_name || query, qty: 1, unit: 'serving',
    nutrients: {
      cal: Math.round(n['energy-kcal_100g'] || n['energy-kcal'] || 0),
      protein: n.proteins_100g || n.prot || 0, carbs: n.carbohydrates_100g || 0,
      fat: n.fat_100g || 0, fiber: n.fiber_100g || 0, sugar: n.sugars_100g || 0,
    },
    source: 'online',
  };
}

export function geminiFoodToParsed(g, queryText = '') {
  const qty = Number(g.quantity ?? g.qty ?? 1) || 1;
  const cal = Math.round(g.cal ?? g.calories ?? g.kcal ?? 0);
  const protein = +(g.protein ?? g.protein_g ?? 0);
  const carbs = +(g.carbs ?? g.carbs_g ?? 0);
  const fat = +(g.fat ?? g.fat_g ?? 0);
  const fiber = +(g.fiber ?? g.fiber_g ?? 0);
  const sugar = +(g.sugar ?? 0);
  let unit = String(g.unit || '').toLowerCase().replace(/s$/, '');
  if (!unit && queryText) {
    const m = String(queryText).match(/(\d+\.?\d*)\s*(g|gram|ml|kg|piece|pc|cup|tbsp|tsp|bowl|serving)/i);
    if (m) unit = m[2].toLowerCase().replace(/s$/, '');
  }
  if (!unit) unit = 'piece';
  if (unit === 'pc') unit = 'piece';
  if (unit === 'gram') unit = 'g';
  if (unit === 'milliliter') unit = 'ml';
  const per1g = unit === 'g' ? cal / qty : unit === 'kg' ? cal / (qty * 1000) : 0;
  const per1ml = unit === 'ml' ? cal / qty : 0;
  const perPiece = unit === 'piece' ? cal / qty : unit === 'cup' ? cal / (qty * 150) : unit === 'tbsp' ? cal / (qty * 15) : unit === 'tsp' ? cal / (qty * 5) : unit === 'bowl' ? cal / (qty * 150) : 0;
  return {
    name: g.name || 'Dish', qty, unit,
    nutrients: { cal, protein, carbs, fat, fiber, sugar },
    source: 'gemini',
    _edit: { baseQty: qty, baseUnit: unit, per1g: per1g || per1ml, per1ml: per1ml || per1g, perPiece },
  };
}
