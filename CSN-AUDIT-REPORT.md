# CSN Virtual — Audit, Fix & Finish Report

**Project:** China Southern Airlines Virtual (CSN Virtual) — Roblox / PTFS community virtual airline
**Entry point:** `server.js` (Node.js + Express 4, JSON data layer, no build step)
**Report date:** 2026-11-07
**Status:** All verification steps below were executed against a live server on port 4010 and pass, except the owner-action items listed under Remaining Risk.

---

## 1. Files changed and why

| File | Change | Reason |
|---|---|---|
| `server.js` | Fixed `GET /api/bookings/:reference` which returned an object literal instead of calling `res.json(...)` — the request hung forever. Now `return res.json(safeBookingResponse(booking));` | Known issue: "responses returned without res.json/res.send (hanging)". |
| `index.html` | Added the cinematic intro loader (Feature 1): full-screen glass overlay, "Start Experience ↗" button, `body.intro-locked` scroll lock, `@keyframes introAppear`; boarding audio is only constructed/played inside the START click handler and only when `/api/audio-status` reports the file exists. Added `class="active" aria-current="page"` to the Home nav item. | Feature 1 was missing; audio must not autoplay. |
| `admin.html` | Added a "Content Manager" panel + script: staff-key input (persisted to `localStorage` `csnStaffKey`), collection picker (flights / fleet / destinations / news / announcements / recruitment / settings), Load / Create / Update / Delete / Save-settings wired to the admin API with `x-csn-staff-key`. | Admin CRUD UI previously had no working controls (dead buttons). |
| `staff-login.html` | Created (file was 0 bytes): key-entry gate that verifies the key against `GET /api/admin/settings`, stores it, and redirects to `staff.html`. Matches locked design + nav. | Empty page shipped; staff needed a real entry point. |
| `admin-login.html` | Created (file was 0 bytes): same pattern as staff-login, redirects to `admin.html`. | Empty page shipped. |
| `.gitignore` | Added: ignores `.env`, `.env.*`, `node_modules/`, `CSN-V35data/`, `*.tmp`, `*.pid`, OS noise. | Prevent secret + private-data commits. |
| `.env.example` | Added: documents SESSION_SECRET, DISCORD_CLIENT_ID/SECRET/REDIRECT_URI, CSN_STAFF_API_KEY, DISCORD_WEBHOOK_URL, PORT, NODE_ENV. | Onboarding without leaking real values. |
| `.env` | Untracked from git (`git rm --cached`) — still on disk, covered by `.gitignore`. | Real secrets were committed. |
| Data layer | `*.json` re-homed under `CSN-V35data/` (private; never statically served). | Keep runtime data out of the web root. |
| `csn.css` + public pages (`about`, `booking`, `booking-confirmation`, `community`, `destinations`, `error`, `fleet`, `flights`, `my-bookings`, `news`, `profile`, `recruitment`, `404`, `staff`) | Standardised locked nav block, styled error rendering, booking persistence/confirmation flow, profile & my-bookings pages. | Consistency + fixing 404s/unstyled errors/booking bounce (prior work, re-verified this pass). |

---

## 2. Bugs fixed

1. **Hanging booking lookup (real, fixed this pass).** `GET /api/bookings/:reference` returned an object without `res.json`, so the request never completed. Fixed; verified with `curl` returning immediately.
2. **Missing routes.** `/Login.html` (capital L) alias + extension-less routes for every page, including `/community`, `/booking-confirmation`. Verified 200.
3. **Case-sensitive mismatch.** HTML keeps `Login.html`; the server alias maps it to the on-disk `login.html`. Verified both `/Login.html` and `/login.html` → 200.
4. **Staff front end not sending the key.** `staff.html` now sends `x-csn-staff-key` on verify / check-in / board (`staffHeaders()`), and `admin.html` on all admin calls. Verified: 403 without key, 200 with key.
5. **Booking confirmation bounce.** Bookings are persisted server-side and handed off via `sessionStorage`; confirmation works from the stored record.
6. **Unstyled 404/500.** Browser navigations get a styled on-brand error page; API calls get JSON. Verified by content-type.
7. **Empty pages** (`staff-login.html`, `admin-login.html`, `404.html`, `error.html`, `fleet.html`, `news.html`, `profile.html`, `my-bookings.html`) built to match the design.

---

## 3. Features completed / confirmed

1. **Cinematic loader** — intro overlay; boarding audio only plays after START, only if the audio file exists (no autoplay bypass).
2. **Discord OAuth** — `/auth/discord` + callback, crypto `state` (64 hex chars), `crypto.timingSafeEqual` validation, styled error pages, no stack traces.
3. **Profiles & permissions** — role derived server-side from the stored user record, never from client claims.
4. **Booking engine** — one-way / round-trip, 1–9 passengers, reference + passenger code + security code + ticket token + QR payload, persisted.
5. **Friend booking** — stored `pending` with `requiresConfirmation:true`; explicit confirm/decline; never auto-confirms.
6. **Server-authoritative QR verification** — verify/check-in/board validated on the server; valid ticket boards exactly once; repeats return 409.
7. **Staff panel** — verify / check-in / board gated by `x-csn-staff-key` (timing-safe compare).
8. **Admin panel** — key-gated CRUD for flights, fleet, destinations, news, announcements, recruitment, settings.
9. **Discord notifications** — fire-and-forget `notifyDiscord()` (never blocks the HTTP response; webhook URL scheme-validated; failures logged without secrets).
10. **Public API hygiene** — hides `published:false` / `status:'draft'` / `status:'private'`; strips `ticketToken`, `passengerCode`, `securityCode`, `qrPayload` from non-staff responses.

**Security present:** helmet (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy), express-rate-limit (600/min on `/api`, 60/15min on `/auth`), atomic JSON writes, dotfiles denied + directory listing off, static guard 404s the data dir / `server.js` / `.env` / `node_modules` / `.git`.

---

## 4. Verification actually observed (port 4010)

**Syntax:** `node --check server.js` → `SERVER_OK`. All inline page `<script>` blocks → `ALL_INLINE_SCRIPTS_OK`.

**Page routes (all 200):** `/`, `/index.html`, `/about.html`, `/destinations.html`, `/flights.html`, `/recruitment.html`, `/community.html`, `/booking.html`, `/login.html`, `/Login.html`, `/profile.html`, `/my-bookings.html`, `/news.html`, `/fleet.html`, `/staff.html`, `/admin.html`, `/staff-login.html`, `/admin-login.html`, `/error.html`, `/404.html`, `/booking-confirmation.html`.

**Static guard (all 404 as intended):** `/CSN-V35data/users.json`, `/server.js`, `/.env`, `/package.json`, `/.git/config`.

**Public API (all 200):** `/api/health`, `/api/flights`, `/api/fleet`, `/api/destinations`, `/api/news`, `/api/events`, `/api/announcements`, `/api/recruitment`.

**Booking lifecycle:**
```
CREATE         -> 201/200 success, returns reference + codes + token
PUBLIC LOOKUP  -> leaks: NONE   (ticketToken/passengerCode/securityCode/qrPayload stripped)
```

**Staff lifecycle:**
```
verify  no key            -> 403
verify  key + wrong code  -> 403
verify  key + correct     -> 200
board   before check-in   -> 409
check-in                  -> 200 ; repeat -> 409
board                     -> 200 ; repeat -> 409
```

**Friend flow:** create → `status: pending`, `requiresConfirmation: true`; confirm → 200; re-confirm → 409.

**Admin CRUD:** `GET /api/admin/settings` no key → 403, with key → 200; `POST /api/admin/news` no key → 403; unknown collection → 404; create/delete with key → 200. A `status:"draft"` news item was created via admin and returned `count=0` hits from public `/api/news` (draft correctly hidden), then deleted.

**Sanitisation:** `/api/flights` public output contains no `staffNotes` / `internalNotes` / `privateToken`.

**OAuth:** `/auth/discord` → 302 with 64-hex `state`; callback with no code → 400; `error=access_denied` (cancelled) → 400; stale/wrong state → 400 — all styled HTML for browsers, JSON for API clients (no stack traces).

**Error handling:** browser 404 → `text/html`; API 404 → `application/json`.

**Nav consistency:** every public page carries the exact 8-link locked nav (Home/About/Destinations/Flights/recruitment/Community/Booking + `Login.html` CTA) with the correct `active` item. Pages without the public nav are internal gates only (`login.html`, `staff.html`, `admin.html`).

**Local reference crawl:** 18 unique local refs; the only two "unresolved" are `Login.html` (server route alias → 200) and `auth/discord` (server route → 302) — both are routes, not files. No real broken links.

---

## 5. Remaining risk / unfinished items (owner action required)

1. **ROTATE the Discord client secret — HIGH.** `.env` contained a live `DISCORD_CLIENT_SECRET` and was committed in git history (commit `7d24c1b`). It is now untracked and `.gitignore`d, but history still contains it. Regenerate the secret in the Discord Developer Portal and purge history (`git filter-repo` / BFG). Do not treat untracking alone as a fix.
2. **ROTATE `SESSION_SECRET` — HIGH.** Current value `China southern airlines 2026` is under 32 chars; the server logs `[CSN SECURITY WARNING] SESSION_SECRET is too short or guessable` and falls back to a per-run random secret (so sessions do not survive restarts). Set a long random value.
3. **`DISCORD_REDIRECT_URI` port mismatch — MEDIUM.** `.env` hardcodes `http://localhost:3000/auth/discord/callback`. In production this must be the real public callback URL or Discord login will fail.
4. **`audio/boarding.mp3` absent — LOW.** `/api/audio-status` returns `boardingAudioAvailable:false` and the loader correctly stays silent. Feature 1 audio activates as soon as the owner adds the file; no code change needed.
5. **Empty shared JS files — cosmetic.** `admin.js`, `api.js`, `auth.js`, `booking.js`, `bot.js`, `staff.js`, etc. are all 0 bytes and referenced by no page; every page uses inline scripts (the one-inline-`<style>`/`<script>` convention). Harmless; can be deleted for tidiness or left as-is.
6. **No `robots.txt` — LOW.** Returns 404. Add one if search-engine indexing policy is needed.

---

## 6. What was deliberately NOT changed

Brand identity, palette (`#0878d1` / `#10243d`), fonts (Inter), radius (~28px), the standard nav block, and the per-page inline-style/script convention were preserved. No emoji added to the UI.
