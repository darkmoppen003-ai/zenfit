/* ── ZenFit V2 · features/guide.js ─────────────────────────
   Tutorial system (driver.js spotlight tours):
   first-launch welcome → profile setup → dashboard tour.
   "Review Tutorial" replays the tour on demand.
────────────────────────────────────────────────────────────── */
import { sanitizeEnum, sanitizeNumber, sanitizeText } from '../core/sanitize.js';
import { S, update } from '../core/store.js';
import { showNotif } from '../core/ui.js';
import { getTodayStr, GOAL_OPTS } from '../core/utils.js';

export function maybeOnboard() {
  if (S.onboarding?.completed) return;
  const hasData = (S.player?.xp || 0) > 0 || (S.nutrition?.entries || []).length > 0
    || (S.workouts || []).length > 0 || (S.habits || []).length > 0 || (S.tasks || []).length > 0;
  if (hasData) {
    update((s) => { s.onboarding = { completed: true }; }, { silent: true });
    window.ZF.save();
    return;
  }
  welcome();
}

function shell(inner) {
  document.getElementById('guide-card')?.remove();
  const c = document.createElement('div');
  c.className = 'guide-card'; c.id = 'guide-card';
  c.innerHTML = inner;
  document.body.appendChild(c);
  return c;
}

function welcome() {
  const c = shell(`<div class="guide-mascot-lg"></div>
    <h2>Hiya, hunter! I'm Mochi!</h2>
    <p>I'm your training buddy. This way — train, eat, hydrate, breathe, and watch your hunter rise through the ranks. First, 6 tiny questions (45 seconds, promise).</p>
    <button class="btn btn-primary btn-full" id="g-start">Say hi →</button>
    <button class="btn btn-ghost btn-full mt8" id="g-skip">Explore first</button>`);
  c.querySelector('#g-start').onclick = () => askName({});
  c.querySelector('#g-skip').onclick = () => { finish(false); };
}

function stepShell(stepNo, heading, sub, fieldHtml, nextLabel, onNext, onSkip) {
  const c = shell(`<div class="guide-mascot-lg"></div>
    <div style="font-size:10px;color:var(--text-muted);letter-spacing:2px">STEP ${stepNo} OF 6 · MOCHI ASKS</div>
    <h2>${heading}</h2><p>${sub}</p>
    ${fieldHtml}
    <button class="btn btn-primary btn-full" id="g-next">${nextLabel}</button>
    <button class="btn btn-ghost btn-full mt8" id="g-step-skip">Skip</button>`);
  c.querySelector('#g-next').onclick = () => onNext(c);
  c.querySelector('#g-step-skip').onclick = () => onSkip(c);
  const first = c.querySelector('input,select');
  if (first) {
    first.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); c.querySelector('#g-next').click(); } };
    setTimeout(() => { try { first.focus({ preventScroll: true }); } catch {} }, 100);
  }
  return c;
}

function askName(stash) {
  stepShell(1, "What should I call you?", "Every hunter needs a name for the leaderboard.",
    `<div class="onboarding-field"><input type="text" id="g-name" placeholder="e.g. Kai" maxlength="40" autocomplete="off"></div>`,
    'Next →',
    (c) => {
      stash.name = sanitizeText(c.querySelector('#g-name').value, 40) || 'Hunter';
      askAge(stash);
    },
    () => { stash.name = 'Hunter'; askAge(stash); });
}

function askAge(stash) {
  stepShell(2, `Nice to meet you, ${escapeName(stash.name)}!`, "How old are you? I use it for calorie math — nothing leaves your device.",
    `<div class="onboarding-field"><input type="number" id="g-age" placeholder="e.g. 24" min="10" max="100" inputmode="numeric"></div>`,
    'Next →',
    (c) => {
      stash.age = sanitizeNumber(c.querySelector('#g-age').value, { min: 10, max: 100, fallback: 25, integer: true });
      askWeight(stash);
    },
    () => { stash.age = 25; askWeight(stash); });
}

function askWeight(stash) {
  stepShell(3, "What's your morning weight?", "One number unlocks body stats, burn math and the Scale Watcher badge.",
    `<div class="onboarding-field"><input type="number" id="g-w" placeholder="e.g. 70 kg" min="25" max="300" step="any" inputmode="decimal"></div>`,
    'Next →',
    (c) => {
      stash.weight = sanitizeNumber(c.querySelector('#g-w').value, { min: 25, max: 300, fallback: 70 });
      askHeight(stash);
    },
    () => { stash.weight = 70; askHeight(stash); });
}

function askHeight(stash) {
  stepShell(4, "How tall are you?", "Height powers BMI/BMR/TDEE + ideal-weight math. Same field as Profile.",
    `<div class="onboarding-field"><input type="number" id="g-h" placeholder="e.g. 175 cm" min="120" max="230" inputmode="numeric"></div>`,
    'Next →',
    (c) => {
      stash.height = sanitizeNumber(c.querySelector('#g-h').value, { min: 120, max: 230, fallback: 0, integer: true }) || 0;
      askMeasures(stash);
    },
    () => { stash.height = 0; askMeasures(stash); });
}

function askMeasures(stash) {
  stepShell(5, "Waist, hips + country? (optional)", "Waist/hip unlock WHR, country fixes timezone. All editable in Profile — skip is fine.",
    `<div class="onboarding-field"><input type="number" id="g-waist" placeholder="Waist cm (optional)" min="0" max="200" step="any" inputmode="decimal"></div>
    <div class="onboarding-field"><input type="number" id="g-hip" placeholder="Hip cm (optional)" min="0" max="250" step="any" inputmode="decimal"></div>
    <div class="onboarding-field"><input type="text" id="g-country" placeholder="Country (optional)" maxlength="60" autocomplete="off"></div>`,
    'Next →',
    (c) => {
      stash.waist = sanitizeNumber(c.querySelector('#g-waist').value, { min: 0, max: 200, fallback: 0 }) || 0;
      stash.hip = sanitizeNumber(c.querySelector('#g-hip').value, { min: 0, max: 250, fallback: 0 }) || 0;
      stash.country = sanitizeText(c.querySelector('#g-country').value, 60) || '';
      askGoal(stash);
    },
    () => { stash.waist = 0; stash.hip = 0; stash.country = ''; askGoal(stash); });
}

function askGoal(stash) {
  stepShell(6, "Pick your main quest!", "Same 7 goals as Profile — I tune your calorie + macro targets around it. Changeable anytime in Profile.",
    `<div class="onboarding-field"><select id="g-goal">${GOAL_OPTS.map(([v, l]) => `<option value="${v}"${v === 'maintain' ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`,
    'Enter the dashboard →',
    (c) => {
      stash.goal = sanitizeEnum(c.querySelector('#g-goal').value, GOAL_OPTS.map((o) => o[0]), 'maintain');
      saveOnboarding(stash);
    },
    () => { stash.goal = 'maintain'; saveOnboarding(stash); });
}

function escapeName(n) {
  return String(n || 'Hunter').replace(/[<>&"]/g, '').slice(0, 20) || 'Hunter';
}

function saveOnboarding(stash) {
  const day = getTodayStr();
  const name = stash.name || 'Hunter';
  update((s) => {
    s.profile.name = name; s.profile.age = stash.age || 25;
    s.profile.weightKg = stash.weight || 70; s.profile.goal = stash.goal || 'maintain'; s.profile.filled = true;
    if (stash.height) s.profile.heightCm = stash.height;
    if (stash.waist) s.profile.waistCm = stash.waist;
    if (stash.hip) s.profile.hipCm = stash.hip;
    if (stash.country) s.profile.country = stash.country;
    s.player.name = name; s.player.weightKg = stash.weight || 70;
    s.weightLog = [...(s.weightLog || []), { date: day, kg: stash.weight || 70, seed: true }];
  }, { silent: true });
  finish(true);
  showNotif(`Mochi: welcome aboard, ${name}!`, 'XP');
}

function finish(withTour) {
  update((s) => { s.onboarding = { completed: true }; }, { silent: true });
  window.ZF.save();
  document.getElementById('guide-card')?.remove();
  window.ZF.rerender();
  try { localStorage.setItem('zf_tour_seen', '1'); } catch {}
  if (withTour) setTimeout(() => startDashboardTour(() => offerExploration()), 600);
}

/** Post-dashboard card: invite into the full exploration tour. */
function offerExploration() {
  try { if (localStorage.getItem('zf_explore_done')) return; } catch {}
  const c = shell(`<div class="guide-mascot-lg"></div>
    <h2>Dashboard down! Mochi is proud!</h2>
    <p>That was home base. Fancy the full walkthrough? I'll personally escort you through Nutrition, Workout, Water, Habits and Themes — about a minute, treats included.</p>
    <button class="btn btn-primary btn-full" id="g-explore">Explore with Mochi →</button>
    <button class="btn btn-ghost btn-full mt8" id="g-later">Later</button>`);
  c.querySelector('#g-explore').onclick = () => { c.remove(); startExplorationTour(); };
  c.querySelector('#g-later').onclick = () => { c.remove(); };
}

/** Guided exploration: auto-navigates screens, touring each in turn. */
export function startExplorationTour() {
  const factory = driverFactory();
  if (!factory) { showNotif('Tour library still loading — try again in a moment', '!'); return; }
  const mascot = `<img src="./assets/mascot/mascot.png" alt="Mochi" style="width:110px;height:110px;object-fit:contain;display:block;margin:0 auto 8px">`;
  const sideForLeg = (sel) => {
    try {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      if (!r) return 'top';
      if (r.top < innerHeight * 0.3) return 'bottom';
      if (r.bottom > innerHeight * 0.7) return 'top';
      return 'top';
    } catch { return 'top'; }
  };
  const legs = [
    { screen: 'nutrition', steps: [['#food-input', 'Mochi: log food', 'Type like “2 chapati, 200g rice” — I split commas, juggle units and grade everything instantly. Picky items get a manual fallback, never the bin.'], ['[data-ft="barcode"]', 'Mochi: barcode', 'Tap Barcode tab, then Scan or type the number — I fetch OpenFoodFacts values, tweak serving size before logging.'], ['[data-ntab="calculator"]', 'Mochi: calculator', 'Here, you can can create your own dish and have an estimated values of macros at your hand instantly.'], ['[data-ntab="mealplans"]', 'Mochi: meal plans', 'Build reusable plans once, log anytime.']] },
    { screen: 'workout', steps: [['#w-name', 'Mochi: workout', 'Log sets, reps and weight, or grab a plan. Body-weight moves borrow your profile weight automatically. Sweat = XP + burn.']] },
    { screen: 'water', steps: [['.water-tank', 'Mochi: hydrate', 'Tap the tank for +250ml glugs. Hit your daily goal for bonus XP. Your future self says thanks.']] },
    { screen: 'habits', steps: [['#h-add', 'Mochi: habits', 'Easy +20, Medium +40, Hard +70. Chain days to build your fire streak — my favorite game!']] },
    { screen: 'mind', sub: 'zen', steps: [['.zen-stage, [data-mtab="zen"]', 'Mochi: zen', 'Equal/Box/4-7-8 breathing. Follow the ring for XP + calm.'], ['[data-mtab="study"]', 'Mochi: study', 'Focus timer + manual log. Sessions feed analytics + Scholar badges.'], ['[data-mtab="screentime"]', 'Mochi: screen time', 'Log daily minutes — lower is better, missions treat it as max-goal.']] },
    { screen: 'analytics', steps: [['.chart-tab-bar, .an-sec-bar', 'Mochi: analytics overview', 'Overview first: 7-day cal/burn/water/study/habits/steps/screentime. Drill in only if curious — no need to open every subtab.']] },
    { screen: 'quests', steps: [['#q-list', 'Mochi: quests', 'Dailies auto-complete as you track. Clear all for bonus pool. Coach missions land here too. Heads up: a day with 4 or fewer quests done costs 100 XP (rest days are safe)!']] },
    { screen: 'profile', steps: [['#pf-save', 'Mochi: profile', 'Save recalculates BMI/BMR/TDEE + macros for your goal. Same 7 goals as onboarding.']] },
    { screen: 'leaderboard', steps: [['.chart-tab-bar', 'Mochi: leaderboard', 'Global/Friends/Challenges. Global needs opt-in. Achievements live in the hidden gallery.']] },
    { screen: 'customization', steps: [['#wp-frame', 'Mochi: makeover', 'Frame wallpapers with the thirds grid, then play with particles and themes. My aesthetic era.']] },
  ];
  let i = 0;
  const runLeg = () => {
    if (i >= legs.length) {
      try { localStorage.setItem('zf_explore_done', '1'); } catch {}
      const c = shell(`<div class="guide-mascot-lg"></div><h2>Tour complete — treats for you!</h2><p>Look at you, fully fledged hunter! Track daily, smash quests, and peek in your Inbox (More menu) — your coach leaves goodies there. I'll be cheering from the sidelines.</p><button class="btn btn-primary btn-full" id="g-go">To dashboard →</button>`);
      c.querySelector('#g-go').onclick = () => { c.remove(); window.ZF.go('dashboard'); };
      return;
    }
    const leg = legs[i++];
    window.ZF.go(leg.screen, leg.sub || null);
    setTimeout(() => {
      try {
        const steps = leg.steps
          .filter(([element]) => { try { return !!document.querySelector(element); } catch { return false; } })
          .map(([element, title, description]) => ({ element, popover: { title, description: mascot + description, side: sideForLeg(element), align: 'center' } }));
        if (!steps.length) { setTimeout(runLeg, 100); return; }
        const drv = factory({
          showProgress: true, allowClose: true,
          doneBtnText: i >= legs.length ? 'Finish' : 'Next screen →',
          nextBtnText: 'Next →', prevBtnText: '← Back',
          steps,
          onDestroyed: () => setTimeout(runLeg, 350),
        });
        drv.drive();
      } catch { setTimeout(runLeg, 350); }
    }, 650);
  };
  runLeg();
}

/** driver.js factory (CDN or vendored fallback). */
function driverFactory() {
  if (window.driver?.js?.driver) return window.driver.js.driver;
  if (window.driver?.driver) return window.driver.driver;
  return null;
}

/** Full dashboard tour — precise, step-by-step. */
export function startDashboardTour(onDone) {
  const factory = driverFactory();
  if (!factory) { showNotif('Tour library still loading — try again in a moment', '!'); return; }
  const mascot = `<img src="./assets/mascot/mascot.png" alt="Mochi" style="width:110px;height:110px;object-fit:contain;display:block;margin:0 auto 8px">`;
  const sideFor = (sel) => {
    try {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      if (!r) return 'top';
      if (r.top < innerHeight * 0.3) return 'bottom';
      if (r.bottom > innerHeight * 0.7) return 'top';
      return 'top';
    } catch { return 'top'; }
  };
  const step = (element, title, description) => ({
    element, popover: { title, description: mascot + description, side: sideFor(element), align: 'center' },
  });
  const drv = factory({
    showProgress: true,
    allowClose: true,
    doneBtnText: 'Finish',
    nextBtnText: 'Next →',
    prevBtnText: '← Back',
    onDestroyed: () => { try { onDone && onDone(); } catch {} },
    steps: [
      step('#bottom-nav', 'Mochi: your pill bar (1/10)', "Hiya, it's me again! These 5 tabs are home base. Everything else naps under More — and hey, you can swipe left and right between screens too. More → Nav-Edit lets you rearrange us."),
      step('#dash-blocks', 'Today at a glance (2/10)', "Ooh, shiny! Six live blocks — water, calories, net burn, habits, tasks and mind. Log anywhere and every number here updates instantly, like magic. Tap a block to teleport to its screen."),
      step('#dash-quests', 'Daily quests (3/10)', "Snack time! Fresh quests every morning, most finish themselves while you track — water, meals, workouts, habits. Each pays 100+ XP. Clear them all and bonus treats appear. Skip a day with 4 or fewer done (no rest day) and you lose 100 XP!"),
      step('#dw-input', 'Weigh in daily (4/10)', "Hop on the scale each morning and type it here — once a day does it. I beam it to your profile, analytics and character instantly. Tap for details to see your history."),
      step('#dash-char', 'Your hunter (5/10)', "This one's you! Level grows on a 100·level^1.5 XP curve, rank climbs E→S every 8 levels. Stats fatten with every log. Poke a rank step and I'll show exactly what each tier demands."),
      step('#dash-ach', 'Trophy shelf (6/10)', "43 shiny achievements, each with instant XP — no take-backs. The ring tracks your haul. Tap it to sneak into the hidden gallery (psst — Profile links there too)."),
      step('#dash-moods', 'Mood check (7/10)', "How's that heart feeling? One tap a day earns +5 XP and feeds your Mind analytics. Hover them — they wiggle!"),
      step('#dash-rest', 'Rest days (8/10)', "Even hunters nap! Sundays are always rest. You may claim 3 more Mon–Sat (no take-backs). Resting means no XP loss for skipped habits — guilt-free snoozing."),
      step('#steps-input', 'Steps → burn (9/10)', "Every step counts — literally, about 0.04 kcal each, auto-logged as burn. Type your steps, hit +Add, watch Net Cal shrink."),
      step('#dash-qs', 'Quest HQ (10/10)', "View all marches you to Quest HQ: dailies, bonuses, plus missions and events your coach dreams up. Finish = instant XP confetti. Phew — tour done! Profile → Backup keeps your saga safe."),
    ],
  });
  try { drv.drive(); } catch { /* tour aborted */ }
}

/** Per-screen spot tours — called from each feature on first visit. */
export function startFeatureTour(screen) {
  const factory = driverFactory();
  if (!factory) return;
  const mascot = `<img src="./assets/mascot/mascot.png" alt="Mochi" style="width:110px;height:110px;object-fit:contain;display:block;margin:0 auto 8px">`;
  // ponytail: side picks from element rect + viewport so dialogue never clips on small screens
  const sideFor = (sel) => {
    try {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      if (!r) return 'top';
      if (r.top < innerHeight * 0.3) return 'bottom';
      if (r.bottom > innerHeight * 0.7) return 'top';
      return r.left > innerWidth * 0.6 ? 'left' : r.left < innerWidth * 0.35 ? 'right' : 'top';
    } catch { return 'top'; }
  };
  const maps = {
    nutrition: [['#food-input', 'Text log', 'Comma-split: custom foods → aliases → database → plural → AI worker. Failed items get Log manually, never silent drops.'], ['#food-res', 'Preview', 'Grade + kcal update live on qty/unit change. Each entry carries xpAwarded:30, deducted on delete.'], ['[data-ft="barcode"]', 'Barcode', 'Tap this tab first — Scan button + number field live inside. OpenFoodFacts lookup with serving-size dialog.'], ['[data-ntab="calculator"]', 'Calculator', 'TDEE/BMI/BMR + macro targets. Same goal engine as Profile — change goal here or in onboarding, both stay linked.'], ['[data-ntab="mealplans"]', 'Meal plans', 'Build reusable plans from ingredients, save once, log anytime.']],
    workout: [['#w-name', 'Log tab', 'Body-weight type autofills profile weight, prompts if missing. Each set = 15 XP + 8 XP/volume bonus.'], ['#w-body', 'Burn tab', 'Net = eaten − burned. Tapping dashboard Net Cal lands here.']],
    water: [['.water-tank', 'Tank', 'Tap tank = +250ml (+5 XP, +50 on goal). Delete drops below goal = no refund by design.']],
    habits: [['#h-add', 'Habits', 'Easy +20, Medium +40, Hard +70. Uncheck deducts unless rest day. Delete while done deducts too.']],
    tasks: [['#task-title', 'Tasks', 'Easy +30, Medium +70, Hard +130, Extreme +220. Overdue penalties never refunded.']],
    mind: [['.zen-stage, [data-mtab="zen"]', 'Zen', 'Equal/Box/4-7-8 patterns. Breathe with the ring for XP + calm.'], ['[data-mtab="study"]', 'Study', 'Focus timer + manual log with difficulty XP. Sessions feed analytics + Scholar achievements.'], ['[data-mtab="screentime"]', 'Screen time', 'Log daily minutes. Lower is better — missions treat it as a max-goal.']],
    quests: [['#q-list', 'Quests', 'Daily auto-complete as you track. Bonus pool when all done. Missions arrive from your coach.']],
    analytics: [['.chart-tab-bar, .an-sec-bar', 'Analytics overview', 'Overview first: 7-day cal/burn/water/study/habits/steps/screentime. Drill into Habits/Nutrition/Training/Health/Mind/Progress/Insights/Gamification/Mood. Period 1w default.']],
    leaderboard: [['.chart-tab-bar', 'Leaderboard', 'Global/Friends/Challenges. Global needs opt-in + profile. Achievements live in hidden gallery, not here.']],
    profile: [['#pf-save', 'Profile', 'Save recalculates BMI/BMR/TDEE. Same 7 goals as onboarding — macroSplit retunes cal/protein/carbs/fat instantly. Backup envelope {data,themes} + ZIP with images.']],
    customization: [['#wp-frame', 'Wallpaper studio', 'WhatsApp-style grid + safe area. Zoom 50–200, offsets −100…+100, fit cover/contain/fill, snap to center. Themes can bundle wallpaper + particles.'], ['#th-save', 'Custom themes', 'Builder: template + colors + wallpaper + particle effect. Transparent + box mimics theme grid.']],
  };
  const raw = maps[screen] || [];
  const steps = raw.filter(([element]) => { try { return !!document.querySelector(element); } catch { return false; } })
    .map(([element, title, description]) => ({ element, popover: { title, description: mascot + description, side: sideFor(element), align: 'center' } }));
  if (!steps.length) return;
  try { factory({ showProgress: true, allowClose: true, steps }).drive(); } catch {}
}

/** Replay entry point (Profile → Review Tutorial). */
export function replayTutorial() {
  try { localStorage.removeItem('zf_tour_seen'); } catch {}
  if (!document.querySelector('.screen')) { location.reload(); return; }
  window.ZF.go('dashboard');
  setTimeout(() => startDashboardTour(), 500);
}
