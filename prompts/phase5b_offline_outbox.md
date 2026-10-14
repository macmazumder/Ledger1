# PHASE 5b — Persistent offline outbox (finish 5.3)
Version target: 5.1. Requires v5.0 deployed and its PWA checklist passed.

## Goal
Entries made while offline (or on a bad connection) survive closing the window / restarting the computer and sync exactly once, in order, when the internet returns. Today the retry queue is in memory only.

## Tasks
- Persist `retryQueue` + the `unsaved` set to IndexedDB (not localStorage: size, atomicity), encrypted with the PIN-derived key like the snapshot. Store full item payloads (not just ids) so a queued add / edit can be rebuilt after a restart. Queue schema: `{seq, op, key, id|ids, payload, attempts, createdAt}`.
- On launch (after PIN unlock): load the snapshot, re-apply queued ops on top of it so the user SEES their pending work, then sync automatically when online. Keep the idempotent-id guarantee: retries must never create duplicates.
- Allow WRITING while offline (replace the current "read-only" gate): rows appear amber/unsaved, counter "N unsaved". Keep read-only only when no snapshot exists.
- Background Sync: register `sync` in the service worker where supported, but the page-driven flush on `online` / focus / poll remains the primary path (Safari has no Background Sync).
- Conflict policy: server wins for edits/deletes of rows that changed elsewhere; show a "Sync issues" list (Retry / Discard) instead of silently dropping.
- Show states: Online / Offline / Syncing / N pending / Sync failed. Never reload the page over pending work (already true for updates).
- Lock behaviour: while locked nothing is sent; the outbox stays encrypted on disk. "Forget this device" with a non-empty outbox must warn loudly.
- Tests: extend `test/pwa.e2e.test.js` (fake-indexeddb for jsdom) + `test/client_honest_ui.test.js`: add offline -> close -> reopen -> reconnect -> exactly one row; edit+delete coalescing across restarts; token rotated while outbox non-empty; corrupted outbox is quarantined, never applied.

## Acceptance
- Airplane mode: add 3 entries, close the app, reopen offline: the 3 entries are visible (amber). Reconnect: they appear in the Sheet exactly once, in order, and turn normal.
- `npm test` stays green; update `test/CHANGELOG.md`, `docs/PWA_SETUP.md` (section 4) and the checklist.
