# PHASE 3 — Robustness and parity with the old app
Fixes audit: M1, M2, M4, M5, M6, M7 (+ part of M3). Version target: 3.0. Requires Phase 2.

## Tasks

### 3.1 Dates and numbers (M1, M2)
- `todayStr()` and every "current month/year" use LOCAL date parts (Asia/Kolkata behaviour), never `toISOString()`.
- Strict date validation in `normalizeDate`: real calendar date, year 2000–2100, otherwise block the save with a Hinglish message. Apply the same validation server-side.
- Null-guard every `.slice` / `.localeCompare` on date, time, category, note fields so one bad Sheet row can never crash the app; show such rows in a "Needs attention" list instead.
- `money()` keeps rupees by default but show paise when the amount has paise (12.50 not 13). Fix floating-point sums (round to 2 decimals).
- Chart axis labels: use ₹ with k only above 1,000, else plain rupees.

### 3.2 Auto refresh across devices (M4)
- Server keeps a `dataVersion` counter in PropertiesService, incremented on every successful write. Add `getDataVersion()` (cheap).
- Client polls every 45 s while the tab is visible (pause on hidden tab, pause while a form is being edited / has unsaved input). If the version changed, reload data silently and re-render without wiping an open form. Show "Updated from another device" briefly.

### 3.3 Unsaved-save retry (part of M3)
- In-memory retry queue for failed saves with a visible "N unsaved" badge and a "Retry now" button. (True offline persistence is Phase 5 — here only test whether `localStorage` is usable inside the HtmlService iframe and report the result; do not rely on it.)

### 3.4 Security hygiene (M5)
- Escape EVERY dynamic value inserted into HTML (dates, times, ids, tags, numbers) and use `data-*` attributes safely. Add a single `h()` helper and replace ad-hoc template insertions. Server-side: validate that `id` values match `/^[a-z0-9]{6,40}$/`.

### 3.5 Data model clarity (M6, M7)
- Rename the Sheet tab "Monthly Summary" to "Monthly Manual Base" (migrate safely in `repairFormats_`, keep the old name as a fallback lookup) OR add read-only computed columns via formulas — pick the safer option and explain.
- Add delete/archive for Person, Card and Category. Deleting a person/card with entries must ask and offer "archive" (hide from lists, keep history). Add an `archived` column at the END of the schema for People, Cards, and Wallets.
- When a wallet is deleted, list how many entries in other tabs reference it and offer to keep them as "Not linked" (current behaviour) — no silent orphaning.
- Remove dead code (client `getData`, old-shape migration) and tidy the leftover beige colours to match the indigo theme (CSS variables only, no layout changes).
- Excel export: include `TransferId` and IDs so a round trip import loses nothing. Add the CSV snapshot export from the original (`buildCsvExport`) as a "Download CSV" option (no Drive push).

## Acceptance
- At 1:30 AM IST a new entry gets today's date.
- Invalid date like 31-02-2026 is blocked; a hand-blanked date cell in the Sheet doesn't crash the app.
- Add on phone; desktop shows it within ~1 minute without pressing Refresh and without losing a half-typed form.
- Archive a person: disappears from the list, history preserved; restore works.
- Export then import round-trips with identical balances.
