/* ── ZenFit V2 · features/achievements-screen.js ───────────
   Hidden achievements gallery (NOT in nav/dock). Opened from
   the dashboard achievement ring and the profile glance card.
────────────────────────────────────────────────────────────── */
import { checkAchievements, achievementsGridHTML } from '../core/achievements.js';

export function renderAchievements(host) {
  checkAchievements();
  host.innerHTML = `<div id="ach-page"></div>`;
  const tmp = document.createElement('div');
  tmp.innerHTML = achievementsGridHTML();
  host.querySelector('#ach-page').replaceWith(...tmp.childNodes);
}
