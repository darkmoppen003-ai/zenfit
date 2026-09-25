/* ── ZenFit V2 · features/zen.js (Mind tab) ────────────────
   V1 Mind system, faithfully mirrored. Tabs: ZEN | Study |
   Screen Time. Breathing-pattern engine (Equal/Box/4-7-8/
   Hold/Custom), ambient soundscape (index.json-driven),
   study timer + manual log with difficulty XP, screen-time
   tracking with limit + 7-day chart. Mood lives on the
   dashboard + analytics (V1 design).
────────────────────────────────────────────────────────────── */
import { S, update, deductXP, updStat } from '../core/store.js';
import { escapeHtml, sanitizeText, sanitizeNumber } from '../core/sanitize.js';
import { showNotif, awardXP, celebrateFirst, sfx } from '../core/ui.js';
import { today, isRestDay } from '../core/selectors.js';
import { checkAutoQuests } from './quests.js';
import { checkAchievements } from '../core/achievements.js';

let sub = 'zen';

/* ── Breathing engine state (module-level, like V1) ── */
let zenTimer = null, zenRunning = false, zenPaused = false;
let zenPhase = 'idle', zenCycle = 0, zenTotalCycles = 1;
let zenElapsed = 0, zenStartTime = 0, zenTick = 0, zenPhaseDuration = 0;
let zenMode = 'equal';
let zenSoundSrc = null;
const zenAudioEls = {};
let zenSoundList = [];

const ZEN_MODES = {
  equal: { label: 'Equal Breathing', desc: 'Inhale & exhale for equal duration', inhale: 4, hold1: 0, exhale: 4, hold2: 0, cycles: 113, color: '#7B5EFF' },
  box: { label: 'Box Breathing', desc: '4-count inhale, hold, exhale, hold', inhale: 4, hold1: 4, exhale: 4, hold2: 4, cycles: 8, color: '#4CDB8A' },
  '4-7-8': { label: '4-7-8 Breathing', desc: 'Inhale 4s, hold 7s, exhale 8s', inhale: 4, hold1: 7, exhale: 8, hold2: 0, cycles: 6, color: '#F0A000' },
  hold: { label: 'Breath Hold Test', desc: 'Inhale deeply, then hold as long as you can', inhale: 4, hold1: 0, exhale: 0, hold2: 0, cycles: 1, color: '#FF4D6A' },
  custom: { label: 'Custom Pattern', desc: 'Design your own breathing pattern', inhale: 4, hold1: 0, exhale: 4, hold2: 0, cycles: 10, color: '#00C8FF' },
};
const ZEN_SOUNDS_BUILTIN = [
  { id: 'campfire', label: 'Campfire', icon: '🔥' },
  { id: 'forest_morning', label: 'Forest Morning', icon: '🌲' },
  { id: 'heavy_rain', label: 'Heavy Rain', icon: '🌧️' },
  { id: 'ocean', label: 'Ocean', icon: '🌊' },
  { id: 'rain_puddle', label: 'Rain Puddle', icon: '💧' },
  { id: 'rainy_forest', label: 'Rainy Forest', icon: '🌲' },
  { id: 'river', label: 'River Stream', icon: '🏞️' },
  { id: 'soul_frequencies', label: 'Soul Frequencies', icon: '🎵' },
  { id: 'thunder', label: 'Thunderstorm', icon: '⛈️' },
  { id: 'silence', label: 'Silence', icon: '🔇' },
];
const MODE_ICONS = { equal: '⚖️', box: '⬜', '4-7-8': '🔢', hold: '🫁', custom: '🎛️' };

/* ── Study timer state ── */
let timerRunning = false, timerSeconds = 0, timerSubject = '', timerTopic = '', timerDiff = 'medium';
let timerInterval = null;

/* V1 mood set (twemoji images, static PNG + animated webp on hover) */
export const MOODS = [
  { key: 'ecstatic', emoji: '😄', label: 'Ecstatic', color: '#ffd700', cp: '1f604', type: 'positive' },
  { key: 'happy', emoji: '🙂', label: 'Happy', color: '#4cdb8a', cp: '1f642', type: 'positive' },
  { key: 'excited', emoji: '🥳', label: 'Excited', color: '#ffaa00', cp: '1f973', type: 'positive' },
  { key: 'neutral', emoji: '😐', label: 'Neutral', color: '#8b95a5', cp: '1f610', type: 'neutral' },
  { key: 'confused', emoji: '😵‍💫', label: 'Confused', color: '#c084fc', cp: '1f635_200d_1f4ab', type: 'neutral' },
  { key: 'tired', emoji: '🥱', label: 'Tired', color: '#a78bfa', cp: '1fae9', type: 'neutral' },
  { key: 'anxious', emoji: '😰', label: 'Anxious', color: '#f97316', cp: '1f630', type: 'negative' },
  { key: 'sad', emoji: '😢', label: 'Sad', color: '#ff8c42', cp: '1f622', type: 'negative' },
  { key: 'frustrated', emoji: '😫', label: 'Frustrated', color: '#ef4444', cp: '1f62b', type: 'negative' },
  { key: 'angry', emoji: '😡', label: 'Angry', color: '#dc2626', cp: '1f620', type: 'negative' },
];

export function moodImgs(m) {
  const fb = m.emoji;
  return `<img class="mood-static" src="https://fonts.gstatic.com/s/e/notoemoji/latest/${m.cp}/512.png" alt="${fb}" onerror="this.outerHTML='${fb}'">`
    + `<img class="mood-anim" src="https://fonts.gstatic.com/s/e/notoemoji/latest/${m.cp}/512.webp" alt="${fb}" onerror="this.remove()">`;
}

/** V1 logMood: intensity slider → energy slider → save (once/day). */
export function logMoodDay(key) {
  const t = today();
  if (!S.mood) update((s) => { s.mood = { entries: [] }; }, { silent: true });
  if ((S.mood.entries || []).some((e) => e.date === t)) {
    showNotif('Already logged your mood today! Tap Analytics → Mood to review.', '🙂');
    return false;
  }
  const m = MOODS.find((x) => x.key === key);
  if (!m) return false;
  openIntensityPopup(m, t);
  return true;
}

function lockScreen() { document.body.classList.add('screen-locked'); }
function unlockScreen() { document.body.classList.remove('screen-locked'); }

function openIntensityPopup(m, t) {
  const mc = m.color;
  const ov = document.createElement('div');
  ov.className = 'overlay'; ov.style.zIndex = '9999';
  lockScreen();
  ov.addEventListener('click', (e) => { if (e.target === ov) { unlockScreen(); ov.remove(); } });
  ov.innerHTML = `<div class="overlay-box" style="border-color:${mc};max-width:340px">
    <img src="https://fonts.gstatic.com/s/e/notoemoji/latest/${m.cp}/512.webp" alt="${m.emoji}" style="width:72px;height:72px;display:block;margin:0 auto 8px" onerror="this.style.display='none'">
    <div style="font-size:20px;font-weight:700;margin-bottom:4px">${m.label}</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">How intense was this feeling?</div>
    <div style="position:relative;padding:0 8px">
      <input type="range" min="1" max="10" value="5" step="1" id="mood-int-slider" class="mood-slider"
        style="background:linear-gradient(to right,${mc} 44%,#333 44%)">
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-top:2px">
        <span>Mild</span><span id="mood-int-val" style="font-size:28px;font-weight:700;font-family:var(--font-display);color:${mc}">5</span><span>Intense</span>
      </div></div>
    <div class="mood-popup-btns">
      <button class="btn" id="mood-int-cancel">Cancel</button>
      <button class="btn btn-primary" id="mood-int-next" style="background:${mc};border-color:${mc}">Next →</button>
    </div></div>`;
  document.body.appendChild(ov);
  const sl = ov.querySelector('#mood-int-slider');
  const val = ov.querySelector('#mood-int-val');
  const sync = () => {
    const v = +sl.value;
    val.textContent = v;
    sl.style.background = `linear-gradient(to right,${mc} ${((v - 1) / 9) * 100}%,#333 ${((v - 1) / 9) * 100}%)`;
  };
  sl.addEventListener('input', sync);
  sync();
  ov.querySelector('#mood-int-cancel').onclick = () => { unlockScreen(); ov.remove(); };
  ov.querySelector('#mood-int-next').onclick = () => {
    const intensity = +sl.value;
    ov.remove();
    openEnergyPopup(m, t, intensity);
  };
}

function openEnergyPopup(m, t, intensity) {
  const mc = m.color;
  const ov = document.createElement('div');
  ov.className = 'overlay'; ov.style.zIndex = '9999';
  ov.addEventListener('click', (e) => { if (e.target === ov) { unlockScreen(); ov.remove(); } });
  ov.innerHTML = `<div class="overlay-box" style="border-color:${mc};max-width:340px">
    <img src="https://fonts.gstatic.com/s/e/notoemoji/latest/${m.cp}/512.webp" alt="${m.emoji}" style="width:48px;height:48px;display:block;margin:0 auto 4px" onerror="this.style.display='none'">
    <div style="font-size:16px;font-weight:600;margin-bottom:2px">${m.label} · Intensity ${intensity}/10</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">How's your energy level?</div>
    <div style="position:relative;padding:0 8px">
      <input type="range" min="1" max="10" value="5" step="1" id="mood-en-slider" class="mood-slider"
        style="background:linear-gradient(to right,${mc} 44%,#333 44%)">
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-top:2px">
        <span>Low</span><span id="mood-en-val" style="font-size:28px;font-weight:700;font-family:var(--font-display);color:${mc}">5</span><span>High</span>
      </div></div>
    <div class="mood-popup-btns">
      <button class="btn" id="mood-en-back">← Back</button>
      <button class="btn btn-primary" id="mood-en-save" style="background:${mc};border-color:${mc}">Log Mood ✓</button>
    </div></div>`;
  document.body.appendChild(ov);
  const sl = ov.querySelector('#mood-en-slider');
  const val = ov.querySelector('#mood-en-val');
  const sync = () => {
    const v = +sl.value;
    val.textContent = v;
    sl.style.background = `linear-gradient(to right,${mc} ${((v - 1) / 9) * 100}%,#333 ${((v - 1) / 9) * 100}%)`;
  };
  sl.addEventListener('input', sync);
  sync();
  ov.querySelector('#mood-en-back').onclick = () => { ov.remove(); openIntensityPopup(m, t); };
  ov.querySelector('#mood-en-save').onclick = () => {
    const energy = +sl.value;
    ov.remove();
    unlockScreen();
    update((s) => {
      s.mood.entries.push({ mood: m.key, note: '', date: t, ts: Date.now(), intensity, energy });
    });
    celebrateFirst('moodFirstLog', '🎭 First mood logged! Self-awareness is key.');
    awardXP(5, 'Mood Log');
    checkAchievements();
    showNotif(`Mood logged: ${m.label} (${intensity}/10 · ${energy}/10)`, m.emoji);
    window.ZF.rerender();
  };
}

export function calcStudyXP(dur, diff) {
  const m = { easy: 1, medium: 1.5, hard: 2.2 };
  return Math.round(dur * 1.5 * (m[diff] || 1.5));
}

export function renderMind(host, subTab) {
  if (subTab === 'zen' || subTab === 'study' || subTab === 'screentime') {
    if (subTab !== 'zen' && (zenRunning || zenPhase !== 'idle')) stopZenSession();
    sub = subTab;
  }
  host.innerHTML = `
  <div class="chart-tab-bar" data-no-swipe style="display:flex;gap:2px;margin-bottom:14px;overflow-x:auto">
    <div class="chart-tab${sub === 'zen' ? ' active' : ''}" data-mtab="zen">🧘 ZEN</div>
    <div class="chart-tab${sub === 'study' ? ' active' : ''}" data-mtab="study">📚 Study</div>
    <div class="chart-tab${sub === 'screentime' ? ' active' : ''}" data-mtab="screentime">📱 Screen Time</div>
  </div>
  <div id="mind-body"></div>`;
  host.querySelectorAll('[data-mtab]').forEach((t) => {
    t.onclick = () => window.ZF.go('mind', t.dataset.mtab);
  });
  const body = host.querySelector('#mind-body');
  if (sub === 'zen') renderZen(body);
  else if (sub === 'study') renderStudy(body);
  else renderScreenTime(body);
}

/* ═══════════ ZEN ═══════════ */
function renderZen(body) {
  body.innerHTML = '<div id="zen-content">' + buildZenContent() + '</div>';
  wireZenContent(body);
  loadSoundList(body);
}

function buildZenContent() {
  const z = S.zen || {};
  const t = today();
  const todayMin = (z.history && z.history[t]) || 0;
  const streak = z.currentStreak || 0;
  const totalSess = z.totalSessions || 0;
  const totalMin = z.totalMinutes || 0;
  const bestStreak = z.bestStreak || 0;
  let html = `<div class="zen-strip">`
    + `<div><b>${todayMin}</b><span>today</span></div><i></i>`
    + `<div><b>${streak}</b><span>streak</span></div><i></i>`
    + `<div><b>${totalSess}</b><span>sessions</span></div><i></i>`
    + `<div><b>${totalMin}</b><span>minutes</span></div>`
    + `</div>`;
  html += `<div class="zen-rail" id="zen-rail">`;
  Object.keys(ZEN_MODES).forEach((k) => {
    const m = ZEN_MODES[k];
    const a = zenMode === k;
    html += `<button class="zen-chip${a ? ' active' : ''}" data-zmode="${k}" style="${a ? `--zc:${m.color};border-color:${m.color}` : ''}">`
      + `<span class="zen-chip-i">${MODE_ICONS[k] || ''}</span><span>${m.label.replace(' Breathing', '').replace(' Pattern', '')}</span></button>`;
  });
  html += `</div><input type="hidden" id="zen-mode" value="${zenMode}">`;
  const modeData = ZEN_MODES[zenMode];
  html += `<div id="zen-card" class="zen-stage" style="${modeData ? `--zc:${modeData.color}` : ''}">`;
  html += (zenMode === 'custom' && !zenRunning) ? buildCustomEditor() : buildBreathingControls();
  html += `</div>`;
  html += soundscapeHTML();
  const sessions = (S.zen && S.zen.sessions) || [];
  const recent5 = sessions.slice(-5).reverse();
  if (recent5.length) {
    html += `<div class="section-title">Recent Sessions</div><div class="card mb12" style="padding:8px 12px">`;
    recent5.forEach((s) => {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-mid);font-size:11px">`
        + `<span style="color:var(--text-muted)">${escapeHtml(s.date || '—')}</span>`
        + `<span style="font-weight:600;color:var(--primary)">${s.minutes || s.duration || 0} min</span>`
        + `<span style="color:var(--text-muted);font-size:10px">${escapeHtml(s.mode || '—')}</span></div>`;
    });
    html += `<div style="text-align:center;padding:6px 0 2px;font-size:10px;color:var(--text-muted)">Best streak: ${bestStreak} days</div></div>`;
  }
  return html;
}

function buildCustomEditor() {
  return `<div class="zen-custom">
    <div class="zen-phase-row">
      <label>Inhale<input type="number" id="zen-inhale" value="4" min="1" max="20"></label>
      <label>Hold<input type="number" id="zen-hold1" value="0" min="0" max="30"></label>
      <label>Exhale<input type="number" id="zen-exhale" value="4" min="1" max="20"></label>
      <label>Hold<input type="number" id="zen-hold2" value="0" min="0" max="30"></label>
      <label>Cycles<input type="number" id="zen-cycles" value="10" min="1" max="200"></label>
    </div>
    <div class="flex gap8 mt8">
      <input type="text" id="zen-custom-name" placeholder="Pattern name…" maxlength="40" style="flex:1">
      <input type="color" id="zen-color" value="#00C8FF" style="width:44px;height:40px;padding:2px;flex-shrink:0">
    </div>
    <button class="btn btn-primary btn-full mt8" id="zen-start">▶ Start Custom Session</button></div>`;
}

function buildBreathingControls() {
  if (zenRunning || zenPhase !== 'idle') return buildInProgressHTML();
  const m = ZEN_MODES[zenMode];
  if (!m) return '';
  if (zenMode === 'custom') return `<div class="zen-startwrap"><button class="btn btn-primary btn-full" id="zen-start">▶ Begin Custom Session</button></div>`;
  if (zenMode === 'hold') return `<div class="zen-startwrap"><button class="btn btn-primary btn-full" id="zen-start">▶ Start Breath Hold Test</button></div>`;
  const totalTime = m.cycles * (m.inhale + m.hold1 + m.exhale + m.hold2);
  const est = totalTime < 60 ? `${totalTime} sec` : `${Math.round(totalTime / 60)} min`;
  const phaseBox = (id, label, val) => `<label class="zen-phasebox"><span>${label}</span>`
    + `<input type="number" id="${id}" value="${val}" min="0" max="30"></label>`;
  return `<div class="zen-controls">
    <div class="zen-phase-row">
      ${phaseBox('zen-inhale', 'Inhale')}
      ${m.hold1 > 0 ? phaseBox('zen-hold1', 'Hold') : ''}
      ${phaseBox('zen-exhale', 'Exhale')}
      ${m.hold2 > 0 ? phaseBox('zen-hold2', 'Hold') : ''}
    </div>
    <div class="zen-meta">
      <label class="zen-cycles">Cycles <input type="number" id="zen-cycles" value="${m.cycles}" min="1" max="200"></label>
      <span class="zen-est">~ ${est}</span>
    </div>
    <button class="btn btn-primary btn-full" id="zen-start">▶ Begin · ${m.label.replace(' Breathing', '')}</button>
  </div>`;
}

function buildInProgressHTML() {
  const m = ZEN_MODES[zenMode] || ZEN_MODES.equal;
  const phaseLabel = zenPhase === 'inhale' ? 'Inhale' : zenPhase === 'hold1' ? 'Hold' : zenPhase === 'exhale' ? 'Exhale' : zenPhase === 'hold2' ? 'Hold' : zenPhase === 'hold' ? 'Hold' : 'Ready';
  const phaseColor = zenPhase === 'inhale' || zenPhase === 'hold' ? m.color : zenPhase === 'exhale' ? '#F0A000' : zenPhase === 'hold1' || zenPhase === 'hold2' ? '#4CDB8A' : '#888';
  const pct = zenMode === 'hold' ? Math.min(100, Math.round((zenElapsed / 120) * 100)) : 0;
  const scale = zenPhase === 'inhale' ? '1' : zenPhase === 'exhale' ? '0.6' : zenPhase === 'hold1' || zenPhase === 'hold2' ? '0.85' : zenPhase === 'hold' ? Math.max(0.3, 1 - zenElapsed / 120) : '0.5';
  return `<div style="padding:20px 0 16px">`
    + `<div class="zen-timer" style="font-size:48px;font-weight:300;letter-spacing:4px;font-family:var(--font-display);color:${phaseColor}">${fmtClock(zenElapsed)}</div>`
    + `<div class="zen-phase" style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:3px;color:${phaseColor};margin-top:2px">${phaseLabel} · cycle ${zenCycle}/${zenTotalCycles}</div>`
    + `<div style="margin:16px auto;position:relative;width:200px;height:200px;display:flex;align-items:center;justify-content:center">`
    + `<svg width="200" height="200" style="position:absolute;transform:rotate(-90deg)"><circle cx="100" cy="100" r="90" fill="none" stroke="var(--border-mid)" stroke-width="3"/><circle id="zen-progress-ring" cx="100" cy="100" r="90" fill="none" stroke="${phaseColor}" stroke-width="3" stroke-linecap="round" stroke-dasharray="565" stroke-dashoffset="${565 * (1 - pct / 100)}"/></svg>`
    + `<div class="zen-circle" id="zen-breath-circle" style="width:140px;height:140px;border-radius:50%;background:radial-gradient(circle,${phaseColor}22,${phaseColor}08);border:2px solid ${phaseColor}44;transform:scale(${scale});transition:transform 0.8s;display:flex;align-items:center;justify-content:center">`
    + `<span style="font-size:28px">${MODE_ICONS[zenMode] || '🧘'}</span></div></div>`
    + `<div class="flex gap8" style="justify-content:center"><button class="btn btn-ghost" id="zen-quit">End Session</button></div></div>`;
}

function wireZenContent(body) {
  body.querySelectorAll('[data-zmode]').forEach((c) => {
    c.onclick = () => {
      if (zenRunning) return;
      zenMode = c.dataset.zmode;
      const zc = body.querySelector('#zen-content');
      if (zc) { zc.innerHTML = buildZenContent(); wireZenContent(body); }
    };
  });
  const start = body.querySelector('#zen-start');
  if (start) start.onclick = () => startZen(body);
  const quit = body.querySelector('#zen-quit');
  if (quit) quit.onclick = () => { stopZenSession(); window.ZF.rerender(); };
  body.querySelectorAll('[data-zsnd]').forEach((b) => {
    b.onclick = () => toggleZenSound(b.dataset.zsnd);
  });
}

function soundscapeHTML() {
  const list = [...(zenSoundList.length ? zenSoundList : ZEN_SOUNDS_BUILTIN)];
  if (!list.some((s) => s.id === 'silence')) list.push({ id: 'silence', label: 'Silence', icon: '🔇' });
  return `<div class="card mb12"><div class="section-title" style="display:flex;align-items:center;gap:8px"><span>🔊 Ambient</span><span style="font-weight:400;text-transform:none;letter-spacing:0">Soundscape</span></div>`
    + `<div style="display:flex;gap:6px;flex-wrap:wrap">`
    + list.map((s) => `<button class="zen-sound-btn${zenSoundSrc === s.id ? ' active' : ''}" data-zsnd="${s.id}">${s.icon || ''} ${s.label}</button>`).join('')
    + `</div><div style="font-size:10px;color:var(--text-muted);margin-top:8px">Sounds play locally while meditating</div></div>`;
}

function loadSoundList(body) {
  if (zenSoundList.length) return;
  zenSoundList = ZEN_SOUNDS_BUILTIN.slice();
  fetch('assets/zen/index.json').then((r) => (r.ok ? r.json() : null)).then((data) => {
    if (data?.length) {
      zenSoundList = data;
      if (document.getElementById('zen-content')) window.ZF.rerender();
    }
  }).catch(() => {});
}

function toggleZenSound(id) {
  if (id === 'silence') { stopZenSound(); window.ZF.rerender(); return; }
  if (zenSoundSrc === id) { stopZenSound(); window.ZF.rerender(); return; }
  stopZenSound();
  try {
    let el = zenAudioEls[id];
    if (!el) {
      el = document.createElement('audio');
      el.loop = true; el.preload = 'none';
      el.src = `assets/zen/${id}.mp3`;
      el.volume = 0.4;
      zenAudioEls[id] = el;
    }
    el.currentTime = 0;
    el.play().catch(() => {});
  } catch {}
  zenSoundSrc = id;
  window.ZF.rerender();
}

function stopZenSound() {
  if (zenSoundSrc && zenAudioEls[zenSoundSrc]) {
    try { zenAudioEls[zenSoundSrc].pause(); zenAudioEls[zenSoundSrc].currentTime = 0; } catch {}
  }
  zenSoundSrc = null;
  Object.values(zenAudioEls).forEach((a) => { try { a.pause(); } catch {} });
}

/* ── Session engine ── */
function fmtClock(s) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function startZen(body) {
  if (zenRunning) return;
  const modeVal = body.querySelector('#zen-mode')?.value || zenMode;
  zenMode = ZEN_MODES[modeVal] ? modeVal : 'equal';
  if (zenMode === 'custom') {
    zenCycle = 1;
    zenTotalCycles = sanitizeNumber(body.querySelector('#zen-cycles')?.value, { min: 1, max: 200, fallback: 10, integer: true });
  } else {
    const md = ZEN_MODES[zenMode];
    zenCycle = 1;
    zenTotalCycles = sanitizeNumber(body.querySelector('#zen-cycles')?.value, { min: 1, max: 500, fallback: md.cycles || 1, integer: true });
  }
  zenRunning = true; zenPhase = 'inhale'; zenStartTime = Date.now(); zenElapsed = 0;
  refreshZenCard();
  sfx('xp');
  showZenOverlay();
  if (zenMode === 'hold') { runHoldTest(); return; }
  zenTick = 0; zenPhaseDuration = getPhaseDuration(body);
  zenTimer = setInterval(() => zenTickFn(body), 1000);
}

function getPhaseDuration(body) {
  const md = zenMode === 'custom' ? null : ZEN_MODES[zenMode];
  const val = (sel, fb) => sanitizeNumber(body?.querySelector(sel)?.value, { min: 0, max: 60, fallback: fb, integer: true });
  if (zenPhase === 'inhale') return md ? md.inhale : val('#zen-inhale', 4);
  if (zenPhase === 'hold1') return md ? md.hold1 : val('#zen-hold1', 0);
  if (zenPhase === 'exhale') return md ? md.exhale : val('#zen-exhale', 4);
  if (zenPhase === 'hold2') return md ? md.hold2 : val('#zen-hold2', 0);
  return 0;
}

function zenTickFn(body) {
  if (!zenRunning) { clearInterval(zenTimer); return; }
  zenTick++;
  zenElapsed = Math.round((Date.now() - zenStartTime) / 1000);
  if (document.getElementById('zen-overlay')) updateZenOverlay();
  else refreshZenCard();
  if (zenTick >= zenPhaseDuration) {
    clearInterval(zenTimer);
    if (!zenRunning) return;
    sfx('notif');
    if (zenPhase === 'inhale') {
      const md = zenMode === 'custom' ? null : ZEN_MODES[zenMode];
      if (md && md.hold1 > 0) {
        zenPhase = 'hold1'; zenTick = 0; zenPhaseDuration = getPhaseDuration(body);
        zenTimer = setInterval(() => zenTickFn(body), 1000); return;
      }
      zenPhase = 'exhale'; zenTick = 0; zenPhaseDuration = getPhaseDuration(body);
      zenTimer = setInterval(() => zenTickFn(body), 1000); return;
    }
    if (zenPhase === 'hold1') {
      zenPhase = 'exhale'; zenTick = 0; zenPhaseDuration = getPhaseDuration(body);
      zenTimer = setInterval(() => zenTickFn(body), 1000); return;
    }
    if (zenPhase === 'exhale') {
      const md = zenMode === 'custom' ? null : ZEN_MODES[zenMode];
      if (md && md.hold2 > 0) {
        zenPhase = 'hold2'; zenTick = 0; zenPhaseDuration = getPhaseDuration(body);
        zenTimer = setInterval(() => zenTickFn(body), 1000); return;
      }
      nextCycle(body); return;
    }
    if (zenPhase === 'hold2') nextCycle(body);
  }
}

function nextCycle(body) {
  if (zenCycle >= zenTotalCycles) { completeZen(); return; }
  zenCycle++;
  zenPhase = 'inhale'; zenTick = 0; zenPhaseDuration = getPhaseDuration(body);
  zenTimer = setInterval(() => zenTickFn(body), 1000);
}

function runHoldTest() {
  zenPhase = 'hold'; zenElapsed = 0;
  sfx('xp');
  showZenOverlay();
  zenTimer = setInterval(() => {
    if (!zenRunning) { clearInterval(zenTimer); return; }
    zenElapsed++;
    if (document.getElementById('zen-overlay')) updateZenOverlay();
    else {
      const pct = Math.min(100, Math.round((zenElapsed / 120) * 100));
      document.getElementById('zen-progress-ring')?.setAttribute('stroke-dashoffset', 628 * (1 - pct / 100));
      const el = document.getElementById('zen-breath-circle');
      if (el) el.style.transform = `scale(${Math.max(0.3, 1 - zenElapsed / 120)})`;
      const t = document.getElementById('zen-timer');
      if (t) t.textContent = fmtClock(zenElapsed);
    }
  }, 1000);
}

function completeZen() {
  zenRunning = false; clearInterval(zenTimer); stopZenSound();
  sfx('quest');
  const mins = Math.round(zenElapsed / 60) || 1;
  const xp = Math.round(mins * 5 + (zenCycle > 1 ? zenTotalCycles * 2 : 0));
  const t = today();
  update((s) => {
    s.zen = s.zen || { totalSessions: 0, totalMinutes: 0, currentStreak: 0, bestStreak: 0, lastSessionDate: null, sessions: [], history: {} };
    s.zen.totalSessions++; s.zen.totalMinutes += mins;
    s.zen.history = s.zen.history || {};
    s.zen.history[t] = (s.zen.history[t] || 0) + mins;
    const modeLabel = ZEN_MODES[zenMode]?.label || 'Custom';
    s.zen.sessions.push({ date: t, minutes: mins, mode: modeLabel, xp, ts: Date.now() });
    const dates = Object.keys(s.zen.history).sort().reverse();
    let streak = 0;
    const cursor = new Date();
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!dates.includes(fmt(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (dates.includes(fmt(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
    s.zen.currentStreak = streak;
    s.zen.bestStreak = Math.max(s.zen.bestStreak || 0, streak);
    s.zen.lastSessionDate = t;
  });
  celebrateFirst('zenFirstMeditation', '🧘 First meditation complete! Inner peace grows.');
  awardXP(xp, 'Zen session complete!');
  updStat('wisdom', 2);
  checkAutoQuests();
  checkAchievements();
  zenPhase = 'idle'; zenTimer = null;
  document.getElementById('zen-overlay')?.remove();
  showNotif(`🧘 Zen session complete! +${xp} XP`, 'OK');
  window.ZF.rerender();
}

function completeHoldTest() {
  zenRunning = false; clearInterval(zenTimer); stopZenSound();
  sfx('quest');
  const sec = zenElapsed;
  const xp = Math.round(sec * 0.5);
  const t = today();
  update((s) => {
    s.zen = s.zen || { totalSessions: 0, totalMinutes: 0, currentStreak: 0, bestStreak: 0, lastSessionDate: null, sessions: [], history: {} };
    s.zen.totalSessions++;
    s.zen.sessions.push({ date: t, minutes: 0, mode: 'Breath Hold Test', xp, holdSec: sec, ts: Date.now() });
  });
  awardXP(xp, `Zen: Breath Hold (${sec}s)`);
  updStat('discipline', 3); updStat('wisdom', 2);
  zenPhase = 'idle'; zenTimer = null;
  document.getElementById('zen-overlay')?.remove();
  showNotif(`🫁 Breath held for ${sec}s! +${xp} XP`, 'OK');
  window.ZF.rerender();
}

function stopZenSession() {
  if (zenRunning || zenPhase !== 'idle') {
    zenRunning = false; zenPaused = false;
    clearInterval(zenTimer); stopZenSound();
    zenPhase = 'idle'; zenTimer = null;
    document.getElementById('zen-overlay')?.remove();
  }
}

function refreshZenCard() {
  const el = document.getElementById('zen-card');
  if (!el) return;
  if (!zenRunning && zenPhase === 'idle') {
    const cur = zenMode;
    const tmp = document.createElement('div');
    tmp.innerHTML = `<div>${buildBreathingControls(cur)}</div>`;
    el.innerHTML = `<div style="background:${(ZEN_MODES[cur]?.color || '#7B5EFF') + '11'};padding:4px 0 0 0">${tmp.firstChild.innerHTML}</div>`;
    const start = el.querySelector('#zen-start');
    if (start) start.onclick = () => startZen(document.getElementById('mind-body') || document.body);
    return;
  }
  el.innerHTML = `<div style="padding:4px 0 0 0">${buildInProgressHTML()}</div>`;
  const quit = el.querySelector('#zen-quit');
  if (quit) quit.onclick = () => { stopZenSession(); window.ZF.rerender(); };
}

function showZenOverlay() {
  document.getElementById('zen-overlay')?.remove();
  const o = document.createElement('div');
  o.className = 'overlay'; o.id = 'zen-overlay';
  o.innerHTML = `<div class="overlay-box" id="zen-overlay-box"></div>`;
  o.addEventListener('pointerdown', (e) => { if (e.target === o) { stopZenSession(); o.remove(); window.ZF.rerender(); } });
  document.body.appendChild(o);
  updateZenOverlay();
  const box = document.getElementById('zen-overlay-box');
  const quit = document.createElement('button');
  quit.className = 'btn btn-ghost mt12';
  quit.textContent = zenMode === 'hold' ? 'Release (finish)' : 'End Session';
  quit.onclick = () => {
    if (zenMode === 'hold' && zenPhase === 'hold') completeHoldTest();
    else { stopZenSession(); }
    document.getElementById('zen-overlay')?.remove();
    window.ZF.rerender();
  };
  box.appendChild(quit);
}

function updateZenOverlay() {
  const box = document.getElementById('zen-overlay-box');
  if (!box) return;
  const m = ZEN_MODES[zenMode] || ZEN_MODES.equal;
  const label = zenPhase === 'hold' ? `Holding… ${zenElapsed}s` : `${zenPhase} · cycle ${zenCycle}/${zenTotalCycles} · ${fmtClock(zenElapsed)}`;
  let inner = box.querySelector('#zen-ov-inner');
  if (!inner) {
    inner = document.createElement('div');
    inner.id = 'zen-ov-inner';
    box.insertBefore(inner, box.firstChild);
  }
  inner.innerHTML = `<div class="zen-circle" style="width:130px;height:130px;margin:0 auto;border-color:${m.color}">`
    + `<div><div class="zen-timer" style="font-size:30px">${fmtClock(zenElapsed)}</div>`
    + `<div class="zen-phase" style="color:${m.color}">${label}</div></div></div>`;
}

/* ═══════════ STUDY ═══════════ */
function renderStudy(host) {
  const t = today();
  const todayS = (S.study.sessions || []).filter((s) => s.date === t);
  const totalMins = todayS.reduce((a, b) => a + (b.duration || 0), 0);
  const subjects = S.study.subjects || [];
  const mm = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
  const ss = String(timerSeconds % 60).padStart(2, '0');
  const circ = 2 * Math.PI * 54;

  host.innerHTML = `
  <div class="card mb16">
    <div class="section-title">Study Timer</div>
    <div class="grid2" style="gap:8px;margin-bottom:12px">
      <div><label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Subject</label>
        <input type="text" id="t-subject" value="${escapeHtml(timerSubject)}" placeholder="e.g. Mathematics" list="subj-list" maxlength="60">
        <datalist id="subj-list">${subjects.map((s) => `<option value="${escapeHtml(s)}">`).join('')}</datalist></div>
      <div><label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Topic</label>
        <input type="text" id="t-topic" value="${escapeHtml(timerTopic)}" placeholder="e.g. Quadratic equations" maxlength="80"></div>
      <div><label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Difficulty</label>
        <select id="t-diff">
          <option value="easy"${timerDiff === 'easy' ? ' selected' : ''}>Easy</option>
          <option value="medium"${timerDiff === 'medium' ? ' selected' : ''}>Medium</option>
          <option value="hard"${timerDiff === 'hard' ? ' selected' : ''}>Hard</option>
        </select></div>
    </div>
    <div style="text-align:center;padding:20px 0">
      <div style="position:relative;width:140px;height:140px;margin:0 auto">
        <svg width="140" height="140" class="timer-ring">
          <circle cx="70" cy="70" r="54" fill="none" stroke="var(--bg-overlay)" stroke-width="8"/>
          <circle id="st-ring" cx="70" cy="70" r="54" fill="none" stroke="${timerRunning ? 'var(--success)' : 'var(--primary)'}" stroke-width="8"
            stroke-dasharray="${circ}" stroke-dashoffset="${timerRunning ? 0 : circ}" stroke-linecap="round" style="transition:stroke-dashoffset .5s"/>
        </svg>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column">
          <div class="timer-display" id="st-time" style="color:${timerRunning ? 'var(--success)' : 'var(--text-primary)'}">${mm}:${ss}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${timerRunning ? 'studying...' : 'paused'}</div>
        </div>
      </div>
      <div style="display:flex;gap:12px;justify-content:center;margin-top:16px" id="st-btns"></div>
      ${timerSeconds > 0 && !timerRunning ? `<div style="font-size:12px;color:var(--warning);margin-top:8px">Paused at ${mm}:${ss} — press Start to resume or Save to log.</div>` : ''}
    </div>
  </div>
  <div class="card mb16">
    <div class="section-title">Manual Log Session</div>
    <div class="grid2" style="gap:8px;margin-bottom:8px">
      <input type="text" id="s-subject" placeholder="Subject..." list="subj-list2" maxlength="60">
      <datalist id="subj-list2">${subjects.map((s) => `<option value="${escapeHtml(s)}">`).join('')}</datalist>
      <input type="text" id="s-topic" placeholder="Topic..." maxlength="80">
      <input type="number" id="s-duration" placeholder="Duration (mins)" min="1" max="600">
      <select id="s-diff"><option value="easy">Easy</option><option value="medium" selected>Medium</option><option value="hard">Hard</option></select>
    </div>
    <textarea id="s-notes" placeholder="Notes..." style="height:44px;margin-bottom:8px" maxlength="200"></textarea>
    <div id="s-xp-prev" style="font-size:13px;color:var(--text-muted);margin-bottom:8px"></div>
    <button class="btn btn-primary" id="s-log">Log Session</button>
  </div>
  <div class="section-title">Subjects</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px" id="st-subjects"></div>
  <div class="section-title">Today's Sessions (${todayS.length} · ${totalMins} min)</div>
  <div id="st-history"></div>`;

  host.querySelector('#t-subject').onchange = (e) => { timerSubject = e.target.value; };
  host.querySelector('#t-topic').onchange = (e) => { timerTopic = e.target.value; };
  host.querySelector('#t-diff').onchange = (e) => { timerDiff = e.target.value; };
  paintTimerBtns(host);

  const tickUI = () => {
    const m2 = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
    const s2 = String(timerSeconds % 60).padStart(2, '0');
    const t = host.querySelector('#st-time');
    if (t) t.textContent = `${m2}:${s2}`;
  };
  if (timerRunning && !timerInterval) {
    timerInterval = setInterval(() => { timerSeconds++; tickUI(); }, 1000);
  }

  host.querySelector('#s-duration').oninput = () => previewSXP(host);
  host.querySelector('#s-diff').onchange = () => previewSXP(host);
  host.querySelector('#s-log').onclick = () => {
    const subject = sanitizeText(host.querySelector('#s-subject').value, 60);
    const dur = sanitizeNumber(host.querySelector('#s-duration').value, { min: 0, max: 600, fallback: 0, integer: true });
    if (!subject) { showNotif('Enter a subject', '!'); return; }
    if (dur <= 0) { showNotif('Enter duration', '!'); return; }
    const diff = host.querySelector('#s-diff').value || 'medium';
    const xp = calcStudyXP(dur, diff);
    update((s) => {
      s.study.sessions = [...(s.study.sessions || []), {
        subject, topic: sanitizeText(host.querySelector('#s-topic').value, 80), duration: dur,
        difficulty: diff, notes: sanitizeText(host.querySelector('#s-notes').value, 200),
        date: today(), ts: Date.now(), xp,
      }];
      if (!(s.study.subjects || []).includes(subject)) s.study.subjects = [...(s.study.subjects || []), subject];
    });
    updStat('discipline', 3);
    awardXP(xp, 'Study session logged!');
    checkAutoQuests();
    checkAchievements();
  };

  const subBox = host.querySelector('#st-subjects');
  if (!subjects.length) subBox.innerHTML = '<span style="color:var(--text-muted);font-size:13px">Subjects appear here as you log.</span>';
  subjects.forEach((sname) => {
    const mins = (S.study.sessions || []).filter((x) => x.subject === sname).reduce((a, x) => a + (x.duration || 0), 0);
    const chip = document.createElement('div');
    chip.className = 'card-sm';
    chip.style.fontSize = '12px';
    chip.textContent = `${sname} · ${mins}m`;
    subBox.appendChild(chip);
  });

  const hist = host.querySelector('#st-history');
  todayS.slice().reverse().forEach((sess) => {
    const gi = S.study.sessions.indexOf(sess);
    const row = document.createElement('div');
    row.className = 'quest-card';
    row.innerHTML = `<div style="font-size:20px">📚</div><div style="flex:1">`
      + `<div style="font-size:13px">${escapeHtml(sess.subject)}${sess.topic ? ` <span style="color:var(--text-muted)">· ${escapeHtml(sess.topic)}</span>` : ''}</div>`
      + `<div style="font-size:11px;color:var(--text-muted)">${sess.duration} min · ${escapeHtml(sess.difficulty || 'medium')} · +${sess.xp ?? calcStudyXP(sess.duration, sess.difficulty)} XP</div></div>`
      + `<button class="btn btn-icon btn-sm" data-sdel="${gi}" style="color:var(--danger)">×</button>`;
    row.querySelector('[data-sdel]').onclick = () => {
      const xp = S.study.sessions[gi]?.xp || 0;
      update((s) => { s.study.sessions.splice(gi, 1); });
      if (xp > 0) deductXP(xp, 'Study removed');
    };
    hist.appendChild(row);
  });
}

function previewSXP(host) {
  const dur = sanitizeNumber(host.querySelector('#s-duration').value, { min: 0, max: 600, fallback: 0, integer: true });
  const diff = host.querySelector('#s-diff').value || 'medium';
  const el = host.querySelector('#s-xp-prev');
  if (el && dur > 0) el.innerHTML = `Estimated: <span style="color:var(--warning);font-weight:600">+${calcStudyXP(dur, diff)} XP</span>`;
}
function paintTimerBtns(host) {
  const box = host.querySelector('#st-btns');
  if (timerRunning) {
    box.innerHTML = `<button class="btn btn-danger btn-sm" id="st-pause">❚❚ Pause</button><button class="btn btn-green btn-sm" id="st-save">✓ Save Session</button>`;
    box.querySelector('#st-pause').onclick = () => {
      timerRunning = false;
      clearInterval(timerInterval); timerInterval = null;
      window.ZF.rerender();
    };
    box.querySelector('#st-save').onclick = () => stopStudyTimer();
  } else {
    box.innerHTML = `<button class="btn btn-primary" id="st-start">▶ Start Timer</button>${timerSeconds > 0 ? '<button class="btn btn-danger btn-sm" id="st-reset">× Reset</button>' : ''}`;
    box.querySelector('#st-start').onclick = () => {
      const subj = sanitizeText(host.querySelector('#t-subject').value, 60);
      if (subj) timerSubject = subj;
      const top = sanitizeText(host.querySelector('#t-topic').value, 80);
      if (top) timerTopic = top;
      timerDiff = host.querySelector('#t-diff').value || 'medium';
      timerRunning = true;
      clearInterval(timerInterval);
      timerInterval = setInterval(() => {
        timerSeconds++;
        const t = document.querySelector('#st-time');
        if (t) t.textContent = `${String(Math.floor(timerSeconds / 60)).padStart(2, '0')}:${String(timerSeconds % 60).padStart(2, '0')}`;
      }, 1000);
      window.ZF.rerender();
    };
    const reset = box.querySelector('#st-reset');
    if (reset) reset.onclick = () => { timerSeconds = 0; window.ZF.rerender(); };
  }
}

function stopStudyTimer() {
  timerRunning = false;
  clearInterval(timerInterval); timerInterval = null;
  const dur = Math.max(1, Math.round(timerSeconds / 60));
  const subj = timerSubject || 'Study';
  const xp = calcStudyXP(dur, timerDiff);
  update((s) => {
    s.study.sessions = [...(s.study.sessions || []), {
      subject: subj, topic: timerTopic, duration: dur, difficulty: timerDiff,
      notes: 'Timer session', date: today(), ts: Date.now(), xp, timerBased: true,
    }];
    if (!(s.study.subjects || []).includes(subj)) s.study.subjects = [...(s.study.subjects || []), subj];
  });
  updStat('discipline', 3);
  if (timerDiff === 'hard') updStat('discipline', 2);
  awardXP(xp, `${subj} study session!`);
  checkAutoQuests();
  checkAchievements();
  timerSeconds = 0; timerSubject = ''; timerTopic = ''; timerDiff = 'medium';
  showNotif(`Session saved: ${dur} min of ${subj} (+${xp} XP)`, '📚');
}

/* ═══════════ SCREEN TIME ═══════════ */
function renderScreenTime(host) {
  const t = today();
  const limit = S.screenTimeLimit || 120;
  const used = (S.screenTime || {})[t] || 0;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const over = used > limit;
  const remaining = Math.max(0, limit - used);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push({ label: d.toLocaleDateString([], { weekday: 'short' }), mins: (S.screenTime || {})[ds] || 0 });
  }
  const maxMins = Math.max(...days.map((d) => d.mins), limit, 1);

  host.innerHTML = `
  ${isRestDay(t) ? '<div class="insight mb12">🛌 Rest day — no focus pressure, no XP deduction. Recharge.</div>' : ''}
  <div class="card mb12" style="background:linear-gradient(135deg,${over ? '#1a0505' : '#051a0d'},${over ? '#0d0202' : '#020d05'});border:1px solid ${over ? 'var(--danger)' : 'var(--success)'}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
      <div><div style="font-size:11px;color:var(--text-muted);letter-spacing:1px">TODAY'S SCREEN TIME</div>
        <div style="font-size:36px;font-weight:800;font-family:var(--font-display);color:${over ? 'var(--danger)' : 'var(--success)'};margin-top:4px">${Math.floor(used / 60)}h ${used % 60}m</div>
        <div style="font-size:12px;color:var(--text-muted)">Limit: ${Math.floor(limit / 60)}h ${limit % 60}m · ${over ? `EXCEEDED by ${used - limit}min` : `${remaining}min remaining`}</div></div>
      <div style="width:64px;height:64px;border-radius:50%;border:3px solid ${over ? 'var(--danger)' : 'var(--success)'};display:flex;align-items:center;justify-content:center;background:var(--bg-raised)">
        <span style="font-size:14px;font-weight:700;color:${over ? 'var(--danger)' : 'var(--success)'}">${pct}%</span></div>
    </div>
    <div style="height:8px;background:var(--bg-overlay);border-radius:4px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:${over ? 'var(--danger)' : 'var(--success)'};border-radius:4px;transition:width .5s"></div></div>
    <div class="flex gap8 mt12"><input type="number" id="stl-limit" value="${limit}" min="30" max="960" step="10" style="max-width:110px" aria-label="Daily limit minutes">
      <button class="btn btn-sm" id="stl-set">Set limit</button>
      <input type="number" id="st-add" placeholder="+ min" min="1" max="600" style="max-width:110px" aria-label="Add minutes">
      <button class="btn btn-sm btn-primary" id="st-btn">Log</button></div>
  </div>
  <div class="card mb12"><div class="section-title">7-Day History</div>
    <div style="display:flex;gap:4px;align-items:flex-end;height:80px;padding-top:8px">
      ${days.map((d) => {
        const h = Math.round((d.mins / maxMins) * 64);
        const col = d.mins > limit ? 'var(--danger)' : d.mins > limit * 0.75 ? 'var(--warning)' : 'var(--success)';
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">`
          + `<div style="width:100%;background:${col};height:${h}px;border-radius:3px 3px 0 0;min-height:2px"></div>`
          + `<div style="font-size:9px;color:var(--text-muted)">${d.label}</div>`
          + `<div style="font-size:9px;color:${col}">${Math.floor(d.mins / 60)}h${d.mins % 60}m</div></div>`;
      }).join('')}
    </div>
    <div style="display:flex;gap:12px;justify-content:center;margin-top:8px;font-size:10px">
      <span style="color:var(--success)">■ Under limit</span>
      <span style="color:var(--warning)">■ 75%+</span>
      <span style="color:var(--danger)">■ Over limit</span></div>
  </div>
  <div class="card"><div class="section-title">Screen Time Tips</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.7">
      › Use app in focused sessions — log workout, check nutrition, close app<br>
      › Enable Do Not Disturb during study sessions<br>
      › 2 hours of recreational phone use = good baseline limit<br>
      › Every 30min below limit = extra focus time for real-world tasks</div></div>`;

  host.querySelector('#stl-set').onclick = () => {
    const v = sanitizeNumber(host.querySelector('#stl-limit').value, { min: 30, max: 960, fallback: 120, integer: true });
    update((s) => { s.screenTimeLimit = v; }, { silent: true });
    window.ZF.save();
    window.ZF.rerender();
  };
  host.querySelector('#st-btn').onclick = () => {
    const v = sanitizeNumber(host.querySelector('#st-add').value, { min: 1, max: 600, fallback: NaN, integer: true });
    if (!Number.isFinite(v)) return;
    update((s) => { s.screenTime = { ...(s.screenTime || {}), [t]: ((s.screenTime || {})[t] || 0) + v }; });
  };
}
