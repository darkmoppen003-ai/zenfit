/* ── ZenFit V2 · features/changelog.js ─────────────────────
   V1 system-update popup: shows once per build with "what's
   new", acknowledged per build key.
────────────────────────────────────────────────────────────── */
import { APP_VERSION, APP_BUILD } from '../core/store.js';
import { escapeHtml } from '../core/sanitize.js';

const NOTES = [
  ['v8.8.1', 'Matrix hue + sparks direction, thread inbox, mission designer v2, global outbox'],
  ['v8.8 beta', 'Inbox, global coach messages, missions with auto-rewards, faster particles'],
  ['Dashboard first', 'Orb home removed — dashboard opens directly'],
  ['Bottom-dock navigation', 'Top tab bar removed — swipe or use the pill bar'],
  ['43 achievements', 'Boot check catches anything earned offline'],
  ['P2P friends + challenges', 'Share codes, live chat, high-fives, weekly battles'],
  ['Global leaderboard', 'Opt in from Leaderboard → Global (profile required)'],
  ['Local reminders', 'Water/task/study/streak alerts from Profile → Settings'],
];

export function maybeChangelog() {
  let seen = null;
  try { seen = localStorage.getItem('zenfit_changelog_seen'); } catch {}
  if (seen === APP_BUILD) return;
  const ov = document.createElement('div');
  ov.className = 'overlay overlay-priority';
  ov.id = 'zf-changelog';
  ov.innerHTML = `<div class="overlay-box" style="text-align:left;max-width:400px">
    <div style="font-size:11px;color:var(--primary);letter-spacing:2px;font-weight:700">[ SYSTEM UPDATE ]</div>
    <h2 style="font-family:var(--font-display);margin:4px 0 2px">ZenFit v${escapeHtml(APP_VERSION)} · ${escapeHtml(APP_BUILD)}</h2>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">New features installed</div>
    <div style="font-size:12px;line-height:1.7;max-height:40vh;overflow-y:auto">
      ${NOTES.map(([t, b]) => `<div style="margin-bottom:6px">▸ <strong>${escapeHtml(t)}</strong><br><span style="color:var(--text-secondary)">${escapeHtml(b)}</span></div>`).join('')}
    </div>
    <button class="btn btn-primary btn-full mt12" id="zf-changelog-ok">[ ACKNOWLEDGE ] Continue</button></div>`;
  document.body.appendChild(ov);
  document.getElementById('zf-changelog-ok').onclick = () => {
    try { localStorage.setItem('zenfit_changelog_seen', APP_BUILD); } catch {}
    ov.remove();
  };
}
