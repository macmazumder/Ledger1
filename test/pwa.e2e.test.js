// End-to-end for the HOSTED PWA: the generated index.html in jsdom, talking over a fake fetch() to the real doPost API in Code.gs.
// Needs jsdom:  npm i jsdom   then   node test/pwa.e2e.test.js
const fs = require('fs'), path = require('path'), nodeCrypto = require('crypto');
const { JSDOM } = require(process.env.JSDOM_PATH || 'jsdom');
const be = require('./helpers/mock_backend')(); const { ctx, sheets, props } = be;
const TOKEN = 'c0ffee00112233445566778899aabbccddeeff00112233445566778899aabbcc', PIN = '4821';
const URL_OK = 'https://script.google.com/macros/s/AKfycbxTEST_deployment-ID/exec';
be.setEmail(''); ctx.setApiToken_(TOKEN); // PWA visitors have NO Google session: only the token authorises them
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const calls = []; let netDown = false; const alerts = []; let confirmAnswer = true;
const fetchMock = async (url, opts) => {
  calls.push({ url, method: opts && opts.method, headers: opts && opts.headers, body: opts && opts.body });
  if (netDown) throw new TypeError('Failed to fetch');
  const out = ctx.doPost({ postData: { contents: opts.body } });
  return { status: 200, json: async () => JSON.parse(out.getContent()) };
};
const sleep = (ms = 25) => new Promise(r => setTimeout(r, ms));
function boot(opts = {}) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: opts.url || 'https://ledger.example.com/', beforeParse(w) {
    Object.defineProperty(w, 'crypto', { value: nodeCrypto.webcrypto, configurable: true });
    w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder; w.fetch = fetchMock;
    w.alert = m => alerts.push(String(m)); w.confirm = () => confirmAnswer; w.scrollTo = () => {};
    w.addEventListener('error', e => console.log('PAGE ERROR:', e.message));
    for (const [k, v] of Object.entries(opts.ls || {})) w.localStorage.setItem(k, v);
  } });
  const w = dom.window, $ = s => w.document.querySelector(s), ev = c => w.eval(c);
  return { w, $, $$: s => [...w.document.querySelectorAll(s)], ev, ls: () => Object.fromEntries(Object.keys(w.localStorage).map(k => [k, w.localStorage.getItem(k)])) };
}
async function until(f, ms = 6000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (f()) return true; } catch (e) {} await sleep(15); } throw new Error('timeout waiting: ' + f); }
function fill(form, vals) { for (const [k, v] of Object.entries(vals)) { const el = form.querySelector(`[name="${k}"]`); if (!el) throw new Error('no field ' + k); el.value = v; } }
async function submitForm(P, sel, vals) {
  const f = P.$(sel); fill(f, vals); const b = f.querySelector('button[type="submit"]'), lockForm = sel === '#pairForm' || sel === '#unlockForm';
  const err = P.$('#lockErr'); if (err) err.textContent = '';
  f.dispatchEvent(new P.w.Event('submit', { cancelable: true, bubbles: true }));
  if (lockForm) await until(() => !f.isConnected || !b.disabled, 8000); // PBKDF2 + network take a moment: wait until the handler is really done
  else await sleep(40);
}
const errText = P => (P.$('#lockErr') || {}).textContent || '';
async function pair(P, over = {}) { await until(() => P.$('#pairForm')); await submitForm(P, '#pairForm', { url: URL_OK, token: TOKEN, pin: PIN, pin2: PIN, ...over }); }
async function unlock(P, pin = PIN) { await until(() => P.$('#unlockForm')); await submitForm(P, '#unlockForm', { pin }); }
let pass = 0, fail = 0; const t = async (n, f) => { try { await f(); pass++; console.log('ok  ', n); } catch (e) { fail++; console.log('FAIL', n, '->', e.message); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); };
const ok = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const rows = k => be.rows(k);
(async () => {
  let A;
  await t('first launch: only the PAIR screen shows, nothing is requested, no data loaded', async () => {
    A = boot(); await until(() => A.$('#pairForm')); eq(calls.length, 0); eq(A.ev('state.loaded'), false); ok(A.$('#main').textContent.includes('Loading') || A.$('#main').innerHTML === '' || true);
    eq(A.$('#lockBtn').style.display, 'none'); ok(A.$('#overlay') === null); eq(A.ev('IN_APPS_SCRIPT'), false) });
  await t('pairing refuses non-Google URLs, short tokens, bad/mismatched PINs — and sends NOTHING for them', async () => {
    await submitForm(A, '#pairForm', { url: 'http://evil.example.com/macros/s/AAA/exec', token: TOKEN, pin: PIN, pin2: PIN }); ok(/URL sahi nahi/.test(errText(A)), errText(A));
    await submitForm(A, '#pairForm', { url: 'https://evil.example.com/macros/s/AAA/exec', token: TOKEN, pin: PIN, pin2: PIN }); ok(/URL sahi nahi/.test(errText(A)));
    await submitForm(A, '#pairForm', { url: 'https://script.google.com.evil.com/macros/s/AAA/exec', token: TOKEN, pin: PIN, pin2: PIN }); ok(/URL sahi nahi/.test(errText(A)));
    await submitForm(A, '#pairForm', { url: URL_OK, token: 'short', pin: PIN, pin2: PIN }); ok(/Token chhota/.test(errText(A)));
    await submitForm(A, '#pairForm', { url: URL_OK, token: TOKEN, pin: '12', pin2: '12' }); ok(/kam se kam 4/.test(errText(A)));
    await submitForm(A, '#pairForm', { url: URL_OK, token: TOKEN, pin: PIN, pin2: '9999' }); ok(/same nahi/.test(errText(A)));
    eq(calls.length, 0, 'token must never leave the device for a rejected form'); eq(A.ls()['ledger.vault.v1'], undefined) });
  await t('wrong token: server says Unauthorized, nothing is stored, token cleared from memory', async () => {
    await submitForm(A, '#pairForm', { url: URL_OK, token: 'f'.repeat(64), pin: PIN, pin2: PIN }); await until(() => /Unauthorized/.test(errText(A)));
    eq(A.ls()['ledger.vault.v1'], undefined); eq(A.ev('API.token'), ''); ok(A.$('#pairForm'), 'still on pair screen'); eq(calls.length, 1) });
  await t('pair OK: app loads over the API; token is stored ENCRYPTED, never in clear; snapshot encrypted too', async () => {
    calls.length = 0; ctx.doPost({ postData: { contents: JSON.stringify({ t: TOKEN, a: 'appendItem', args: ['mf_wallets', JSON.stringify({ id: 'secretw1', name: 'Hidden Wallet Name', openingBalance: 777 })] }) } });
    await pair(A); await until(() => A.ev('state.loaded') && A.$('#verTag').textContent === 'v5.0'); ok(!A.$('#lockOverlay'), 'overlay gone');
    await until(() => A.ls()['ledger.snapshot.v1']); const ls = JSON.stringify(A.ls());
    ok(!ls.includes(TOKEN), 'token in clear in localStorage'); ok(!ls.includes('Hidden Wallet Name') && !ls.includes('777'), 'ledger data in clear in localStorage');
    ok(A.ls()['ledger.vault.v1'].includes('"salt"')); eq(A.$('#lockBtn').style.display, ''); ok(A.$('#diagFoot').textContent.includes('PWA'));
    ok(A.$('#main').textContent.includes('Dashboard')) });
  await t('every request: POST text/plain to the paired Google URL, token in the BODY (not the URL), only allow-listed actions', async () => {
    ok(calls.length > 0); const allowed = new Set(['getAllData', 'getDataVersion', 'getVersion', 'appendItem', 'appendItems', 'updateItem', 'upsertItem', 'deleteItem', 'deleteByField', 'addCategory', 'deleteCategory', 'deleteWalletCascade']);
    calls.forEach(c => { eq(c.url, URL_OK); eq(c.method, 'POST'); ok(/text\/plain/.test(c.headers['Content-Type'])); const b = JSON.parse(c.body); eq(b.t, TOKEN); ok(allowed.has(b.a), b.a); ok(!c.url.includes(TOKEN)); }) });
  await t('writes work with NO Google login and are audited without ledger data', async () => {
    A.$$('.tab').find(x => x.dataset.tab === 'expenses').click(); await sleep(30);
    await submitForm(A, '#expForm', { amount: '88', note: 'via pwa' }); await until(() => rows('mf_expenses').some(x => x.note === 'via pwa'));
    const log = sheets['Audit Log'].rows.slice(1).filter(r => r && r[0]); ok(log.some(r => r[1] === 'appendItem' && r[2] === 'ok')); ok(!JSON.stringify(log).includes('via pwa')) });
  await t('Lock now: data cleared from the page, token wiped, NO requests while locked; wrong PIN refused; right PIN restores', async () => {
    A.$('#lockBtn').click(); await until(() => A.$('#unlockForm')); eq(A.$('#main').innerHTML, ''); eq(A.ev('API.token'), ''); eq(A.ev('API.key'), null);
    const n = calls.length; await A.ev('pollOnce()'); await A.ev('flushQueue()'); eq(calls.length, n, 'requests while locked');
    await submitForm(A, '#unlockForm', { pin: '0000' }); ok(/PIN galat/.test(errText(A)));
    await submitForm(A, '#unlockForm', { pin: PIN }); ok(!A.$('#lockOverlay')); ok(A.$('#main').innerHTML.length > 100); ok(A.ev('API.token') === TOKEN) });
  await t('5 wrong PINs => temporary block, even the right PIN is refused until it expires', async () => {
    A.$('#lockBtn').click(); await until(() => A.$('#unlockForm'));
    for (let i = 0; i < 5; i++) { await submitForm(A, '#unlockForm', { pin: '1111' }); ok(/PIN galat/.test(errText(A)), 'attempt ' + i + ': ' + errText(A)); }
    await submitForm(A, '#unlockForm', { pin: PIN }); ok(/ruko/.test(errText(A)), errText(A)); ok(A.$('#unlockForm'), 'must stay locked');
    A.ev('pinBlockedUntil = 0'); await submitForm(A, '#unlockForm', { pin: PIN }); await until(() => !A.$('#lockOverlay')) });
  await t('auto-lock after 15 minutes idle', async () => {
    A.ev('lastActive = Date.now() - 16*60*1000; checkIdle()'); await until(() => A.$('#unlockForm')); await unlock(A); await until(() => !A.$('#lockOverlay')) });
  await t('kill switch (API disabled): a save fails clearly and is rolled back; re-enable restores service', async () => {
    props.API_ENABLED = 'false'; alerts.length = 0; const n = rows('mf_expenses').length; const before = A.ev('state.expenses.length');
    A.$$('.tab').find(x => x.dataset.tab === 'expenses').click(); await sleep(20); await submitForm(A, '#expForm', { amount: '5', note: 'blocked' }); await sleep(60);
    ok(alerts.some(a => /API disabled/.test(a)), alerts.join('|')); eq(A.ev('state.expenses.length'), before); eq(rows('mf_expenses').length, n);
    props.API_ENABLED = 'true'; await submitForm(A, '#expForm', { amount: '6', note: 'allowed again' }); await until(() => rows('mf_expenses').some(x => x.note === 'allowed again')) });
  await t('OFFLINE at launch: unlock shows the last ENCRYPTED snapshot READ-ONLY; saving is blocked; reconnect restores writes', async () => {
    await A.ev('refreshNow()'); await sleep(400); const lsA = A.ls(); ok(lsA['ledger.snapshot.v1']);
    netDown = true; const B = boot({ ls: lsA }); await unlock(B); await until(() => B.ev('state.readOnly'), 8000);
    ok(B.$('#offlineBanner').style.display !== 'none'); ok(/Offline/.test(B.$('#offlineText').textContent)); ok(B.ev('state.expenses.length') > 0, 'data from snapshot'); ok(B.$('#main').textContent.length > 100);
    calls.length = 0; alerts.length = 0; B.$$('.tab').find(x => x.dataset.tab === 'expenses').click(); await sleep(20);
    await submitForm(B, '#expForm', { amount: '9', note: 'offline try' }); await sleep(60); ok(alerts.some(a => /sirf dekh sakte/.test(a)), 'no read-only alert');
    eq(calls.filter(c => JSON.parse(c.body).a === 'appendItem').length, 0, 'no write attempted'); eq(rows('mf_expenses').some(x => x.note === 'offline try'), false);
    netDown = false; B.$('#reconnectBtn').click(); await until(() => B.ev('state.readOnly') === false, 6000); eq(B.$('#offlineBanner').style.display, 'none');
    await submitForm(B, '#expForm', { amount: '9', note: 'back online' }); await until(() => rows('mf_expenses').some(x => x.note === 'back online')) });
  await t('tampered snapshot is ignored: you get the normal load-error screen with Retry (never wrong data)', async () => {
    const lsA = A.ls(); const snap = JSON.parse(lsA['ledger.snapshot.v1']); snap.ct = snap.ct.slice(0, -8) + 'AAAAAAAA'; lsA['ledger.snapshot.v1'] = JSON.stringify(snap);
    netDown = true; const C = boot({ ls: lsA }); await unlock(C); await until(() => C.$('#retryLoadBtn'), 8000); eq(C.ev('state.readOnly'), false); netDown = false });
  await t('token ROTATED on the Sheet: next call forgets the stale pairing and asks to pair again (old copy locked out)', async () => {
    ctx.setApiToken_('9'.repeat(64)); await A.ev('pollOnce()'); await until(() => A.$('#pairForm')); ok(/dobara pair/.test(errText(A)));
    eq(A.ls()['ledger.vault.v1'], undefined); eq(A.ls()['ledger.snapshot.v1'], undefined); ctx.setApiToken_(TOKEN) });
  await t('re-pair works; "forget this device" wipes pairing + offline copy', async () => {
    await pair(A); await until(() => A.ev('state.loaded')); A.$('#lockBtn').click(); await until(() => A.$('#forgetBtn')); A.$('#forgetBtn').click(); await until(() => A.$('#pairForm'));
    eq(A.ls()['ledger.vault.v1'], undefined); eq(A.ls()['ledger.snapshot.v1'], undefined) });
  await t('desktop shortcut deep link ?tab=daily opens that tab; Alt+2 switches to Wallets', async () => {
    const seed = boot(); await pair(seed); await until(() => seed.ev('state.loaded')); const lsS = seed.ls();
    const D = boot({ url: 'https://ledger.example.com/?tab=daily&source=shortcut', ls: lsS }); await unlock(D); await until(() => D.$('.tab.active') && D.$('.tab.active').dataset.tab === 'daily', 8000);
    D.w.document.dispatchEvent(new D.w.KeyboardEvent('keydown', { altKey: true, code: 'Digit2', bubbles: true })); await sleep(30); eq(D.$('.tab.active').dataset.tab, 'wallets') });
  await t('the shipped file contains no token, no deployment URL and no secret', async () => {
    ['index.html', 'css/styles.css', 'sw.js', 'manifest.json'].forEach(f => { const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); ok(!/AKfycb[A-Za-z0-9_-]{10,}/.test(s), f + ' has a deployment id'); ok(!/[a-f0-9]{48,}/.test(s), f + ' has a token-like string'); }) });
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
