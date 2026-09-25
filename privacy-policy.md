# ZenFit V2 — Privacy Policy

_Last updated: 2026-09-23. Applies to the ZenFit V2 progressive web app._

## The short version

**ZenFit works without an account and stores your data on your own device.**
Nothing is uploaded, sold, or tracked by default. A few features intentionally
contact outside services — each is listed below, with what is sent and when.

## 1. Data stored on your device

All of the following never leave your browser unless you use the features in
section 2:

- Profile and body metrics (name, age, height, weight, goals)
- Nutrition, water, workout, habit, task, study, zen, mood and weight logs
- Achievements, quests, settings, themes, wallpapers, notification preferences
- Friends list, share codes, pending/sent requests, challenge history

Storage mechanisms used:

| Mechanism         | What lives there                              | Cleared by            |
|-------------------|-----------------------------------------------|-----------------------|
| `localStorage`    | App state (`zenfit_v1`), theme keys, flags    | Reset / browser clear |
| IndexedDB         | State mirror, background images               | Reset / browser clear |
| Cache Storage     | Offline app shell + assets (service worker)   | SW update / clear     |
| Session storage   | Short-lived UI state (e.g. transient drafts)  | Tab close             |

Use **Profile → Data Management → Reset All Data** to wipe everything.

## 2. Data that leaves your device (only when you use these features)

### 2.1 Food lookups
- **OpenFoodFacts** (search + barcode): sends your search text or barcode number, receives public nutrition facts. See `world.openfoodfacts.org` privacy policy.
- **Gemini-via-Cloudflare-Worker** (fuzzy dish parsing fallback): sends the dish text you typed, receives estimated nutrition. No identity is attached.

### 2.2 Global leaderboard (opt-in only)
Off by default. When you toggle it on (Leaderboard → Global, filled profile
required), the app publishes **only** this public card to Supabase:
name, level, XP, rank, best streak and profile picture (if set).
No logs, meals, weights or private data are ever uploaded. Toggle off any
time to stop syncing and request row deletion.

### 2.3 Friends / P2P (only when you connect)
- **Share codes** are base64-encoded public cards (name, level, XP, rank,
  streak, counts, peer ID) that you manually send to a friend.
- **PeerJS connections** go directly between devices (no ZenFit server). Chat
  messages, high-fives, challenge invites and stat cards travel over that
  direct channel. Either side can remove the other at any time.

### 2.4 Camera and notifications
- The barcode scanner uses your camera **on-device only**; no images are uploaded.
- Notifications are scheduled and delivered **locally** (timers + service
  worker). No push server, no tokens leave the device.

### 2.5 Fonts, charts, sounds
The app loads fonts (Google Fonts), emoji images (Twemoji CDN), the anime.js
CDN and the PeerJS library from public CDNs. These providers see standard
web-request metadata (IP, user agent) as with any website. All of these have
offline fallbacks except first-load library fetches.

## 3. Admin console

The hidden owner console is protected by a password that is verified as a
**SHA-256 hash inside the app** (`modules/core/secrets.js`). The plaintext
exists only in the owner's local, gitignored `admin.env` and is never
transmitted anywhere. Failed attempts are rate-limited per session.

## 4. Children

ZenFit is a general wellness tracker with no age gate. A guardian should
supervise use by children, as with any health app.

## 5. Changes

Material changes to this policy will be noted in the in-app changelog
([ SYSTEM UPDATE ] popup) when the app updates.

## 6. Contact

This is a self-hosted personal project. For privacy questions or deletion
help with the optional global board, contact the instance owner who gave
you the app link.
