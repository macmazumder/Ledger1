# PHASE 1 — Stop data loss and exposure
Fixes audit: C1, C2, C3, H2 (+ safety net for C4). Version target: 1.0

## Goal
After this phase it must be IMPOSSIBLE for a failed load, a stale tab, or an unauthorised visitor to destroy or read my data, and money transfers must be atomic.

## Tasks

### 1.1 Access control (C3)
- Add `ALLOWED_EMAILS` read from Script Properties (key `ALLOWED_EMAILS`, comma-separated), with a clear setup function `setAllowedEmails_()` / menu item "Set allowed emails" I can run once. If the property is empty, allow only the script owner (`Session.getEffectiveUser().getEmail()`).
- Add `assertAllowed_()` and call it at the top of `doGet` and EVERY public function (getData, setData, getAllData, setBulkData, appendItem, updateItem, deleteItem and all new ones). Unauthorised -> `doGet` shows a simple "Access denied" page; API functions throw.
- Remove `ALLOWALL` unless embedding is truly required (use default frame options). Explain what you chose.
- Update `appsscript.json` (keep executeAs USER_DEPLOYING, access MYSELF) and tell me exactly what to select in Deploy > Manage deployments.
- Make `LockService.getDocumentLock()` usage null-safe via a helper `withLock_(ms, fn)`; if lock is unavailable return a clear error ("Server busy, try again").

### 1.2 Never write after a failed load (C1)
- Client: add `state.loaded = false`. `loadAll()` must throw / return false on failure; do NOT fall back to empty arrays or defaults.
- On failure show a full-screen blocking message with a Retry button (Hinglish: "Data load nahi ho paya — dobara try karo"). While not loaded, every save function (`setData`, `addItem`, `editItemRemote`, `removeItemRemote`, `persistAll`) must refuse and return false.
- Remove the unconditional `setSaveStatus(true)` at the end of `loadAll`; status must reflect reality.

### 1.3 Kill whole-table overwrites from the client (C2)
- Convert Wallets, People, Cards and Monthly to the per-row API (`appendItem` / `updateItem` / `deleteItem`). Monthly rows have ids; use an upsert helper `upsertItem(key, id, item)` on the server (update if found else append).
- Categories: add `addCategory(key, name)` on the server (case-insensitive duplicate check, trim, max length). No client call may rewrite a whole category list.
- Wallet delete: add a server function `deleteWalletCascade(walletId)` that deletes the wallet and its manual `Wallet Transactions` rows in one locked operation. Do not touch other tabs' rows (keep current behaviour: they become "Not linked").
- Keep `setBulkData` ONLY for Excel import, and harden it: before replacing anything, create an automatic backup copy (see 1.5), require an explicit `confirmReplace: true` flag, and write new data first then trim leftovers (never clear-then-write). Refuse to replace a non-empty tab with an empty array.
- Also make server `_writeKey` / `setData` refuse an empty array when the tab currently has data, unless a `force` flag is passed. Mark `setData` as deprecated for the client.

### 1.4 Atomic transfers (H2)
- Add `appendItems(key, [items])` that writes all rows in a single `setValues` under one lock.
- Wallet-to-wallet transfer uses it; both halves share `transferId`.
- Deleting a transfer half asks "Dono taraf ki entry delete hogi" and calls `deleteByField(key, 'transferId', value)` server-side. Editing a transfer half is blocked with a clear message ("Transfer edit nahi ho sakta, delete karke dobara banao") unless you implement safe paired editing.

### 1.5 Backup safety net
- `createBackup_(reason)`: copies the spreadsheet into a Drive folder "Mazumder Ledger Backups" named `Ledger-YYYY-MM-DD-HHmm-<reason>`; keep only the last 30.
- `installNightlyBackupTrigger()` (menu item) creating a daily time-driven trigger around 2 AM; make it idempotent (no duplicate triggers).
- Auto-call `createBackup_('before-import')` inside Excel import.

### 1.6 Minimal supporting changes
- Add `LEDGER_VERSION` and show it.
- Do NOT yet fix formatting/timezone/optimistic UI (Phase 2).

## Acceptance (I will test)
- Disable network, reload -> blocking error + Retry, no way to save.
- Open the web app with a different Google account / private window -> Access denied; calling `google.script.run.getAllData()` from that account fails.
- Two tabs open: add wallet in tab A; in stale tab B edit another wallet -> wallet from tab A still exists in the Sheet.
- Transfer between wallets creates 2 rows with the same transferId; delete one half removes both; forcing a failure on the second row leaves no half-written transfer.
- Import Excel creates a backup copy first; importing an empty sheet cannot wipe an existing tab.
- Nightly trigger exists exactly once.
