# PHASE 2 — Make writes correct
Fixes audit: C4, H1, H3, H4, H5, H6. Version target: 2.0. Requires Phase 1 deployed and tested.

## Goal
What I see on screen is exactly what is in the Sheet, with correct dates/times/numbers forever, no matter how many rows.

## Tasks

### 2.1 Capacity and formatting (C4, H5)
- Add `ensureRows_(sheet, needed)`: if `sheet.getMaxRows() < needed` call `insertRowsAfter`. Call it before every append / bulk write.
- Replace the "pre-format 3000 rows" approach: format whole columns (`sheet.getRange(2, col, sheet.getMaxRows()-1, 1)`) once in setup, AND set explicit number formats on every row you write (`setNumberFormats` for the written range) so a row can never be auto-parsed. Text columns `@`; amount columns `General` (or `0.00` — pick one and justify; avoid `0.##` which shows `100.`).
- On read, treat any returned `Date` object defensively using the SPREADSHEET timezone (`ss.getSpreadsheetTimeZone()`), and for the time column read the display value (`getDisplayValues`) rather than converting.
- Add a repair function `repairFormats_()` (menu: "Setup / Repair Data Sheets") that re-applies formats and converts any Date-typed cells in date/time columns back to correct text without losing data.
- Guard against formula injection: never write a string beginning with `= + - @` into a text column without a leading `'`-safe strategy (formats `@` already protect; verify and test).

### 2.2 Honest UI (H1)
- Replace optimistic updates with: show the row immediately but mark it `pending`; on server success clear the flag; on failure ROLL BACK local state, re-render, and show the Hinglish error. Do the same for edit and delete (restore the old object on failure).
- `updateItem` / `deleteItem` return `{ok:true|false, reason}`; the client must treat `false` as an error ("Entry nahi mili — Refresh karo").
- Add a small "unsaved/pending" counter near the save status.
- Add idempotency: client sends the generated `id`; server `appendItem` rejects a duplicate id (return ok with `duplicate:true`) so retries never create double rows.

### 2.3 Defaults and import (H3, H4)
- Seed default expense and daily categories on the SERVER when a category tab is empty (run in setup and in `getAllData`). Remove the client fallback that treats `"[]"` as data.
- Import: show success only if `persistAll` actually succeeded; otherwise show the real error and keep the previous Sheet data untouched (Phase 1 backup remains).

### 2.4 Faster open (H6)
- Remove `setupSheets_()` from `onOpen`. Create tabs lazily (only when missing) and via the menu "Setup / Repair Data Sheets". Remove `autoResizeColumn` from hot paths (set fixed widths once in setup).

## Acceptance
- Put 5,000+ rows into Daily Income (script helper `seedTestRows_(n)` you provide, runs on the COPY only, with a matching `clearTestRows_()`); append more via the UI; dates/time/notes remain text; a note `=1+1` stays text.
- Kill the network mid-save: the new row disappears from the screen with an error; Refresh confirms it is not in the Sheet.
- Click Add twice quickly or retry a timed-out save: exactly one row.
- Fresh sheet opens with default categories.
- Opening the Sheet is fast (no setup run on open).
