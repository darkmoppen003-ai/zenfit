# ZenFit V2 — Health RPG (modular rebuild)

> **NOTE — seeing ads in the app?** Use an ad-blocking DNS. One option: `dns.adguard.com`.

## 🔗 Notable links

- **Website:** https://darkmoppen003-ai.github.io/zenfit/
- (lite APK recommended for a better, smoother experience)
- **Lite APK:** https://drive.google.com/file/d/1UR4XsoVRzaZ5Vah7Uethx-aa6z8Sh1Vz/view?usp=sharing
- **Android app (full APK):** https://drive.google.com/file/d/1JaKQuEWZyRfaw_nn_UYGB3-BRcK0M64t/view?usp=sharing

A complete reconstruction of the ZenFit PWA: same soul, clean architecture.
Fully static — no build step. Host as-is on **GitHub Pages**, **Cloudflare Workers/Pages**, or any static host.

## ✨ What's new vs V1

- **Dashboard opens first** — the old orb home screen is gone; top tab bar removed, bottom dock only.
- **Modular code**: every screen is one file in `modules/features/`; all state flows through `modules/core/store.js`; derived data lives in `modules/core/selectors.js` (one formula per concept).
- **One design system**: `css/tokens.css` is the only file with color/font values; everything else uses `var(--*)`. V1 theme engine (AMOLED/Midnight/Frost/Light + custom builder + accent) included.
- **anime.js** entrances, staggered cards, directional swipe transitions, tab-bar glide, count-ups (CDN with offline CSS fallback).
- **Wallpaper studio**: WhatsApp-style thirds grid + safe area, zero-centered −100…+100 position sliders with steppers and snap-to-center, pinch/drag/wheel, per-screen or global.
- **Full V1 systems**: 6-quest + bonus engine, 43 achievements, habit cards with curves, repeat/overdue-penalty tasks, breathing-pattern zen, study timer, screen-time, burn calculator, P2P friends (share codes, chat, challenges), global leaderboard (opt-in), local reminders.
- **Sanitized inputs everywhere**, validated import/restore, same `zenfit_v1` storage keys → **V1 users upgrade with data intact**.

## 🧭 Trackers & features

- **Habits** — custom habits, daily completion, streaks + best streaks, performance curves, weekly calendar grid, rest-day aware.
- **Gamification** — XP curve (`100·level^1.5`), ranks E → S, 6 daily quests + bonus pool with auto-completion, 43 achievements, activity streaks with selectable scope, progress streaks. Skip a non-rest day with 4 or fewer quests done: −100 XP.
- **Analytics** — Chart.js (vendored, offline) trends across 1W–All with previous-period compare, mood radar, habit calendar, gamification heatmap, insights, tap-a-point details.
- **Nutrition** — text log (units incl. decimals), barcode scanner + lookup, manual entry with servings multiplier, custom dish calculator with per-food weights, meal plans, My Foods, serving-size guide.
- **Water** — visual tank, quick-add buttons, custom amounts, daily goal + streak reminders.
- **Workout** — set/rep/weight logging, body-weight autofill, burn calculator (MET-based), workout↔burn linked deletes.
- **Study** — timestamp-anchored focus timer (survives background tabs), 10-minute progress ring, manual session log with difficulty XP.
- **Tasks** — difficulty tiers, repeats, deadlines with overdue penalties, completion XP.
- **Mind / Zen** — breathing patterns, mood check-ins with intensity + energy, screen-time tracking.
- **Quests & missions** — daily auto-completion, coach missions with rule-based auto-rewards, trackable from inbox.
- **Inbox** — local + global broadcasts with rich text (bold/italic/links), images, background images, rewards claiming.
- **Leaderboard & friends** — opt-in global board, P2P share codes, challenges.
- **Reminders** — local water/task/study/streak alerts with toggles and minute precision.

## 🎨 Customization & wallpapers

- **Themes** — built-ins, custom builder (surfaces, text, accent, glow), import/export, per-theme particles + wallpaper, ship-to-devices support.
- **Wallpapers** — bundled presets, uploads (auto-downscaled, IndexedDB-backed with verified writes), remote URLs (temporarily cached), coach picks; framing studio with thirds grid, zoom, fit modes and safe area.
- **Particles** — 6 effects (constellation, snow, embers, firefly, matrix rain, cyber spark) with count / hue (rainbow slider) / speed / direction controls.
- **Liquid glass** — frosted cards with blur + opacity sliders; bottom pill nav with opacity control; desktop right-edge dock with magnification, scroll list and per-item tooltips.
- **Navigation** — swipe between screens, editable dock tabs, deep-linkable `#/screen` routes.

## 📁 Structure

```
index.html            ← shell only (splash, screens host, file:// guard)
sw.js                 ← service worker (offline + updates)
chart.umd.js          ← vendored Chart.js (offline charts)
manifest.json / offline.html / export.html / zenfit.png / favicon.ico
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
    sanitize.js         ← input sanitization (2-decimal numeric rule)
    router.js           ← ★ screen registry + hash routing + swipe + bottom nav
    ui.js               ← toasts, overlays, background engine, 6-mode particles, SFX
    animations.js       ← anime.js loader, directional transitions, tab glide, count-ups
    nutrition-parse.js  ← ★ food engine: regex → OpenFoodFacts → AI worker → local DB
    backup.js           ← share-first export / validated import / reset
    peer.js             ← ★ P2P friends (PeerJS handshake, chat, challenges)
    cloud.js            ← ★ Supabase global leaderboard API + throttled sync
    notify.js           ← ★ local reminders (water/task/study/streak) + settings UI
    countries.js        ← country/timezone list (profile)
    pwa.js / fullscreen.js  ← SW updates, double-tap splash fullscreen
  features/
    dashboard.js nutrition.js water.js workout.js habits.js tasks.js
    zen.js quests.js analytics.js leaderboard.js profile.js
    customization.js admin.js guide.js changelog.js privacy.js
scripts/update-build.js ← build bumper (also auto-globs new assets into sw.js)
```

## 🧩 Adding a new screen (30 seconds)

1. Create `modules/features/sleep.js` exporting `renderSleep(host)`.
2. In `modules/core/router.js`: import it + add `{ id:'sleep', label:'Sleep', icon:'&#…;', render: renderSleep }` to `SCREENS`.
3. Done — bottom-bar overflow, swipe order, hash `#/sleep` all pick it up.

Rules: read state via `core/selectors.js`, write via `update(s => …)`, sanitize inputs, style with `var(--*)` tokens only, no commented-out code — delete what you don't need.

## 🔒 Privacy & data

Local-first: everything lives in your browser (`localStorage` + IndexedDB + Cache Storage). See **[privacy-policy.md](privacy-policy.md)** for exactly what leaves your device (food lookups, opt-in leaderboard, P2P) and **[license.md](license.md)** for reuse terms.

## ⚠️ Disclaimer

This app is **not intended for medical or scientific accuracy**.

* Body fat % values are estimates
* Calorie and nutrient values are rough estimates
* Data is approximate and for general tracking only

Built for **practical everyday use**, not precision health tracking. Designed primarily for personal use — usability over accuracy — and constantly evolving.

## 🚀 Hosting

- **GitHub Pages**: push this folder; enable Pages. Keep filenames URL-safe.
- **Cloudflare Pages/Workers**: upload the folder — no build command.
- **Supabase (optional)**: Leaderboard → Global → opt in (profile required).

Build bumps: `node scripts/update-build.js` (also runs in CI on push to `main`).

## 🙌 Final Thoughts

This is a DIY project built for fun, learning, and real-world use.

If you use it, feel free to modify, expand, or adapt it to your own workflow.

**Hope you enjoy it.**
