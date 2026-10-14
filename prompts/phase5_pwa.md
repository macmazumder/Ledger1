# PHASE 5 — Installable PWA
> STATUS (v5.0): 5.1 split/hosting, 5.2 secure API (token hash, kill switch, rate limit, lockout, audit log, PIN vault, auto-lock), 5.4 polish (manifest, SVG+PNG icons, install button, update banner, shortcuts) are DONE and tested. 5.3 offline-first is PARTIAL: app shell works offline and the last data opens read-only (encrypted snapshot); the persistent write OUTBOX is NOT done: see `phase5b_offline_outbox.md`. Phase 4 (performance) is still pending.
Version target: 5.0. Requires Phases 1–4 deployed and stable.

## Reality check you must respect
An Apps Script web app CANNOT be a real PWA by itself: it cannot serve a manifest or service worker from its own origin, and it renders inside a Google iframe. So:
- Front-end = static files hosted on a free HTTPS host (GitHub Pages or Netlify): `index.html`, `app.js`, `styles.css`, `manifest.webmanifest`, `sw.js`, icons.
- Backend = the same Apps Script project exposed as a JSON API via `doPost` (and `doGet` for health), returning `ContentService` JSON.
Explain this architecture to me first and wait for my approval of the host choice.

## Tasks

### 5.1 Split the code
- Move CSS and JS out of `Ledger.html` into separate files in a new `pwa/` folder. Keep `src/Ledger.html` working as the Apps Script version (shared code where possible, with one `api` adapter: `google.script.run` inside Apps Script, `fetch` in the PWA).
- Add `pwa/README.md` with exact deploy steps for the host (click by click, for a non-expert).

### 5.2 Secure API (important)
- Cross-origin `fetch` to Apps Script requires the web app to be accessible without a Google login ("Anyone"). That removes Phase 1's account protection, so replace it with: a long random API token stored in Script Properties, sent in the request body (not the URL), compared in constant time; per-token rate limit using CacheService; a kill switch property `API_ENABLED`; token rotation function; every request logged (time, action, ok/fail) to a "Audit Log" tab (no sensitive data).
- Use `text/plain` POST bodies to avoid CORS preflight; handle Apps Script redirects correctly.
- Validate every action name against an allow-list; reuse the Phase 1–3 server functions. Never expose `setBulkData` unless explicitly confirmed with a second token/PIN.
- Add an app PIN screen on the PWA (hashed locally) that unlocks the stored token; auto-lock after inactivity.
- Document clearly what I must set in Deploy > Manage deployments for the API deployment, and keep the owner-only HtmlService deployment as a separate fallback.

### 5.3 Offline-first
- Service worker caches the app shell (versioned cache, update flow with "New version available — reload").
- IndexedDB stores a local copy of data and an OUTBOX of pending writes (id, action, payload, timestamp, attempts). Writes apply locally immediately, sync in order when online (background sync where supported, plus on `online` / app focus). Idempotent ids (Phase 2) make retries safe.
- Conflict policy: server wins for edits/deletes of rows changed elsewhere; show a "Sync issues" list for any rejected outbox item with Retry / Discard.
- Show clear states: Online / Offline / Syncing / N pending / Sync failed.

### 5.4 PWA polish
- Manifest (name "Mazumder Ledger", short_name, start_url, scope, display standalone, theme/background colours matching the indigo theme, maskable icons 192/512 — generate the icons for me), apple touch icon, iOS meta tags, install prompt button.
- Lighthouse PWA/installability checklist results.

## Acceptance
- Install to Android home screen; launches full screen; works in airplane mode (add 3 entries); reconnect -> entries appear in the Sheet exactly once, in order.
- Wrong token or API disabled -> requests rejected, nothing readable.
- Two devices stay consistent via the Phase 3 version polling.
- Rolling the token locks out an old installed copy until re-paired.
