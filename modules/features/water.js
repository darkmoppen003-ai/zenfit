/* ── ZenFit V2 · features/water.js ─────────────────────────
   V1 hydration screen: tank (tap +250ml), 250/500/750/1L +
   custom entry, history with times + delete (XP refund).
────────────────────────────────────────────────────────────── */
import { S, update, deductXP, updStat } from '../core/store.js';
import { sanitizeNumber } from '../core/sanitize.js';
import { showNotif, awardXP, celebrateFirst, sfx, onEnter } from '../core/ui.js';
import { todayWater, today } from '../core/selectors.js';
import { checkAutoQuests } from './quests.js';
import { checkAchievements } from '../core/achievements.js';

/** V1 addWater: +5 XP per log (+50 crossing goal), first-glass celebration. */
export function addWater(ml) {
  ml = Math.round(sanitizeNumber(ml, { min: 0, max: 5000, fallback: 0, integer: true }));
  if (!ml || ml <= 0) return;
  sfx('water');
  const prev = todayWater();
  update((s) => {
    s.water.entries = [...(s.water.entries || []), { ml, date: today(), ts: Date.now(), xpAwarded: 5 }];
  });
  celebrateFirst('waterFirstGlass', '💧 First glass logged! Stay hydrated.');
  awardXP(5, 'Hydrating!');
  updStat('health', 1);
  if (todayWater() >= (S.water.dailyGoalMl || 3000) && prev < (S.water.dailyGoalMl || 3000)) awardXP(50, 'Water goal!');
  checkAutoQuests();
  checkAchievements();
}

export function renderWater(host) {
  const total = todayWater();
  const goal = S.water.dailyGoalMl || 3000;
  const pct = Math.min(100, Math.round((total / goal) * 100));
  const entries = (S.water.entries || []).filter((e) => e.date === today());

  host.innerHTML = `
  <div class="card mb16" style="text-align:center">
    <div class="section-title">Today's Hydration</div>
    <div class="water-tank mb12" id="w-tank" title="Tap to add 250ml">
      <div class="water-fill" style="height:${pct}%">
        <svg class="water-wave-svg" viewBox="0 0 400 28" preserveAspectRatio="none" height="28">
          <path d="M0,14 C50,0 100,28 150,14 C200,0 250,28 300,14 C350,0 400,28 400,14 L400,28 L0,28 Z" fill="#00c8ffaa"/>
          <path d="M0,18 C60,6 120,30 180,18 C240,6 300,30 400,18 L400,28 L0,28 Z" fill="#0077ffaa"/>
        </svg>
        <div class="water-body"></div>
      </div>
      <div class="water-pct-label">${pct}%</div>
    </div>
    <div style="font-size:22px;font-weight:500;color:var(--water)">${Math.round(total / 100) / 10}L <span style="color:var(--text-muted);font-size:13px">/ ${goal / 1000}L</span></div>
    <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${pct}% of daily goal · Tap tank to add 250ml</div>
  </div>
  <div class="card mb16">
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${[250, 500, 750, 1000].map((ml) => `<button class="btn btn-primary" data-wml="${ml}">${ml >= 1000 ? '1L' : `${ml}ml`}</button>`).join('')}
    </div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <input type="number" id="cw" placeholder="Custom ml..." min="1" max="5000">
      <button class="btn btn-primary" id="cw-add" style="white-space:nowrap">Add</button>
    </div>
  </div>
  <div id="w-hist">${entries.length === 0 ? '<div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 0"><img loading="lazy" decoding="async" src="assets/mascot/water.png" style="width:128px;height:128px;object-fit:contain" alt=""><div style="color:var(--text-muted);font-size:13px">No water logged yet. Tap the tank or buttons above to start.</div></div>' : ''}</div>`;

  host.querySelector('#w-tank').onclick = () => addWater(250);
  host.querySelectorAll('[data-wml]').forEach((b) => { b.onclick = () => addWater(Number(b.dataset.wml)); });
  const customAdd = () => {
    const v = sanitizeNumber(host.querySelector('#cw').value, { min: 1, max: 5000, fallback: NaN, integer: true });
    if (!Number.isFinite(v)) { showNotif('Enter ml amount', '!'); return; }
    addWater(v);
  };
  host.querySelector('#cw-add').onclick = customAdd;
  onEnter(host.querySelector('#cw'), customAdd);
  host.querySelector('#cw').onkeydown = (e) => { if (e.key === 'Enter') customAdd(); };

  const hist = host.querySelector('#w-hist');
  entries.slice().reverse().forEach((e) => {
    const gi = S.water.entries.indexOf(e);
    const row = document.createElement('div');
    row.className = 'card-sm mb8 flex-between';
    row.innerHTML = `<span style="color:var(--water)">💧 ${e.ml}ml</span>`
      + `<span style="font-size:11px;color:var(--text-muted)">${e.ts ? new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>`
      + `<button class="btn btn-icon btn-sm" data-wdel="${gi}" style="color:var(--danger)">×</button>`;
    row.querySelector('[data-wdel]').onclick = () => {
      const xp = S.water.entries[gi]?.xpAwarded || 0;
      update((s) => { s.water.entries.splice(gi, 1); });
      if (xp > 0) deductXP(xp, 'Water removed');
    };
    hist.appendChild(row);
  });
}
