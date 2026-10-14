# Manual test checklist (run after every phase)

Use a COPY of the sheet. Tick each line. Note the version you tested.

## Load and basics
- [ ] App opens from the Apps Script web app URL (phone) and from the Sheet menu (desktop)
- [ ] All 11 data tabs exist with headers; no error toast on load
- [ ] Fresh sheet: expense and daily category dropdowns show default categories
- [ ] Turn off Wi-Fi, reload: app shows a blocking error / retry, NOT an empty ledger
- [ ] With the error screen showing, you cannot add anything

## Each module (add, edit, delete, then Refresh and confirm it persisted)
- [ ] Wallet: add, edit opening balance, delete; passbook running balance correct
- [ ] Wallet Money In / Money Out; wallet-to-wallet transfer creates both rows; deleting one side removes both
- [ ] People: add person, all 4 entry types, edit, delete; "owes you / you owe" text correct
- [ ] Credit Card: add card, withdraw / advance / bill; outstanding correct
- [ ] Expenses: add with new category; wallet balance drops
- [ ] Daily Ledger: add; day view and month view totals; wallet balance rises
- [ ] Monthly Summary: manual base edit, add year; totals = manual + logged

## Data correctness in the Sheet
- [ ] Dates are text `YYYY-MM-DD`; times `HH:mm`; amounts are numbers
- [ ] A note starting with `=` or `+` stays plain text
- [ ] Add an entry at row 3005+ (or after Phase 2: row 5000+) and it still stays text
- [ ] Entry made at 1:00 AM IST gets today's local date

## Failure behaviour
- [ ] Save while offline -> clear error, entry NOT shown as saved (or shown as "unsaved")
- [ ] Two devices: add on phone, Refresh on desktop shows it; edit on both, nothing disappears
- [ ] Double-click Add -> only one row created

## Import / export
- [ ] Export to Excel downloads and opens
- [ ] Import that file into a COPY sheet; counts and balances match; failure shows an error

## Security
- [ ] Open the web app URL in a private window / another Google account -> access denied

## Phase 1 additions
- [ ] Top-right shows `v1.0` after load
- [ ] Menu has: Set allowed emails, Backup now, Install nightly backup. Run "Backup now": a copy appears in Drive > "Mazumder Ledger Backups"
- [ ] Run "Install nightly backup" twice: Apps Script > Triggers shows exactly ONE `nightlyBackup_` trigger
- [ ] Network off + reload: red "Data load nahi ho paya" screen with Retry; clicking Add anywhere is impossible; Retry works once online
- [ ] Two tabs: add wallet in tab A; in stale tab B edit another wallet; Refresh B -> both wallets still there
- [ ] Transfer between wallets -> 2 rows with the same Transfer ID in the Sheet; Edit is blocked with a message; Delete asks and removes BOTH rows
- [ ] Add year in Monthly Summary, edit a manual base: only those rows change in the Sheet
- [ ] Delete a wallet: its Manual rows go, other tabs' rows stay "Not linked"
- [ ] Import Excel on a COPY: confirm prompt appears, a backup is created first, data replaced; cancelling the prompt changes nothing
- [ ] Private window / other Google account opens the web app URL -> "Access denied"

## Phase 2 additions
- [ ] Top-right shows `v2.0`. Opening the Sheet is fast (no setup delay)
- [ ] Menu > Setup / Repair Data Sheets: alert shows "repaired: N" (0 is fine). Run it twice: second run = 0
- [ ] Brand-new Sheet copy (or empty category tabs): Expenses and Daily dropdowns show the default categories
- [ ] Network off, then Add an entry: row appears faded with "1 saving…", then DISAPPEARS with an error; after Refresh it is not in the Sheet
- [ ] Network off, then Edit an entry: old values come back. Delete while offline: row comes back in place
- [ ] Double-click "Add Entry" quickly: exactly one row
- [ ] Delete an entry in tab A; in stale tab B edit it: message "Entry nahi mili — Refresh karo", and B's screen reverts
- [ ] On a COPY only: Apps Script > Project Settings > Script Properties add `ALLOW_TEST_SEED` = `true`; run `seedTestRows_` with 5200 in the editor; Daily Income has 5,200+ rows; add one more entry from the app: its Date/Time stay text, a note `=1+1` stays plain text; then run `clearTestRows_` and delete the property
- [ ] Add a note starting with `=` or `+` anywhere: it shows as the same text in the app and the Sheet
- [ ] Amount column shows `100`, not `100.`

## Phase 3 additions
- [ ] Menu > Setup / Repair Data Sheets ONCE: tab "Monthly Summary" becomes "Monthly Manual Base"; Wallets / People / Credit Cards get an "Archived" header in column D / C / C
- [ ] Top-right `v3.0`; footer at the bottom shows `offline storage in this view: available/blocked` — NOTE the value for the web app URL and for the Sheet sidebar and tell me
- [ ] At 1:30 AM–5:30 AM IST (or set the phone clock): a new entry defaults to TODAY's date, not yesterday
- [ ] Type `31-02-2026` in any date field and save: blocked with "Date galat hai"; `29-02-2028` is accepted
- [ ] Add on phone; on desktop (no Refresh pressed) it appears within ~1 minute with a toast; while typing an amount on desktop, nothing gets wiped
- [ ] Turn Wi-Fi off, add an Expense: row appears amber, button "⚠ 1 unsaved — Retry now", NO error popup; turn Wi-Fi on: it saves by itself (or press Retry); the Sheet has exactly ONE row
- [ ] Wi-Fi off: add then delete the same new row: nothing is ever written to the Sheet
- [ ] Hand-edit a date cell in the Sheet to `31-02-2026` and press Refresh: red "Needs attention" box on the Dashboard; the app still works
- [ ] Archive a wallet / person / card (with balance: a warning appears); it disappears from lists and dropdowns, "Archived dikhao" brings it back, totals on the Dashboard are unchanged; Restore works
- [ ] Delete a person with entries: refused (use Archive). Delete one without entries: works
- [ ] Delete a wallet that is used in Expenses: the message lists how many entries stay as "Not linked"
- [ ] Expenses / Daily > "Categories manage karo": remove a category; old entries keep it; you cannot remove the last one
- [ ] Amounts like 12.5 show `₹12.50`; 100 shows `₹100`
- [ ] Export to Excel, then Import it into a COPY: balances identical, archived items still archived, transfers still paired; "📄 CSV" downloads a file that opens in Excel

## v5.0 PWA additions (desktop first)
Setup first: follow docs/PWA_SETUP.md (token, "Anyone" API deployment, host dist/).
- [ ] Open the hosted URL on DESKTOP Chrome/Edge: only the "Pair this device" screen shows (no data)
- [ ] Pair with URL + token + PIN: app loads, top-right `v5.0`, footer says `PWA`
- [ ] Pairing with a wrong token says Unauthorized; with an `http://` or non-Google URL it is refused before anything is sent
- [ ] Address-bar install icon / "Install app" button installs it; it opens in its own window with the ₹ icon; right-click the app icon shows Daily / Expenses / Wallets / People shortcuts
- [ ] Alt+1..Alt+7 switch tabs; resize the window wide (>1280px): layout uses the extra width; Ctrl+P prints a clean page (no sidebar/buttons)
- [ ] "🔒 Lock" asks for the PIN again; 5 wrong PINs makes you wait; leaving it idle 15 minutes locks it
- [ ] Add an entry in the PWA: it appears in the Sheet; Sheet tab "Audit Log" shows `appendItem ok` (no amounts/names in it)
- [ ] Sheet menu "PWA API: DISABLE": the PWA refuses to save ("API disabled"); "enable" brings it back
- [ ] Sheet menu "create / rotate token": the paired PWA is thrown back to the pair screen on its next call; the old token never works again
- [ ] Turn Wi-Fi off, reopen the installed app, unlock: amber "Offline" banner + last data visible, read-only; saving shows "Offline hai"; Wi-Fi on + Reconnect: you can save again
- [ ] Short Wi-Fi drop while working: entry turns amber, "Retry now" appears, saves by itself when back (this part is unchanged from v3.0)
- [ ] After you deploy a new build: the open app shows "Naya version available — Reload" (not forced)
- [ ] localStorage in DevTools (Application tab) shows only `ledger.vault.v1` and `ledger.snapshot.v1`, both unreadable (no token, no names, no amounts)
- [ ] MOBILE (secondary): Android Chrome "Install app" / iPhone "Add to Home Screen" shows the ₹ icon; no zoom when tapping inputs; the Sheet web-app URL on a phone also fits the screen
