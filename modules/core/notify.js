/* ── ZenFit V2 · core/notify.js ────────────────────────────
   V1 local notification system, ported: settings store
   (water/task/study/streak), OS permission flow, in-app +
   service-worker timers. No server — fully local.
────────────────────────────────────────────────────────────── */
import { S, update, save } from './store.js';
import { sanitizeNumber } from './sanitize.js';
import { showNotif } from './ui.js';
import { todayWater, today } from './selectors.js';

export const NOTIF_DEFAULTS = {
  water: { enabled: false, intervalMins: 90 },
  task: { enabled: false, offsetMins: 30 },
  study: { enabled: false, hour: 20 },
  streak: { enabled: false, hour: 21 },
};

export function getNotifSettings() {
  if (!S.notifSettings) {
    update((s) => { s.notifSettings = JSON.parse(JSON.stringify(NOTIF_DEFAULTS)); }, { silent: true });
    save();
  }
  return S.notifSettings;
}

export function saveNotifSetting(type, key, val) {
  update((s) => {
    if (!s.notifSettings) s.notifSettings = JSON.parse(JSON.stringify(NOTIF_DEFAULTS));
    if (!s.notifSettings[type]) s.notifSettings[type] = {};
    s.notifSettings[type][key] = val;
  }, { silent: true });
  save();
}

let notifTimers = [];
export function clearAllNotifTimers() {
  notifTimers.forEach((id) => { try { clearTimeout(id); clearInterval(id); } catch {} });
  notifTimers = [];
}

export function requestNotifPermission() {
  if (!('Notification' in window)) { showNotif('Notifications not supported', '!'); return Promise.resolve(false); }
  if (Notification.permission === 'granted') return Promise.resolve(true);
  if (Notification.permission === 'denied') { showNotif('Notifications blocked in browser settings', '!'); return Promise.resolve(false); }
  return Notification.requestPermission().then((perm) => {
    if (perm === 'granted') { showNotif('[ SYSTEM ] Notifications enabled ✓', '🔔'); return true; }
    showNotif('Notification permission denied', '!');
    return false;
  });
}

export function fireLocalNotif(title, body) {
  if (S.notificationsEnabled === false) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SHOW_NOTIFICATION', payload: { title, body, tag: title, url: './' },
    });
    return;
  }
  try { new Notification(title, { body, silent: false, tag: title }); } catch { try { new Notification(title); } catch {} }
}

/** Best-effort background delivery via the service worker (like water). */
function swSchedule(title, body, tag, delayMs) {
  try {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SCHEDULE_REMINDER', payload: { title, body, tag, url: './', delayMs: Math.min(Math.max(0, delayMs), 86400000) },
      });
    }
  } catch {}
}

function scheduleWaterReminders() {
  const ns = getNotifSettings();
  if (!ns.water?.enabled) return;
  const ms = (ns.water.intervalMins || 90) * 60000;
  const id = setInterval(() => {
    const pct = Math.min(100, Math.round((todayWater() / (S.water.dailyGoalMl || 3000)) * 100));
    if (pct >= 100) return;
    fireLocalNotif('[ ZenFit ] Hydration Check', `💧 Water: ${pct}% — Stay hydrated, hunter.`);
  }, ms);
  notifTimers.push(id);
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SCHEDULE_REMINDER',
      payload: { title: '💧 Hydration Check', body: 'Time to drink water, hunter! Stay hydrated.', tag: 'zenfit-water', url: '/', delayMs: ms },
    });
  }
}

function scheduleTaskReminder(task) {
  const ns = getNotifSettings();
  if (!ns.task?.enabled || !task.deadlineTs) return;
  const delay = task.deadlineTs - (ns.task.offsetMins || 30) * 60000 - Date.now();
  if (delay <= 0) return;
  const id = setTimeout(() => {
    if (!task.completedAt) fireLocalNotif('[ TASK DUE SOON ]', `"${task.title}" deadline approaching!`);
  }, Math.min(delay, 86400000));
  notifTimers.push(id);
  swSchedule('[ TASK DUE SOON ]', `"${task.title}" deadline approaching!`, `zenfit-task-${task.id || 'x'}`, delay);
}

function scheduleDailyReminders() {
  const ns = getNotifSettings();
  if (ns.study?.enabled) {
    const target = new Date(); target.setHours(ns.study.hour || 20, 0, 0, 0);
    if (target <= new Date()) target.setDate(target.getDate() + 1);
    const id = setTimeout(() => {
      const mins = (S.study.sessions || []).filter((s) => s.date === today()).reduce((a, b) => a + (b.duration || 0), 0);
      if (mins < 30) fireLocalNotif('[ SYSTEM ALERT ] Daily Focus Session Pending', 'Your study session awaits. Knowledge is power, hunter.');
      scheduleDailyReminders();
    }, target - new Date());
    notifTimers.push(id);
    swSchedule('[ SYSTEM ALERT ] Daily Focus Session Pending', 'Your study session awaits. Knowledge is power, hunter.', 'zenfit-study', target - new Date());
  }
  if (ns.streak?.enabled) {
    const target = new Date(); target.setHours(ns.streak.hour || 21, 0, 0, 0);
    if (target <= new Date()) target.setDate(target.getDate() + 1);
    const id = setTimeout(() => {
      const undone = (S.habits || []).filter((h) => !((h.completedDates || h.doneDates || []).includes(today()))).length;
      if (undone > 0) fireLocalNotif(`[ STREAK ALERT ] ${undone} Habit${undone > 1 ? 's' : ''} Remaining`, 'Protect your streak — close one out tonight.');
      scheduleDailyReminders();
    }, target - new Date());
    notifTimers.push(id);
    swSchedule('[ STREAK ALERT ] Habits Remaining', 'Protect your streak — close one out tonight.', 'zenfit-streak', target - new Date());
  }
}

export function initNotifications() {
  clearAllNotifTimers();
  if (S.notificationsEnabled === false) return;
  scheduleWaterReminders();
  scheduleDailyReminders();
  (S.tasks || []).forEach((t) => { if (!t.completedAt) scheduleTaskReminder(t); });
}

/** Settings UI (V1 renderNotifSettings) into a container element. */
export function renderNotifSettings(box) {
  const ns = getNotifSettings();
  const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
  const master = S.notificationsEnabled !== false;
  const toggle = (checked, bg) => `<label style="position:relative;display:inline-block;width:38px;height:22px;flex-shrink:0">`
    + `<input type="checkbox" data-ns="${checked}" ${checked ? 'checked' : ''} style="opacity:0;width:0;height:0">`
    + `<span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${bg};border-radius:20px;transition:.3s;border:1px solid var(--border-strong)">`
    + `<span style="position:absolute;height:16px;width:16px;left:${checked ? '19px' : '3px'};bottom:2px;background:#fff;border-radius:50%;transition:.3s"></span></span></label>`;

  box.innerHTML = `<div class="section-title">[ LOCAL REMINDERS ]</div>`
    + `<div class="card-sm mb8" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px">`
    + `<div><div style="font-size:13px;font-weight:600">🔔 OS Notifications</div><div style="font-size:10px;color:var(--text-muted)">Master toggle for system alerts</div></div>`
    + toggle('master', master ? 'var(--primary-dark)' : 'var(--bg-overlay)') + `</div>`
    + (perm === 'default' ? `<div class="notif-perm-banner"><span style="font-size:20px">🔔</span>`
      + `<div style="flex:1"><div style="font-size:13px;font-weight:600">Enable Notifications</div>`
      + `<div style="font-size:11px;color:var(--text-muted)">System-style alerts. No server — fully local.</div></div>`
      + `<button class="btn btn-primary btn-sm" id="ns-enable">Enable</button></div>` : '')
    + `<div style="display:flex;flex-direction:column;gap:10px;${master ? '' : 'opacity:.4;pointer-events:none'}">`
    + reminderRow('💧 Water Reminders', 'Periodic hydration nudges', 'water', !!ns.water?.enabled,
      `On Every <input type="number" data-nsnum="water.intervalMins" value="${ns.water?.intervalMins || 90}" min="15" max="480" style="width:64px;text-align:center"> min`)
    + reminderRow('⚔️ Task Deadline Alerts', 'Warn before task deadlines', 'task', !!ns.task?.enabled,
      `Alert <input type="number" data-nsnum="task.offsetMins" value="${ns.task?.offsetMins || 30}" min="5" max="240" style="width:64px;text-align:center"> min before`)
    + reminderRow('📚 Study Reminder', 'Daily evening focus alert', 'study', !!ns.study?.enabled,
      `At hour <input type="number" data-nsnum="study.hour" value="${ns.study?.hour ?? 20}" min="0" max="23" style="width:64px;text-align:center"> :00`)
    + reminderRow('🔥 Streak Reminder', 'Protect your habit streak', 'streak', !!ns.streak?.enabled,
      `At hour <input type="number" data-nsnum="streak.hour" value="${ns.streak?.hour ?? 21}" min="0" max="23" style="width:64px;text-align:center"> :00`)
    + `</div>`
    + `<div style="font-size:11px;color:var(--text-muted);margin-top:8px">All reminders run locally on your device. Service worker delivers notifications even when the app is in the background.</div>`;

  function reminderRow(title, sub, key, on, extra) {
    return `<div class="card-sm"><div class="flex-between mb8"><div>`
      + `<div style="font-size:13px;font-weight:600">${title}</div><div style="font-size:11px;color:var(--text-muted)">${sub}</div></div>`
      + `<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" data-nscheck="${key}" ${on ? 'checked' : ''} style="width:20px"> On</label></div>`
      + `<div style="font-size:12px;color:var(--text-secondary)">${extra}</div></div>`;
  }

  box.querySelector('[data-ns="master"]').onchange = (e) => {
    update((s) => { s.notificationsEnabled = e.target.checked; }, { silent: true });
    save();
    if (e.target.checked) initNotifications();
    else clearAllNotifTimers();
    renderNotifSettings(box);
  };
  box.querySelector('#ns-enable') && (box.querySelector('#ns-enable').onclick = () => {
    requestNotifPermission().then((ok) => { if (ok) { initNotifications(); renderNotifSettings(box); } });
  });
  box.querySelectorAll('[data-nscheck]').forEach((cb) => {
    cb.onchange = () => {
      saveNotifSetting(cb.dataset.nscheck, 'enabled', cb.checked);
      initNotifications();
      renderNotifSettings(box);
    };
  });
  box.querySelectorAll('[data-nsnum]').forEach((inp) => {
    inp.onchange = () => {
      const [type, key] = inp.dataset.nsnum.split('.');
      saveNotifSetting(type, key, sanitizeNumber(inp.value, { min: 0, max: 1440, fallback: 0, integer: true }));
      initNotifications();
    };
  });
}
