/**
 * MAZUMDER INFOTECH — LEDGER
 * Google Apps Script backend (bound to a Google Sheet).
 *
 * Storage model (v2):
 *   Every data type gets its OWN real sheet tab with proper column headers —
 *   Wallets, Wallet Transactions, People, People Transactions, Credit Cards,
 *   Card Transactions, Expenses, Daily Income, Monthly Summary, Expense
 *   Categories, Daily Categories. You can open any of these tabs directly in
 *   Sheets and see normal rows/columns — no JSON blobs.
 *
 *   The front-end (Ledger.html) is unchanged: it still calls
 *   getData(key) / setData(key, jsonArrayString) / getAllData() /
 *   setBulkData(pairs) exactly as before. This file just implements those
 *   the same way against real tables instead of a single blob cell.
 */

const APP_TITLE = 'Mazumder Infotech — Ledger';

/**
 * Schema: one entry per data key the client uses.
 * cols: ordered list of {key, label, type} — type is 'text' or 'number' and
 * controls the cell format so Sheets never "helpfully" reinterprets a date
 * string like "2026-09-12" or a time like "14:30" as a Date/Time value.
 * simpleList: true means the value is a flat array of strings (categories),
 * one per row, single column.
 */
const SCHEMA = {
  mf_wallets: {
    sheet: 'Wallets',
    cols: [
      { key:'id', label:'ID', type:'text' },
      { key:'name', label:'Name', type:'text' },
      { key:'openingBalance', label:'Opening Balance', type:'number' },
      { key:'archived', label:'Archived', type:'text' }
    ]
  },
  mf_wallet_tx: {
    sheet: 'Wallet Transactions',
    cols: [
      { key:'id', label:'ID', type:'text' },
      { key:'walletId', label:'Wallet ID', type:'text' },
      { key:'date', label:'Date', type:'text' },
      { key:'type', label:'Type', type:'text' },
      { key:'amount', label:'Amount', type:'number' },
      { key:'note', label:'Note', type:'text' },
      { key:'transferId', label:'Transfer ID', type:'text' }
    ]
  },
  mf_people: {
    sheet: 'People',
    cols: [
      { key:'id', label:'ID', type:'text' },
      { key:'name', label:'Name', type:'text' },
      { key:'archived', label:'Archived', type:'text' }
    ]
  },
  mf_people_tx: {
    sheet: 'People Transactions',
    cols: [
      { key:'id', label:'ID', type:'text' },
      { key:'personId', label:'Person ID', type:'text' },
      { key:'date', label:'Date', type:'text' },
      { key:'type', label:'Type', type:'text' },
      { key:'amount', label:'Amount', type:'number' },
      { key:'walletId', label:'Wallet ID', type:'text' },
      { key:'note', label:'Note', type:'text' }
    ]
  },
  mf_cards: {
    sheet: 'Credit Cards',
    cols: [
      { key:'id', label:'ID', type:'text' },
      { key:'name', label:'Name', type:'text' },
      { key:'archived', label:'Archived', type:'text' }
    ]
  },
  mf_card_tx: {
    sheet: 'Card Transactions',
    cols: [
      { key:'id', label:'ID', type:'text' },
      { key:'cardId', label:'Card ID', type:'text' },
      { key:'type', label:'Type', type:'text' },
      { key:'date', label:'Date', type:'text' },
      { key:'amount', label:'Amount', type:'number' },
      { key:'walletId', label:'Wallet ID', type:'text' },
      { key:'note', label:'Note', type:'text' }
    ]
  },
  mf_expenses: {
    sheet: 'Expenses',
    cols: [
      { key:'id', label:'ID', type:'text' },
      { key:'date', label:'Date', type:'text' },
      { key:'category', label:'Category', type:'text' },
      { key:'amount', label:'Amount', type:'number' },
      { key:'walletId', label:'Wallet ID', type:'text' },
      { key:'note', label:'Note', type:'text' }
    ]
  },
  mf_daily: {
    sheet: 'Daily Income',
    cols: [
      { key:'id', label:'ID', type:'text' },
      { key:'date', label:'Date', type:'text' },
      { key:'time', label:'Time', type:'text' },
      { key:'category', label:'Category', type:'text' },
      { key:'amount', label:'Amount', type:'number' },
      { key:'walletId', label:'Wallet ID', type:'text' },
      { key:'note', label:'Note', type:'text' }
    ]
  },
  mf_monthly: {
    sheet: 'Monthly Manual Base',
    legacySheet: 'Monthly Summary', // old tab name: still found, renamed by Setup / Repair
    cols: [
      { key:'id', label:'ID', type:'text' },
      { key:'year', label:'Year', type:'number' },
      { key:'month', label:'Month', type:'text' },
      { key:'incomeBase', label:'Manual Income Base', type:'number' },
      { key:'expenseBase', label:'Manual Expense Base', type:'number' }
    ]
  },
  mf_exp_categories: {
    sheet: 'Expense Categories',
    cols: [ { key:'category', label:'Category', type:'text' } ],
    simpleList: true
  },
  mf_daily_categories: {
    sheet: 'Daily Categories',
    cols: [ { key:'category', label:'Category', type:'text' } ],
    simpleList: true
  }
};

const LEDGER_VERSION = '5.0';
const BACKUP_FOLDER = 'Mazumder Ledger Backups';
const BACKUP_KEEP = 30;

/* ============================= SECURITY HELPERS (Phase 1) ============================= */

/** Emails allowed to use the ledger. Script Property ALLOWED_EMAILS (comma-separated); empty = owner only. */
function allowedEmails_() {
  const raw = PropertiesService.getScriptProperties().getProperty('ALLOWED_EMAILS') || '';
  const list = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!list.length) list.push(String(Session.getEffectiveUser().getEmail() || '').toLowerCase());
  return list;
}

/** Throws unless the signed-in Google account is on the allow-list. Call first in EVERY public function. */
let API_AUTH_ = false; // true ONLY while doPost serves a request whose token was verified
function assertAllowed_() {
  if (API_AUTH_ === true) return;
  const email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email) throw new Error('Access denied: Google login email detect nahi hua');
  if (allowedEmails_().indexOf(email) === -1) throw new Error('Access denied');
}

/** Runs fn under a lock. Falls back to the script lock if there is no document lock. */
function withLock_(ms, fn) {
  const lock = LockService.getDocumentLock() || LockService.getScriptLock();
  try { lock.waitLock(ms); } catch (e) { throw new Error('Server busy hai, thodi der baad dobara try karo'); }
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ============================= MENU ============================= */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📒 Ledger')
    .addItem('Open Ledger', 'showLedgerDialog')
    .addItem('Open Ledger in Sidebar', 'showLedgerSidebar')
    .addSeparator()
    .addItem('Setup / Repair Data Sheets', 'setupSheetsMenuItem')
    .addItem('Set allowed emails', 'setAllowedEmailsMenuItem')
    .addItem('Backup now', 'backupNowMenuItem')
    .addItem('Install nightly backup', 'installNightlyBackupTrigger')
    .addSeparator()
    .addItem('PWA API: create / rotate token', 'createApiTokenMenuItem')
    .addItem('PWA API: enable', 'enableApiMenuItem')
    .addItem('PWA API: DISABLE (kill switch)', 'disableApiMenuItem')
    .addItem('PWA API: clear lockout', 'clearApiLockoutMenuItem')
    .addItem('PWA API: status', 'apiStatusMenuItem')
    .addToUi();

  // Phase 2: no setup on open (fast). Tabs are created lazily; use the menu to repair.
}

function showLedgerDialog() {
  assertAllowed_();
  const html = HtmlService.createHtmlOutputFromFile('Ledger').setWidth(1240).setHeight(820);
  SpreadsheetApp.getUi().showModalDialog(html, APP_TITLE);
}

function showLedgerSidebar() {
  assertAllowed_();
  const html = HtmlService.createHtmlOutputFromFile('Ledger').setTitle(APP_TITLE);
  SpreadsheetApp.getUi().showSidebar(html);
}

function setupSheetsMenuItem() {
  assertAllowed_();
  setupSheets_();
  const r = repairFormats_();
  SpreadsheetApp.getUi().alert('Ledger sheets ready. Date/time cells repaired: ' + r.fixed + '\n\n' +
    Object.keys(SCHEMA).map(k => '• ' + SCHEMA[k].sheet).join('\n'));
}

function setAllowedEmailsMenuItem() {
  const ui = SpreadsheetApp.getUi();
  const owner = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  const props = PropertiesService.getScriptProperties();
  const r = ui.prompt('Allowed emails',
    'Comma-separated Google emails jinhe Ledger kholne ki ijazat hai.\nKhali chhodo = sirf owner (' + owner + ').\n\nCurrent: ' +
    (props.getProperty('ALLOWED_EMAILS') || '(owner only)'), ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const list = r.getResponseText().split(',').map(s => s.trim().toLowerCase()).filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
  if (list.length && list.indexOf(owner) === -1) list.push(owner);
  props.setProperty('ALLOWED_EMAILS', list.join(','));
  ui.alert('Saved: ' + (list.join(', ') || 'owner only'));
}

/* ================= WEB APP ENTRY POINT ================= */
function doGet(e) {
  try { assertAllowed_(); }
  catch (err) {
    return HtmlService.createHtmlOutput('<h3 style="font-family:sans-serif">Access denied</h3><p style="font-family:sans-serif">Is Google account ko Ledger kholne ki ijazat nahi hai.</p>').setTitle(APP_TITLE);
  }
  // No ALLOWALL: the page cannot be framed by other sites.
  const out = HtmlService.createHtmlOutputFromFile('Ledger')
    .setTitle(APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('theme-color', '#0F172A')
    .addMetaTag('mobile-web-app-capable', 'yes')
    .addMetaTag('apple-mobile-web-app-capable', 'yes')
    .addMetaTag('apple-mobile-web-app-status-bar-style', 'black-translucent')
    .addMetaTag('format-detection', 'telephone=no');
  const icon = PropertiesService.getScriptProperties().getProperty('PWA_ICON_URL'); // https URL of icons/favicon.svg once the PWA is hosted
  if (icon && /^https:\/\//.test(icon)) out.setFaviconUrl(icon);
  return out;
}

/* ============================= SHEET SETUP (lazy, Phase 2) ============================= */
const DEFAULT_EXPENSE_CATEGORIES = ['Tea','Medicine','Shop Rent','Petrol','Bike Maintenance','Printer Ink','Paper','Electricity Bill','Internet Bill','Stationery','Xerox / Printing','Staff Salary','Other'];
const DEFAULT_DAILY_CATEGORIES = ['Train Ticket','Flight Ticket','Bus Ticket','Passport Photo','Lamination','Xerox / Printout','Recharge','Bill Payment Service','Form Filling','Other'];

function ssTz_() { return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(); }
/** Text columns '@' (never parsed as date/formula); number columns 'General' (shows exactly what is stored, no "100."). */
function formatFor_(c) { return c.type === 'number' ? 'General' : '@'; }
function formatsFor_(cfg, nrows) {
  const row = cfg.cols.map(formatFor_), out = [];
  for (let i = 0; i < nrows; i++) out.push(row);
  return out;
}

/** Creates every tab (and seeds default categories). Menu-only now; NOT run on open. */
function setupSheets_() {
  Object.keys(SCHEMA).forEach(key => _ensureSheet(key));
  ensureDefaultCategories_();
}

function _ensureSheet(key) {
  const cfg = cfgFor_(key);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(cfg.sheet);
  if (!sheet && cfg.legacySheet) { const old = ss.getSheetByName(cfg.legacySheet); if (old) { old.setName(cfg.sheet); sheet = old; } }
  if (!sheet) sheet = ss.insertSheet(cfg.sheet);
  applyLayout_(sheet, cfg);
  return sheet;
}

/** Header, frozen row, fixed widths and whole-column formats (no autoResize: it is slow). */
function applyLayout_(sheet, cfg) {
  const n = cfg.cols.length;
  sheet.getRange(1, 1, 1, n).setValues([cfg.cols.map(c => c.label)]);
  sheet.getRange(1, 1, 1, n).setFontWeight('bold');
  sheet.setFrozenRows(1);
  const rows = Math.max(1, sheet.getMaxRows() - 1);
  cfg.cols.forEach((c, i) => {
    sheet.getRange(2, i + 1, rows, 1).setNumberFormat(formatFor_(c));
    sheet.setColumnWidth(i + 1, c.key === 'id' ? 120 : c.type === 'number' ? 100 : 140);
  });
}

function findSheet_(cfg) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(cfg.sheet) || (cfg.legacySheet ? ss.getSheetByName(cfg.legacySheet) : null);
}
function _sheetFor(key) {
  const cfg = cfgFor_(key);
  const sheet = findSheet_(cfg);
  return sheet || _ensureSheet(key); // lazy: only creates a tab that is missing
}

/** Seeds default categories on the SERVER whenever a category tab is empty. */
function ensureDefaultCategories_() {
  const pairs = [['mf_exp_categories', DEFAULT_EXPENSE_CATEGORIES], ['mf_daily_categories', DEFAULT_DAILY_CATEGORIES]];
  const need = pairs.filter(p => _rowsToArray(_sheetFor(p[0]), SCHEMA[p[0]]).length === 0);
  if (!need.length) return;
  withLock_(15000, () => { need.forEach(p => {
    const cfg = SCHEMA[p[0]], sheet = _sheetFor(p[0]);
    if (_rowsToArray(sheet, cfg).length === 0) appendRows_(sheet, p[1].map(v => [v]), cfg);
  }); bumpVersion_(); });
}

/* ============================= ROW <-> OBJECT HELPERS ============================= */

/** Converts one raw cell to the client's value. Dates/time that Sheets auto-converted are turned back into text. */
function normalizeCell_(v, c, tz, disp) {
  if (v === '' || v === undefined || v === null) return null;
  if (v instanceof Date) {
    if (c.key === 'time') { // time-only cells carry a 1899 date: read the DISPLAYED text instead of converting
      const m = String(disp()).match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?/);
      if (!m) return null;
      let h = Number(m[1]); const ap = (m[3] || '').toLowerCase();
      if (ap === 'pm' && h < 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
      return ('0' + h).slice(-2) + ':' + m[2];
    }
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd'); // spreadsheet timezone, not script timezone
  }
  if (c.type === 'text' && typeof v !== 'string') return String(v);
  return v;
}

function _rowsToArray(sheet, cfg) {
  const last = sheet.getLastRow(), n = cfg.cols.length;
  if (last < 2) return [];
  const range = sheet.getRange(2, 1, last - 1, n);
  const values = range.getValues();
  const tz = ssTz_();
  let display = null;
  const out = [];
  values.forEach((row, ri) => {
    if (cfg.simpleList) { const v = row[0]; if (v !== '' && v !== null && v !== undefined) out.push(String(v)); return; }
    if (row.every(v => v === '' || v === null || v === undefined)) return; // skip blank rows
    const obj = {};
    cfg.cols.forEach((c, i) => {
      obj[c.key] = normalizeCell_(row[i], c, tz, () => { if (!display) display = range.getDisplayValues(); return display[ri][i]; });
    });
    out.push(obj);
  });
  return out;
}

function _idColIndex(cfg) { return cfg.cols.findIndex(c => c.key === 'id'); }

/** Validates + converts one item to a sheet row. Numbers must be finite; text is capped. */
function itemToRow_(cfg, item) {
  return cfg.cols.map(c => {
    const v = item[c.key];
    if (v === undefined || v === null || v === '') return '';
    if (c.type === 'number') {
      const n = Number(v);
      if (!isFinite(n)) throw new Error(c.label + ' number hona chahiye');
      return n;
    }
    const s = typeof v === 'string' ? v : String(v);
    if (s.length > 2000) throw new Error(c.label + ' bahut lamba hai');
    if (c.key === 'date' && !isValidIsoDate_(s)) throw new Error('Date galat hai: ' + s);
    if (c.key === 'time' && !isValidTime_(s)) throw new Error('Time galat hai: ' + s);
    return s;
  });
}
function _arrayToRows(arr, cfg) {
  if (!arr || !arr.length) return [];
  if (cfg.simpleList) return arr.map(v => [String(v)]);
  return arr.map(it => { if (!it || typeof it !== 'object') throw new Error('Bad row in data'); return itemToRow_(cfg, it); });
}

/** The ONE place values are written: grows the grid, sets formats FIRST, then values. */
function writeRows_(sheet, startRow, rows, cfg) {
  if (!rows.length) return;
  const need = startRow + rows.length - 1;
  if (sheet.getMaxRows() < need) sheet.insertRowsAfter(sheet.getMaxRows(), Math.max(need - sheet.getMaxRows(), 500));
  const range = sheet.getRange(startRow, 1, rows.length, cfg.cols.length);
  range.setNumberFormats(formatsFor_(cfg, rows.length)); // before values: Sheets must never parse them
  range.setValues(rows);
}
function appendRows_(sheet, rows, cfg) { writeRows_(sheet, sheet.getLastRow() + 1, rows, cfg); }

/* ============================= INPUT HELPERS ============================= */
/* ============================= VALIDATION + VERSION (Phase 3) ============================= */
const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,40}$/; // blocks <, >, quotes, spaces: ids are inserted into the page
function assertSafeId_(id) { if (typeof id !== 'string' || !SAFE_ID_RE.test(id)) throw new Error('Invalid id'); }
function isValidIsoDate_(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}
function isValidTime_(s) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }

/** Data version: bumped (inside the lock) by every real write; clients poll it to auto-refresh. */
function curVersion_() { return Number(PropertiesService.getScriptProperties().getProperty('DATA_VERSION')) || 0; }
function bumpVersion_() { const v = curVersion_() + 1; PropertiesService.getScriptProperties().setProperty('DATA_VERSION', String(v)); return v; }
function getDataVersion() { assertAllowed_(); return curVersion_(); }

function cfgFor_(key) {
  const cfg = SCHEMA[key];
  if (!cfg) throw new Error('Unknown data key: ' + key);
  return cfg;
}
function parseJson_(json, what) {
  try { return JSON.parse(json); } catch (e) { throw new Error('Invalid JSON for ' + what); }
}
function parseItem_(cfg, json) {
  const item = parseJson_(json, 'item');
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Item must be an object');
  if (_idColIndex(cfg) !== -1) { if (typeof item.id !== 'string' || !item.id) throw new Error('Item id missing'); assertSafeId_(item.id); }
  return item;
}
function existingIds_(sheet, cfg) {
  const idx = _idColIndex(cfg), last = sheet.getLastRow(), set = {};
  if (idx === -1 || last < 2) return set;
  sheet.getRange(2, idx + 1, last - 1, 1).getValues().forEach(r => { if (r[0] !== '') set[String(r[0])] = true; });
  return set;
}
function findRowById_(sheet, cfg, id) {
  const idx = _idColIndex(cfg), last = sheet.getLastRow();
  if (idx === -1 || last < 2) return -1;
  const ids = sheet.getRange(2, idx + 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}
function deleteRowsWhere_(sheet, colIdx, value) {
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  const vals = sheet.getRange(2, colIdx + 1, last - 1, 1).getValues();
  let n = 0;
  for (let i = vals.length - 1; i >= 0; i--) if (String(vals[i][0]) === String(value)) { sheet.deleteRow(i + 2); n++; }
  return n;
}

/** Writes first, trims leftovers after. Refuses to blank a non-empty tab unless force. */
function _writeKey(key, jsonValue, force) {
  const cfg = cfgFor_(key);
  const arr = jsonValue ? parseJson_(jsonValue, key) : [];
  if (!Array.isArray(arr)) throw new Error('Expected an array for ' + key);
  const sheet = _sheetFor(key);
  const existing = Math.max(0, sheet.getLastRow() - 1);
  if (arr.length === 0 && existing > 0 && force !== true) throw new Error('Refusing to replace existing ' + key + ' data with an empty list');
  const rows = _arrayToRows(arr, cfg);
  writeRows_(sheet, 2, rows, cfg);
  if (existing > rows.length) sheet.getRange(rows.length + 2, 1, existing - rows.length, cfg.cols.length).clearContent();
}

/* ============================= READ API ============================= */
function getVersion() { assertAllowed_(); return LEDGER_VERSION; }

function getData(key) {
  assertAllowed_();
  const cfg = SCHEMA[key];
  if (!cfg) return null;
  return JSON.stringify(_rowsToArray(_sheetFor(key), cfg));
}

function getAllData() {
  assertAllowed_();
  ensureDefaultCategories_();
  const out = { __version: String(curVersion_()) }; // read BEFORE the data: a write in between just triggers one more refresh
  Object.keys(SCHEMA).forEach(key => { out[key] = JSON.stringify(_rowsToArray(_sheetFor(key), SCHEMA[key])); });
  return out;
}

/* ============================= WRITE API — every function returns {ok, ...} ============================= */

/** DEPRECATED for the client (whole-table overwrite). Refuses empty overwrite unless force===true. */
function setData(key, jsonValue, force) {
  assertAllowed_();
  cfgFor_(key);
  return withLock_(15000, () => { _writeKey(key, jsonValue, force); return { ok: true, v: bumpVersion_() }; });
}

/** Excel import: needs confirmReplace:true, backs up first, aborts if the backup fails. */
function setBulkData(pairs, opts) {
  assertAllowed_();
  if (!opts || opts.confirmReplace !== true) throw new Error('setBulkData needs confirmReplace:true');
  if (!pairs || typeof pairs !== 'object' || Array.isArray(pairs)) throw new Error('Bad import payload');
  const keys = Object.keys(pairs);
  keys.forEach(k => cfgFor_(k));
  return withLock_(40000, () => {
    try { createBackup_('before-import'); }
    catch (e) { throw new Error('Backup nahi ban paya, isliye import roka gaya: ' + (e && e.message || e)); }
    keys.forEach(k => _writeKey(k, pairs[k], false));
    return { ok: true, v: bumpVersion_() };
  });
}

/** Idempotent: an id that already exists is NOT written again (safe retries). */
function appendItem(key, itemJson) {
  assertAllowed_();
  const cfg = cfgFor_(key);
  const item = parseItem_(cfg, itemJson);
  const row = itemToRow_(cfg, item);
  return withLock_(15000, () => {
    const sheet = _sheetFor(key);
    if (existingIds_(sheet, cfg)[item.id]) return { ok: true, duplicate: true, v: curVersion_() };
    appendRows_(sheet, [row], cfg);
    return { ok: true, duplicate: false, v: bumpVersion_() };
  });
}

/** Atomic + idempotent: all new rows in one write; already-existing ids are skipped. */
function appendItems(key, itemsJson) {
  assertAllowed_();
  const cfg = cfgFor_(key);
  const items = parseJson_(itemsJson, 'items');
  if (!Array.isArray(items) || !items.length || items.length > 500) throw new Error('items must be a list of 1-500 objects');
  const pairs = items.map(it => { const s = JSON.stringify(it); return { id: parseItem_(cfg, s).id, row: itemToRow_(cfg, JSON.parse(s)) }; });
  return withLock_(15000, () => {
    const sheet = _sheetFor(key), have = existingIds_(sheet, cfg);
    const fresh = pairs.filter(p => !have[p.id]);
    if (!fresh.length) return { ok: true, duplicate: true, added: 0, v: curVersion_() };
    appendRows_(sheet, fresh.map(p => p.row), cfg);
    return { ok: true, duplicate: false, added: fresh.length, v: bumpVersion_() };
  });
}

function updateItem(key, id, itemJson) {
  assertAllowed_(); assertSafeId_(id);
  const cfg = cfgFor_(key);
  const row = itemToRow_(cfg, parseItem_(cfg, itemJson));
  return withLock_(15000, () => {
    const sheet = _sheetFor(key), r = findRowById_(sheet, cfg, id);
    if (r === -1) return { ok: false, reason: 'not_found' };
    writeRows_(sheet, r, [row], cfg);
    return { ok: true, v: bumpVersion_() };
  });
}

function upsertItem(key, id, itemJson) {
  assertAllowed_(); assertSafeId_(id);
  const cfg = cfgFor_(key);
  const row = itemToRow_(cfg, parseItem_(cfg, itemJson));
  return withLock_(15000, () => {
    const sheet = _sheetFor(key), r = findRowById_(sheet, cfg, id);
    if (r === -1) { appendRows_(sheet, [row], cfg); return { ok: true, action: 'added', v: bumpVersion_() }; }
    writeRows_(sheet, r, [row], cfg);
    return { ok: true, action: 'updated', v: bumpVersion_() };
  });
}

function deleteItem(key, id) {
  assertAllowed_(); assertSafeId_(id);
  const cfg = cfgFor_(key);
  return withLock_(15000, () => {
    const sheet = _sheetFor(key), r = findRowById_(sheet, cfg, id);
    if (r === -1) return { ok: false, reason: 'not_found' };
    sheet.deleteRow(r);
    return { ok: true, v: bumpVersion_() };
  });
}

function deleteByField(key, field, value) {
  assertAllowed_();
  const cfg = cfgFor_(key);
  const col = cfg.cols.findIndex(c => c.key === field);
  if (col === -1) throw new Error('Unknown field: ' + field);
  if (value === undefined || value === null || value === '') throw new Error('Empty value');
  return withLock_(15000, () => { const count = deleteRowsWhere_(_sheetFor(key), col, value); return { ok: true, count: count, v: count ? bumpVersion_() : curVersion_() }; });
}

function addCategory(key, name) {
  assertAllowed_();
  const cfg = cfgFor_(key);
  if (!cfg.simpleList) throw new Error('Not a category list: ' + key);
  const v = String(name === undefined || name === null ? '' : name).trim();
  if (!v || v.length > 60) throw new Error('Category name 1-60 characters ka hona chahiye');
  return withLock_(15000, () => {
    const sheet = _sheetFor(key);
    if (_rowsToArray(sheet, cfg).some(s => s.toLowerCase() === v.toLowerCase())) return { ok: true, added: false, v: curVersion_() };
    appendRows_(sheet, [[v]], cfg);
    return { ok: true, added: true, v: bumpVersion_() };
  });
}

/** Removes one category from the dropdown list. Existing entries keep their category text. */
function deleteCategory(key, name) {
  assertAllowed_();
  const cfg = cfgFor_(key);
  if (!cfg.simpleList) throw new Error('Not a category list: ' + key);
  const v = String(name === undefined || name === null ? '' : name).trim().toLowerCase();
  if (!v) throw new Error('Category name missing');
  return withLock_(15000, () => {
    const sheet = _sheetFor(key), list = _rowsToArray(sheet, cfg);
    const keep = list.filter(s => s.toLowerCase() !== v);
    if (keep.length === list.length) return { ok: false, reason: 'not_found' };
    if (!keep.length) return { ok: false, reason: 'last_category' };
    _writeKey(key, JSON.stringify(keep), false);
    return { ok: true, removed: list.length - keep.length, v: bumpVersion_() };
  });
}

function deleteWalletCascade(walletId) {
  assertAllowed_();
  assertSafeId_(walletId);
  return withLock_(20000, () => {
    const wallet = deleteRowsWhere_(_sheetFor('mf_wallets'), _idColIndex(SCHEMA.mf_wallets), walletId);
    const tx = deleteRowsWhere_(_sheetFor('mf_wallet_tx'), SCHEMA.mf_wallet_tx.cols.findIndex(c => c.key === 'walletId'), walletId);
    return { ok: true, wallet: wallet, tx: tx, v: bumpVersion_() };
  });
}

/* ============================= REPAIR + TEST HELPERS ============================= */

/** Re-applies layout/formats on every tab and converts any auto-parsed Date cells back to text. Safe to re-run. */
function repairFormats_() {
  const tz = ssTz_();
  return withLock_(60000, () => {
    let fixed = 0;
    Object.keys(SCHEMA).forEach(key => {
      const cfg = SCHEMA[key];
      if (cfg.legacySheet) _ensureSheet(key); // renames the old tab name first
      const sheet = _sheetFor(key), last = sheet.getLastRow();
      let out = null, range = null;
      if (last >= 2) {
        range = sheet.getRange(2, 1, last - 1, cfg.cols.length);
        const vals = range.getValues();
        const hasDate = vals.some(r => r.some(v => v instanceof Date));
        const disp = hasDate ? range.getDisplayValues() : null; // read BEFORE formats change
        out = vals.map((row, ri) => row.map((v, i) => {
          const c = cfg.cols[i];
          if (v instanceof Date) { fixed++; const r = normalizeCell_(v, c, tz, () => disp[ri][i]); return r === null ? '' : r; }
          if (c.type === 'text' && typeof v === 'number') { fixed++; return String(v); }
          return v;
        }));
      }
      applyLayout_(sheet, cfg);
      if (out && fixed) { range.setNumberFormats(formatsFor_(cfg, last - 1)); range.setValues(out); }
    });
    if (fixed) bumpVersion_();
    return { ok: true, fixed: fixed };
  });
}

function assertTestSeedAllowed_() {
  if (PropertiesService.getScriptProperties().getProperty('ALLOW_TEST_SEED') !== 'true')
    throw new Error('Pehle Script Property ALLOW_TEST_SEED=true set karo (sirf Sheet ki COPY par!)');
}
/** Adds n fake Daily Income rows (note "__TEST__"). Run from the editor on a COPY only. */
function seedTestRows_(n) {
  assertTestSeedAllowed_();
  n = Math.min(Math.max(Number(n) || 0, 1), 20000);
  return withLock_(60000, () => {
    const cfg = SCHEMA.mf_daily, sheet = _sheetFor('mf_daily'), tz = ssTz_();
    for (let s = 0; s < n; s += 1000) {
      const rows = [];
      for (let i = s; i < Math.min(n, s + 1000); i++) {
        rows.push(itemToRow_(cfg, { id: 'tst' + i.toString(36) + 'x', date: Utilities.formatDate(new Date(2026, 0, 1 + (i % 270)), tz, 'yyyy-MM-dd'),
          time: ('0' + (8 + i % 12)).slice(-2) + ':' + ('0' + (i % 60)).slice(-2), category: DEFAULT_DAILY_CATEGORIES[i % DEFAULT_DAILY_CATEGORIES.length],
          amount: 10 + (i % 50) * 5, walletId: '', note: '__TEST__' }));
      }
      appendRows_(sheet, rows, cfg);
    }
    return { ok: true, added: n, v: bumpVersion_() };
  });
}
function clearTestRows_() {
  assertTestSeedAllowed_();
  return withLock_(60000, () => {
    const cfg = SCHEMA.mf_daily, sheet = _sheetFor('mf_daily');
    const keep = _rowsToArray(sheet, cfg).filter(r => r.note !== '__TEST__');
    _writeKey('mf_daily', JSON.stringify(keep), true);
    return { ok: true, kept: keep.length, v: bumpVersion_() };
  });
}

/* ============================= PWA API (Phase 5): doPost, token-secured ============================= */
// Needs a SEPARATE deployment: Execute as "Me", Who has access "Anyone". The browser app sends
// {t: token, a: action, args: [...]} as text/plain. The API starts DISABLED until you create a token.
const API_RATE_PER_MIN = 120;
const API_FAIL_LIMIT = 10;
const API_LOCK_SECONDS = 600;
const API_MAX_BODY = 1000000;
const API_READS = { getAllData: 1, getDataVersion: 1, getVersion: 1 };

/** The ONLY functions the API can call. setBulkData / setData / seed / repair / backup are deliberately NOT here. */
function apiHandlers_() {
  return { getAllData: getAllData, getDataVersion: getDataVersion, getVersion: getVersion,
    appendItem: appendItem, appendItems: appendItems, updateItem: updateItem, upsertItem: upsertItem, deleteItem: deleteItem,
    deleteByField: deleteByField, addCategory: addCategory, deleteCategory: deleteCategory, deleteWalletCascade: deleteWalletCascade };
}
function sha256Hex_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}
function safeEqual_(a, b) { // constant-time string compare
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function apiJson_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

/** Stores only the HASH of the token and switches the API on. */
function setApiToken_(token) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('Token too short');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('API_TOKEN_HASH', sha256Hex_(token));
  props.setProperty('API_ENABLED', 'true');
  CacheService.getScriptCache().removeAll(['api_locked', 'api_fail']);
}

function doPost(e) {
  let action = '', detail = '', ok = false;
  try {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('API_ENABLED') !== 'true') return apiJson_({ ok: false, error: 'API disabled' });
    const cache = CacheService.getScriptCache();
    if (cache.get('api_locked')) return apiJson_({ ok: false, error: 'Too many failed attempts. Try again later.' });
    const raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string' || !raw || raw.length > API_MAX_BODY) return apiJson_({ ok: false, error: 'Bad request' });
    let req;
    try { req = JSON.parse(raw); } catch (x) { return apiJson_({ ok: false, error: 'Bad request' }); }
    if (!req || typeof req !== 'object') return apiJson_({ ok: false, error: 'Bad request' });

    const bucket = 'api_rate_' + Math.floor(Date.now() / 60000);
    const n = (Number(cache.get(bucket)) || 0) + 1;
    cache.put(bucket, String(n), 120);
    if (n > API_RATE_PER_MIN) return apiJson_({ ok: false, error: 'Rate limit: thodi der baad try karo' });

    const stored = props.getProperty('API_TOKEN_HASH') || '';
    if (!stored || !safeEqual_(sha256Hex_(String(req.t || '')), stored)) {
      const f = (Number(cache.get('api_fail')) || 0) + 1;
      cache.put('api_fail', String(f), API_LOCK_SECONDS);
      if (f >= API_FAIL_LIMIT) cache.put('api_locked', '1', API_LOCK_SECONDS);
      action = '(auth)'; detail = 'unauthorized';
      return apiJson_({ ok: false, error: 'Unauthorized' });
    }

    const handlers = apiHandlers_();
    action = String(req.a || '').slice(0, 40);
    if (!Object.prototype.hasOwnProperty.call(handlers, action)) { detail = 'unknown action'; return apiJson_({ ok: false, error: 'Unknown action' }); }
    const args = Array.isArray(req.args) ? req.args : [];
    if (args.length > 4) throw new Error('Too many arguments');
    API_AUTH_ = true;
    const result = handlers[action].apply(null, args);
    ok = true;
    return apiJson_({ ok: true, result: result === undefined ? null : result });
  } catch (err) {
    detail = String(err && err.message || err).slice(0, 200);
    return apiJson_({ ok: false, error: detail });
  } finally {
    API_AUTH_ = false;
    if (action && (!API_READS[action] || !ok)) auditLog_(action, ok, detail); // log writes + every failure; never reads/polls
  }
}

/** Appends to the "Audit Log" tab (kept to ~2000 rows). Never throws. Contains no ledger data. */
function auditLog_(action, ok, detail) {
  try {
    withLock_(5000, () => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sh = ss.getSheetByName('Audit Log');
      if (!sh) { sh = ss.insertSheet('Audit Log'); sh.getRange(1, 1, 1, 4).setValues([['Time', 'Action', 'Result', 'Detail']]); sh.setFrozenRows(1); }
      if (sh.getLastRow() > 2500) sh.deleteRows(2, 500);
      const r = sh.getLastRow() + 1;
      if (sh.getMaxRows() < r) sh.insertRowsAfter(sh.getMaxRows(), 100);
      const range = sh.getRange(r, 1, 1, 4);
      range.setNumberFormats([['@', '@', '@', '@']]);
      range.setValues([[new Date().toISOString(), String(action), ok ? 'ok' : 'FAIL', String(detail || '')]]);
    });
  } catch (e) { console.error('auditLog_ failed', e); }
}

function createApiTokenMenuItem() {
  const ui = SpreadsheetApp.getUi();
  const go = ui.alert('PWA API token', 'Naya token banane se purana token TURANT band ho jayega (har paired device ko dobara pair karna padega). Aage badhein?', ui.ButtonSet.OK_CANCEL);
  if (go !== ui.Button.OK) return;
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  setApiToken_(token);
  ui.alert('Naya API token — sirf ek baar dikhega, abhi copy karo:\n\n' + token + '\n\nPWA ke Pair screen par Web App URL ("Anyone" wali deployment) aur yeh token daalo.');
}
function enableApiMenuItem() {
  if (!PropertiesService.getScriptProperties().getProperty('API_TOKEN_HASH')) { SpreadsheetApp.getUi().alert('Pehle "PWA API: create / rotate token" chalao.'); return; }
  PropertiesService.getScriptProperties().setProperty('API_ENABLED', 'true');
  SpreadsheetApp.getUi().alert('PWA API ON.');
}
function disableApiMenuItem() {
  PropertiesService.getScriptProperties().setProperty('API_ENABLED', 'false');
  SpreadsheetApp.getUi().alert('PWA API OFF. Koi bhi PWA ab data nahi padh/likh sakta.');
}
function clearApiLockoutMenuItem() {
  CacheService.getScriptCache().removeAll(['api_locked', 'api_fail']);
  SpreadsheetApp.getUi().alert('API lockout hata diya.');
}
function apiStatusMenuItem() {
  const p = PropertiesService.getScriptProperties();
  SpreadsheetApp.getUi().alert('PWA API: ' + (p.getProperty('API_ENABLED') === 'true' ? 'ON' : 'OFF') + '\nToken set: ' + (p.getProperty('API_TOKEN_HASH') ? 'haan' : 'nahi') +
    '\nLocked out: ' + (CacheService.getScriptCache().get('api_locked') ? 'haan' : 'nahi') + '\nVersion: ' + LEDGER_VERSION + '\n\nAudit Log tab me writes + failures dikhte hain.');
}

/* ============================= BACKUPS ============================= */
function createBackup_(reason) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const it = DriveApp.getFoldersByName(BACKUP_FOLDER);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_FOLDER);
  const stamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd-HHmm');
  DriveApp.getFileById(ss.getId()).makeCopy('Ledger-' + stamp + '-' + reason, folder);
  const files = [], fi = folder.getFiles();
  while (fi.hasNext()) { const f = fi.next(); if (f.getName().indexOf('Ledger-') === 0) files.push(f); }
  files.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  files.slice(BACKUP_KEEP).forEach(f => f.setTrashed(true));
}

function nightlyBackup_() { createBackup_('nightly'); }

function backupNowMenuItem() {
  createBackup_('manual');
  SpreadsheetApp.getUi().alert('Backup ban gaya: Drive > "' + BACKUP_FOLDER + '" (last ' + BACKUP_KEEP + ' rakhe jate hain).');
}

/** Idempotent: removes any existing nightlyBackup_ trigger, then creates exactly one (around 2 AM). */
function installNightlyBackupTrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'nightlyBackup_').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('nightlyBackup_').timeBased().everyDays(1).atHour(2).create();
  SpreadsheetApp.getUi().alert('Nightly backup set: roz raat ~2 baje.');
}
