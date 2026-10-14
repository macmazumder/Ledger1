// Runs the REAL src/Code.gs on an in-memory fake of SpreadsheetApp / Properties / Cache / Content services.
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto');
module.exports = function makeBackend() {
  const sheets = {}, props = {}, cacheStore = {}; let email = 'me@x.com';
  class Sheet {
    constructor(n) { this.name = n; this.rows = [[]]; this.max = 1000; }
    getLastRow() { let l = 0; this.rows.forEach((r, i) => { if (r && r.some(v => v !== '' && v !== undefined)) l = i + 1; }); return l; }
    getMaxRows() { return this.max; } insertRowsAfter(a, n) { this.max += n; }
    getRange(r, c, nr = 1, nc = 1) { const s = this; return {
      getValues: () => { const o = []; for (let i = 0; i < nr; i++) { const row = s.rows[r - 1 + i] || []; o.push(Array.from({ length: nc }, (_, j) => row[c - 1 + j] === undefined ? '' : row[c - 1 + j])); } return o; },
      getDisplayValues: () => s.getRange(r, c, nr, nc).getValues(),
      setValues: v => { v.forEach((row, i) => { const t = s.rows[r - 1 + i] = s.rows[r - 1 + i] || []; row.forEach((x, j) => t[c - 1 + j] = x); }); },
      setNumberFormats() {}, setNumberFormat() {}, setFontWeight() {},
      clearContent: () => { for (let i = 0; i < nr; i++) { const t = s.rows[r - 1 + i]; if (t) for (let j = 0; j < nc; j++) t[c - 1 + j] = ''; } } }; }
    deleteRow(r) { this.rows.splice(r - 1, 1); } deleteRows(r, n) { this.rows.splice(r - 1, n); } setFrozenRows() {} setColumnWidth() {}
    setName(n) { delete sheets[this.name]; this.name = n; sheets[n] = this; }
  }
  const mkOut = src => ({ src, metas: {}, setTitle() { return this; }, addMetaTag(k, v) { this.metas[k] = v; return this; }, setFaviconUrl() { return this; } });
  const ctx = { console, JSON, String, Array, Object, Error, Math, Date, Number, isFinite,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n], insertSheet: n => sheets[n] = new Sheet(n), getId: () => 'id', getSpreadsheetTimeZone: () => 'Asia/Kolkata' }), getUi: () => ({}) },
    Session: { getActiveUser: () => ({ getEmail: () => email }), getEffectiveUser: () => ({ getEmail: () => 'me@x.com' }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || '', setProperty(k, v) { props[k] = v; } }) },
    LockService: { getDocumentLock: () => ({ waitLock() {}, releaseLock() {} }), getScriptLock: () => null },
    CacheService: { getScriptCache: () => ({ get: k => cacheStore[k] === undefined ? null : cacheStore[k], put: (k, v) => { cacheStore[k] = v; }, remove: k => { delete cacheStore[k]; }, removeAll: ks => ks.forEach(k => delete cacheStore[k]) }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ content: t, setMimeType() { return this; }, getContent() { return this.content; } }) },
    HtmlService: { createHtmlOutput: s => mkOut(s), createHtmlOutputFromFile: f => mkOut('file:' + f) },
    Utilities: { formatDate: d => d.toISOString().slice(0, 10), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (a, v) => Array.from(crypto.createHash('sha256').update(v).digest()).map(b => b > 127 ? b - 256 : b), getUuid: () => crypto.randomUUID() },
    DriveApp: {}, ScriptApp: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../src/Code.gs'), 'utf8'), ctx);
  ctx.createBackup_ = () => {};
  return { ctx, sheets, props, cacheStore, setEmail: e => { email = e; }, rows: k => { const prev = email; email = 'me@x.com'; try { return JSON.parse(ctx.getData(k)); } finally { email = prev; } } }; // assertions read as the owner; the PWA under test has NO login
};
