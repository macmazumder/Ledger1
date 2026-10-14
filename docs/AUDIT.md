# Audit — Mazumder Ledger (Sheets migration), 2026-10-04

Compared against `reference/original-firebase-ledger.html`.
Original = localStorage + Firebase realtime sync + offline queue + Drive push.
Migrated = Apps Script + one Sheet tab per data type, per-row API for logs, full-table rewrite for the rest.

## Critical (data loss / exposure)
C1. Failed `getAllData` is swallowed; app continues with empty arrays; next `setData` wipes the whole tab. `loadAll` also ends with `setSaveStatus(true)` so the error turns green.
C2. Wallets, People, Cards, Categories, Monthly still use whole-table `setData` from client state -> a stale device overwrites newer rows from another device. No live sync exists (only the Refresh button).
C3. `doGet` has no auth check and uses ALLOWALL. If deployed as "Anyone", all backend functions are open.
C4. Only rows 2..3001 are pre-formatted. After that Sheets re-parses values: dates become Date objects, notes starting with `=` become formulas, `1/2` becomes a date. Date/time fallback uses `Session.getScriptTimeZone()` (can differ from spreadsheet tz; 1899 offset skews times).

## High
H1. Optimistic UI: local state is changed and rendered before the server confirms; failures leave phantom rows. `updateItem` / `deleteItem` return false when id not found but the client treats any response as success.
H2. Wallet transfer = two independent `appendItem` calls (not atomic); editing/deleting one half orphans the other (`transferId` unused).
H3. Empty category tabs return `"[]"` (truthy) so default categories never load -> empty dropdowns on first run.
H4. Import alert says "saved" even if `persistAll` returned false.
H5. No capacity guard: new sheets have ~1000 rows; `setValues` beyond the grid throws. Formatting 3000 rows in `_ensureSheet` may also throw on a fresh tab (verify).
H6. `onOpen` runs `setupSheets_()` every open (headers, 3000-row formats, autoResizeColumn on 11 tabs) -> slow.

## Medium / Low
M1. `todayStr()` uses `toISOString()` (UTC): between 00:00 and 05:30 IST "today" is yesterday; mixed with local `getMonth()`.
M2. `normalizeDate` returns invalid strings as-is; a blank date crashes `d.date.slice(0,7)`.
M3. Offline entry and offline queue from the original are gone; failed saves look saved.
M4. No auto refresh across devices.
M5. Unescaped fields in HTML (`date`, `time`, ids) -> stored XSS if anyone can edit the Sheet.
M6. "Monthly Summary" tab holds only manual bases, not computed totals (confusing). `0.##` number format shows `100.`. `money()` hides paise. Chart axis shows `₹0k` for small values. Beige table colours clash with indigo theme.
M7. Dead code: client `getData`, old-shape migration in `loadAll`. Orphaned entries after wallet delete. No way to delete a person / card / category (also true in original).
M8. To test inside Apps Script iframe: `confirm()`/`alert()` and Excel download.
M9. Apps Script web apps cannot be PWAs on their own; needs external host + JSON API.
