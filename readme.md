# ZenFit V2 — Health RPG (modular rebuild)

A complete reconstruction of the ZenFit PWA: same soul, clean architecture.
Fully static — no build step. Host as-is on **GitHub Pages**, **Cloudflare Workers/Pages**, or any static host.

## ✨ What's new vs V1

- **Dashboard opens first** — the old orb home screen is gone; top tab bar removed, bottom dock only.
- **Modular code**: every screen is one file in `modules/features/`; all state flows through `modules/core/store.js`; derived data lives in `modules/core/selectors.js` (one formula per concept).
- **One design system**: `css/tokens.css` is the only file with color/font values; everything else uses `var(--*)`. V1 theme engine (AMOLED/Midnight/Frost/Light + custom builder + accent) included.
- **anime.js** entrances, staggered cards, directional swipe transitions, tab-bar glide, count-ups (CDN with offline CSS fallback).
- **Hidden owner console**: no nav entry, password-gated. Stats, rewards, missions/events, inbox broadcast + push, wallpapers, themes, cloud config.
- **Wallpaper studio**: WhatsApp-style thirds grid + safe area, zero-centered −100…+100 position sliders with steppers and snap-to-center, pinch/drag/wheel, per-screen or global.
- **Full V1 systems**: 6-quest + bonus engine, 43 achievements, habit cards with curves, repeat/overdue-penalty tasks, breathing-pattern zen, study timer, screen-time, burn calculator, P2P friends (share codes, chat, challenges), global leaderboard (opt-in), local reminders.
- **Sanitized inputs everywhere**, validated import/restore, same `zenfit_v1` storage keys → **V1 users upgrade with data intact**.

## 📁 Structure

```
index.html            ← shell only (splash, screens host, file:// guard)
sw.js                 ← service worker (offline + updates)
chart.umd.js          ← vendored Chart.js (offline charts)
manifest.json / offline.html / export.html / zenfit.png / favicon.ico
admin.env             ← OWNER ONLY, gitignored, never deployed (password reference)
assets/               ← carried over as-is (mp3, png, gif, food/exercise DBs, zen index)
css/
  tokens.css            ← ★ single source of truth (no hardcoded styling elsewhere)
  base.css              ← reset, splash, guide, wallpaper frame grid, steppers
  components.css        ← cards, buttons, inputs, bottom pill bar, stat-blocks
  screens.css           ← per-screen widgets (tank, zen, mood, calendar…)
  animations.css        ← keyframes + anime.js fallback hooks
  responsive.css        ← mobile-first → desktop breakpoints
modules/
  app.js                ← bootstrap (theme → router → PWA → notify → onboarding → changelog)
  core/
    store.js            ← ★ state, migrate, persist, XP, stats
    selectors.js        ← ★ shared derived data (todayNutrition, latestWeight…)
    achievements.js     ← ★ the 43 achievements + award checks
    utils.js            ← pure math/helpers (BMI, BMR, XP curve, macros…)
    sanitize.js         ← input sanitization
    router.js           ← ★ screen registry + hash routing + swipe + bottom nav
    ui.js               ← toasts, overlays, background engine, 6-mode particles, SFX
    animations.js       ← anime.js loader, directional transitions, tab glide, count-ups
    nutrition-parse.js  ← ★ food engine: regex → OpenFoodFacts → Gemini worker → local DB
    backup.js           ← share-first export / validated import / reset
    peer.js             ← ★ P2P friends (PeerJS handshake, chat, challenges)
    cloud.js            ← ★ Supabase global leaderboard API + throttled sync
    notify.js           ← ★ local reminders (water/task/study/streak) + settings UI
    secrets.js          ← ★ admin password hash + verifier (no plaintext in repo)
    countries.js        ← country/timezone list (profile)
    pwa.js / fullscreen.js  ← SW updates, double-tap splash fullscreen
  features/
    dashboard.js nutrition.js water.js workout.js habits.js tasks.js
    zen.js quests.js analytics.js leaderboard.js profile.js
    customization.js admin.js guide.js changelog.js
scripts/update-build.js ← build bumper (also auto-globs new assets into sw.js)
```

## 🧩 Adding a new screen (30 seconds)

1. Create `modules/features/sleep.js` exporting `renderSleep(host)`.
2. In `modules/core/router.js`: import it + add `{ id:'sleep', label:'Sleep', icon:'&#…;', render: renderSleep }` to `SCREENS`.
3. Done — bottom-bar overflow, swipe order, hash `#/sleep` all pick it up.

Rules: read state via `core/selectors.js`, write via `update(s => …)`, sanitize inputs, style with `var(--*)` tokens only, no commented-out code — delete what you don't need.

## 🔒 Privacy & data

Local-first: everything lives in your browser (`localStorage` + IndexedDB + Cache Storage). See **[privacy-policy.md](privacy-policy.md)** for exactly what leaves your device (food lookups, opt-in leaderboard, P2P) and **[license.md](license.md)** for reuse terms.

## 🚀 Hosting

- **GitHub Pages**: push this folder; enable Pages. Keep filenames URL-safe.
- **Cloudflare Pages/Workers**: upload the folder — no build command.
- **Supabase (optional)**: Leaderboard → Global → opt in (profile required).

Build bumps: `node scripts/update-build.js` (also runs in CI on push to `main`).
