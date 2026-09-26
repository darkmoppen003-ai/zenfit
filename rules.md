# ZenFit V2 — Contributor & Agent Rules (STRICT)

These rules are binding for every human developer and every AI coding agent
working in this repo. The maintainer will reject work that violates them.
This file itself must be kept updated whenever a new rule is established.

## 1. Design rules (non-negotiable)

1.1. **Tokens only.** `css/tokens.css` is the single source of truth for
colors, fonts, sizes, radii, shadows and motion. No hex/rgba/font-family
literals anywhere else — with exactly three exceptions: V1 data values
(rank/difficulty/mode colors), monochrome neutrals (`#fff` knobs, `#000`
scrims), and theme-definition objects.
1.2. **Two layers only.** Layer 1 = background (`#zf-bg`: solid or image).
Layer 2 = elements (cards, text, controls). Nothing opaque may sit between
them. Glass cards stay translucent; screens stay transparent.
1.3. **SVG for chrome, emoji for content.** Navigation, headers, buttons,
blocks, badges, More-popover entries and system chrome (including Inbox,
Admin, Achievements) use `modules/core/icons.js` — detailed line-art on the
24px grid (`viewBox 0 0 24 24`, `stroke-width 1.8`, round caps). Emoji survive
ONLY where V1 content requires them: quest/mood/achievement faces,
TWEMOJI-fed moods, user-typed text. Never use 📥 or any emoji glyph as a
navigation/header icon — add a proper `ICONS.*` entry instead and register it
in `DOCK_ICONS` when it appears in the More popover.
1.4. **Uniform components.** Repeated UI (stat blocks, quest rows, badges,
overlays) must be one shared component/class — never per-screen inline
restyling. Mobile-first: 2-col → 3-col at ≥768px, touch targets ≥40px
(except tabs, which size to their text).
1.5. **Fonts:** Syne (`--font-display`) for titles/numbers, Inter
(`--font-ui`) for everything else. Numeric values use tabular figures
where they update.

## 2. Creating new elements, components and pages

2.1. **New screen = 3 steps:** create `modules/features/<name>.js` exporting
`render<Name>(host, subTab?)`, import + register ONE line in
`modules/core/router.js` `SCREENS` (`{id,label,icon,render[,hidden]}`).
Dock overflow, swipe order, hash routing and headers follow automatically.
2.2. **New shared UI = `core/ui.js` or `core/icons.js`.** Never duplicate a
widget across features; extend the shared helper instead.
2.3. **New derived data = `core/selectors.js`.** One formula per concept.
Features never compute shared metrics inline.
2.4. **Headers come from the router** (V1 entity icon + Syne title).
Feature modules must NOT render their own screen headers.
2.5. Every user string passes through `sanitize.js` before storage or DOM.
Every destructive action gets a confirm step. Every input has `maxlength`
and a numeric clamp.

## 3. State, storage, logic

3.1. **Single source of truth:** `core/store.js`. Features never touch
`localStorage`/IndexedDB directly — use `update(fn, {silent?})`.
3.2. **V1 shapes are frozen:** `nutrients{}`, `calories`, `duration`,
`completedDates`, `{id, ts}` achievements, `zenfit_v1` keys, XP values,
rank formula `floor(level/8)`, `100·level^1.5` curve.
3.3. **Migrations are append-only** version steps (v1→v11 chain). Never
rewrite history; old saves must always load.
3.4. **XP symmetry:** every XP grant on create/log has a matching deduction
on delete/uncheck (habits, tasks, meals, water, workouts, activities,
study, overdue penalties). No silent XP.
3.5. **Dates are local** (`getTodayStr()`/`today()`), never UTC slices,
except server timestamps (`updated_at`).

## 4. Removal rule (strict)

4.1. When asked to remove something, **delete it completely**: code, CSS,
imports, registry entries, assets, docs mentions. No commented-out code,
no `void` hacks, no orphan helpers, no dead CSS classes, no unused
imports/exports. Verify with grep + `node --check` afterwards.
4.2. After any deletion, run the verification protocol (§6).

## 5. Structure and imports

5.1. Dependency direction: `features → core/*`; `core` never imports
`features` (dynamic `import()` for lazy loads only). No cycles — verify
with the import-graph check.
5.2. One responsibility per module (see `CONTEXT/PROGRESS.md` §7).
5.3. No new runtime dependencies without maintainer approval. Vendored
libs (`chart.umd.js`, `driver.js`) live at repo root + SW precache.

## 6. Verification protocol (mandatory, every change)

6.1. `node --check` all modules (copy to /tmp as `.mjs`).
6. Serve + headless browser: assert state/XP/guards in DOM+storage;
capture `pageerror` + `render failed` warnings; dismiss overlays between
steps; remember XP level-wrap in assertions.
6. Side-by-side vs V1 (`/home/shivam/zenfit`) with identical LOCAL-date
seed data when touching shared behavior.
6. `node scripts/update-build.js` keeps `APP_BUILD`/`SW_BUILD` in sync.
6. Update `CONTEXT/PROGRESS.md` work log every batch.

## 7. Performance and resources

7.1. State renders are debounced; navigation renders immediately.
7.2. Heavy libs lazy-load on first use (charts, P2P, driver). Images get
`loading="lazy"` below the fold. Uploads go to IndexedDB blobs, never
base64 in state.
7.3. No animation without a `prefers-reduced-motion` escape. No timers,
observers or audio nodes left running after their screen unmounts.

## 8. Privacy and secrets

8.1. Local-first. Nothing leaves the device except: food lookups, opt-in
leaderboard card, user-initiated P2P, CDN library fetches (see
`privacy-policy.md`).
8.2. Owner secrets live ONLY in gitignored `admin.env`; code embeds hashes,
never plaintext. Never print secrets to logs, screenshots or docs.

## 9. Layer and stacking rules

9.1. Background stack order in DOM: `#zf-bg` → `#zf-bg-dim` → `#zf-particles`
→ app content. All share `z-index: 0` except app (`z-index: 1`); never use
negative z-index (the opaque `body` background paints over it).
Dialogs (`.overlay`, z `10001`) sit ABOVE the bottom nav pill (`9999`) with
`108px` bottom clearance, so no box ever hides behind or overlaps the nav.
Priority order: changelog (`100005`) > tutorial/guide (`100002`) > dialogs
(`10001`) > popover (`10000`) > nav (`9999`).
9.2. Collapsible sections use the shared `collapseHeader()` +
`toggleCollapse()` + `wireCollapsibles()` from `core/ui.js` (V1 rotating-▼
headers). Customization sections default collapsed; profile sections
default open — matching V1 exactly.
9.3. Hidden routes (`admin`, `achievements`, `inbox`) stay out of nav, dock, swipe
order and popovers — except `inbox`, which appears ONLY in the More popover
with unread count. They open only from explicit entry points (rank taps,
rings, profile links, More → Inbox).

## 10. Food pipeline staging (fixed order)

10.1. Text input: split on commas → `parseFood` (custom foods → ALIASES →
INGR_DB → plural fallback) → failures go to the Gemini worker (`{text}`, 15s timeout) → still
failing items get a "Log manually" switch, never silent drops.
10.2. Barcode/search use OpenFoodFacts product API (barcode + text search). Dish calculator uses
`INGREDIENT_NUTRITION` + `COOKING_METHODS`. Grades always via
`gradeFood(nutrients)` + `gradeLabel`.
10.3. Meal entries carry `xpAwarded: 30`; every delete path deducts it. Meal-plan logs award 30×N with per-entry xpAwarded.

## 11. Session round-8 additions (2026-09-24)

11.1. **Particles:** V1 engine is canonical (matrix full katakana+01+hex set, cyber vertical neon rods with glow+additive, constellation bidirectional+links<120px+mouse repel, sparks flicker+halo+additive, firefly 3-layer glow+blink+attract, snow per-particle alpha). Every slider (count/hue/speed) must actually drive the engine; speed default 1 range 0.2–3. No RAF leaks (cancel old loop + resize listener on rebuild), no `{once:true}` resize.
11.2. **Wallpaper:** zoom 50–200 (never 100–300), fit cover/contain/fill always exposed, offsets −100…+100 zero-center, snap-to-center, revoke object URLs, throttle pointermove, dim default 40.
11.3. **Themes:** custom themes may bundle wallpaper (`bgImage/bgType`) + particles (`particleEffect/p_hue`); applying a custom theme applies those too. Built-in THEMES stay V1-exact (light includes all 15 V1 extras).
11.4. **TODAY/mobile:** `.stat-blocks` 2-col ≤600px, sb-label/value ≤10px, ellipsis-proof. Character card stays side-by-side on mobile (V1 parity, no 1fr stack).
11.5. **Toggles:** every switch gets instant visual feedback (track/knob) + rerender; nav-opacity has enable toggle + slider; notify children stay checkboxes (V1 parity). Streak reminder must use `target` (never `target2`).
11.6. **Import:** accept V1 envelope `{data,themes}`, normalize `todos.tasks` + `zenSessions`, chronologicalMerge (union dedup, max-XP player wins), preserve deviceId/peerId. ZIP roundtrip via STORE-only `makeZip/parseZip/crc32`: `data.json+metadata.json+profile.png+themes.json+bg/*.png`. Import branches on filename `.zip` (ArrayBuffer) vs `.json` (text). Export offers ZIP/JSON/manual via `showExportOptions`.

## 12. Session round-9 additions (2026-09-24)

12.1. **Dialog hierarchy:** system update (`overlay-priority`, `--z-changelog:100005`) > tutorial/guide (`--z-guide:100002`) > normal overlays (`--z-overlay:9998`).
12.2. **Inbox:** hidden `inbox` route, More-popover only with count badge. Admin broadcast writes `S.inbox` locally; global delivery requires Supabase `global_broadcast` table (not yet provisioned — admin is local-only until then, see `admin.js` Content tab for Supabase URL/key).
12.3. **Scale Watcher:** onboarding weight carries `seed:true`; `weightlog1/7/30` ignore seed entries. Leaderboard render must NOT call `checkAchievements` (boot + log sites only).
12.4. **Rank-up:** `showLevelUp` shows gendered `rank_X_idle.gif` + congrats copy + 30-piece confetti canvas on rank-up only.
12.5. **Cyber:** `S.cyberDirection` straight|diagonal, popup on select.

## 13. Session round-11 additions (2026-09-24)

13.1. **Framing grid:** CSS-driven responsive — phone ≤600px height 240px + safe 10%/6%, desktop ≥768px height 380px + safe 15%/14%. No inline height on `#wp-frame`.
13.2. **Matrix readability:** trail 9→5 chars, fade 0.08→0.22, bold 16px, faster alpha decay. Count controls vertical gap (28→12px), columns fixed at width/16.
13.3. **Rank-up:** GIF removed; full-viewport fixed confetti canvas, 80 pieces, 180 frames.
13.4. **Char glass:** `.char-card-box/avatar-col/stats-col` + evo steps + stat bars in glass-mode selector (verified rgba 0.1 at 10%).
13.5. **Theme builder:** 13 V1 colors in Surfaces/Text/Accent sections, dual picker+hex synced both ways, template prefill, p_hue number, dialog-only.
13.6. **Global admin (phase 1):** Supabase `global_broadcasts/events/rewards` tables (SQL in cloud.js), `GlobalBoard` publish/fetch, admin Publish-global buttons, inbox sync + one-time claim via `claimedRewards`, new-broadcast toast. Local-first until tables exist.

## 14. Session round-12 additions (2026-09-25, beta-prep)

14.1. **Dialogs:** `.overlay` padded + scrollable, `.overlay-box` centered with `max-height: calc(100dvh-32px)` + inner scroll; desktop `440px`, `.overlay-wide` (theme builder) `560px`.
14.2. **Matrix/cyber:** cyber speeds normalized (`s 0.5–1.6`, diagonal `×3/×1.5`, straight `×6+2` V1 rain); matrix columns rebuild on resize.
14.3. **Onboarding:** dashboard tour → exploration offer → 5-leg auto-navigating tour → completion card; mascot in all popovers; per-screen spot tours for 12 screens; fixed wrong tour anchors.
14.4. **Inbox unread:** `S.inboxUnread` + red dots on More + inbox entry; cleared on open; incremented on local send + new global broadcast.
14.5. **Missions:** `core/missions.js` rule engine (squats/water/habits/meals/study/steps/workouts × continuous days); admin rule builder; auto-award + inbox note; global missions trackable from inbox; boot + per-update checks.
14.6. **Rewards:** inbox claimable (one-time via `claimedRewards`, negative = penalty); global rewards target-aware with penalty support.
14.7. **Users:** admin search across device/partners/global board; per-user message/reward/punish (remote via targeted inbox items); self reward/punish.
14.8. **Messaging:** broadcast `To` field (blank = all) + targeted rewards; `target` column with graceful fallback; inbox filters by device/name.
14.9. **Beta hygiene:** user-facing Admin/PWA texts removed (quests, inbox, tutorial, fullscreen, readme); `APP_VERSION 8.8` + V1 `zf_build/zf_schema` boot check + `BUILD_UPDATED`; admin locked to 5-tap + password (verified sole entry).

## 15. Session round-13 additions (2026-09-25, dialog/nav + particles + inbox/admin)

15.1. **Crash fix:** matrix `resize()` ran before `const R`/`parts` init (TDZ `Cannot access 'R'`) — matrix never rendered. Hoisted `R` + builders above `resize`; verified all 6 effects cycle error-free.
15.2. **Dialogs vs nav:** `.overlay` now z `10001` (above pill `9999`) + `108px` bottom clearance, so boxes never hide behind/overlap the nav. Priority order documented in §9.1.
15.3. **Particles:** snow + firefly fully hue-driven; matrix fixed columns with count→density (active fraction), gap 18; cyber diagonal respawns across full width/top+left edges (full-screen coverage both directions); matrix rebuilds on resize.
15.4. **Onboarding:** conversational Mochi flow — greeting → name → age → weight → goal, one question per card with working Skip throughout, Enter-to-continue, bigger mascot; dashboard + exploration tours rewritten in Mochi's voice; tour anchors fixed; zero Admin hints in tutorial.
15.5. **Inbox:** thread list (avatar, snippet, time, New/Reward/Surprise badges, per-row delete for read), search + All/Unread/Rewards filters, openable detail (styled hero, image, one-time claim, delete, back), mark-all-read, delete-all-read, stable message ids.
15.6. **Message designer:** background presets, highlight color, image URL (scheme-allowlisted), confetti toggle, live preview; global publish carries styling with graceful fallback; inbox renders styled cards + confetti shower on first open.
15.7. **Missions redo:** 8 categories (WORKOUT with exercise/sets/reps, WATER, HABITS, STREAK, STEPS, ZEN, STUDY, SCREENTIME max) × consistency days; log-verified auto-rewards; legacy `{metric}` rules still evaluate; global missions trackable from inbox.
15.8. **Themes:** particle speed + glass blur/opacity per custom theme (inputs, template prefill, applied on use).
15.9. **Persist/sw:** `flushSave()` write-through on `pagehide`/hidden-tab; sw precache covers missions/inbox; leaderboard opt-in notes global missions + XP.

## 16. Session round-14 additions (2026-09-26, matrix/sparks/particles/tutorial/inbox/missions/themes)

16.1. **Matrix:** 8-char words, fade 0.22→0.3 (crisper, less blur), white head only, rest fully hue-driven.
16.2. **Sparks:** straight/diagonal option with popup (`S.sparkDirection`); diagonal streaks slant wind-blown, respawn lower-left.
16.3. **Particles:** own collapsible card (`particle-fx`), split from wallpaper settings.
16.4. **Tutorial:** Mochi mascot 110px centered in all popovers; zero Admin hints.
16.5. **Admin tabs:** `.chart-tab-bar` scrolls horizontally on small screens, no cutoff.
16.6. **Inbox:** global broadcasts merged into thread list (same template + styled detail, Global badge, no delete); search/filters cover both.
16.7. **Missions:** single big card per global mission with inner per-category cards (bullets: exercise/sets/reps or count + consistency); new-category track mapping.
16.8. **Themes:** per-theme particle count (`particleCount`) + wallpaper fit (`bgFit`) + Edit/Duplicate actions.
16.9. **Global delete:** `20260925000001_global_delete.sql` pushed; admin outbox lists broadcasts + missions with Delete (`sbDel`); local history per-row delete; confetti toggle with working knob + preview badge.

## 17. Session round-15 additions (2026-09-26, persistence + collapse fixes)

17.1. **Matrix persistence:** guarded constellation fallthrough — it ran on matrix columns (`r/ph/vx` undefined → NaN), killing rain after frame one. Matrix now persists across re-renders (verified pixel-stable).

## 18. Reference matrix rain (2026-09-26, from `Downloads/particle-effect.html`)

18.1. **Reference behavior:** uniform 0.8 rows/frame (~768px/s), staggered negative starts, 20% white-flicker chars, `>0.975` reset gate, binary-heavy charset, speed slider 0.1–3.
18.2. **Adopted:** fall 5–9px/frame, pour-in starts, 10% white flicker (head stays solid white), reset gate, binary charset. Kept: hue body, hidden words, density-via-count, wallpaper-safe destination-out fade.

## 19. Asset registry + shared theme engine (2026-09-26)

19.1. **global_assets table** (`wallpaper`|`theme` kinds, name/url/data jsonb): admin deploys, everyone reads, admin deletes. Users get Coach picks gallery + Coach themes (save-copy + apply).
19.2. **Theme engine lives in `core/themes.js`** (THEMES, presets, applier). Features import from core — never feature-to-feature. Customization re-exports for compat.
19.3. **User hiding:** `hiddenGlobals[]` filters threads/missions/rewards; read-gated × buttons; global deletes stay admin-only via outbox.
