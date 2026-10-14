// Static checks of the file system: manifest, icons, service worker, build sync, no secrets. Run: node test/static.test.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), R = p => fs.readFileSync(path.join(root, p), 'utf8'), exists = p => fs.existsSync(path.join(root, p));
const { build } = require('../tools/build.js');
let pass = 0, fail = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ', n); } catch (e) { fail++; console.log('FAIL', n, '->', e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); };
const manifest = JSON.parse(R('manifest.json')), index = R('index.html'), sw = R('sw.js'), sheetHtml = R('src/Ledger.html');
const pngSize = p => { const b = fs.readFileSync(path.join(root, p)); ok(b.slice(1, 4).toString() === 'PNG', p + ' is not a PNG'); return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20); };

t('required root files exist: index.html, sw.js, manifest.json, css/, icons/, test/CHANGELOG.md', () => {
  ['index.html', 'sw.js', 'manifest.json', 'css/styles.css', 'test/CHANGELOG.md', 'icons/icon.svg', 'icons/icon-maskable.svg', 'icons/favicon.svg', 'src/Code.gs', 'src/Ledger.html', 'src/appsscript.json', '_headers', 'package.json'].forEach(f => ok(exists(f), 'missing ' + f)); ok(!exists('CHANGELOG.md'), 'changelog must live under test/') });
t('generated files are IN SYNC with src/Ledger.html (run: node tools/build.js)', () => {
  const o = build(); ['index.html', 'css/styles.css', 'sw.js'].forEach(f => ok(R(f) === o[f], f + ' is out of date')) });
t('the app code is a single source: index.html script == src/Ledger.html script', () => {
  const sc = h => h.match(/<script>([\s\S]*)<\/script>/)[1]; ok(sc(index) === sc(sheetHtml)) });
t('manifest: installable fields, relative scope, standalone, theme matches the page', () => {
  ['name', 'short_name', 'start_url', 'scope', 'display', 'icons', 'theme_color', 'background_color', 'id'].forEach(k => ok(manifest[k], 'missing ' + k));
  eq(manifest.display, 'standalone'); ok(manifest.start_url.startsWith('./') && manifest.scope === './', 'must be relative so it works under /repo-name/');
  ok(index.includes(`<meta name="theme-color" content="${manifest.theme_color}">`), 'theme-color mismatch'); ok(manifest.short_name.length <= 12) });
t('manifest icons: every file exists, PNG sizes are what they claim, maskable present, SVG "any" present', () => {
  manifest.icons.forEach(i => { ok(exists(i.src), 'missing ' + i.src); if (i.type === 'image/png') eq(pngSize(i.src), i.sizes, i.src); });
  ok(manifest.icons.some(i => i.purpose === 'maskable' && i.type === 'image/svg+xml')); ok(manifest.icons.some(i => i.purpose === 'any' && i.type === 'image/svg+xml'));
  ok(manifest.icons.some(i => i.sizes === '192x192') && manifest.icons.some(i => i.sizes === '512x512'), 'need 192 + 512 PNG for installability everywhere');
  eq(pngSize('icons/apple-touch-icon.png'), '180x180') });
t('manifest shortcuts open real tabs', () => {
  const tabs = [...sheetHtml.matchAll(/data-tab="(\w+)"/g)].map(m => m[1]); ok(manifest.shortcuts.length >= 3);
  manifest.shortcuts.forEach(s => { const m = /^\.\/\?tab=(\w+)/.exec(s.url); ok(m && tabs.includes(m[1]), s.url); }) });
t('SVG icons are well-formed and carry no script / event handlers', () => {
  ['icon.svg', 'icon-maskable.svg', 'favicon.svg'].forEach(f => { const s = R('icons/' + f); ok(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(s) && /viewBox="0 0 \d+ \d+"/.test(s) && /<\/svg>\s*$/.test(s), f); ok(!/<script|\son\w+=|javascript:|<foreignObject|<image/i.test(s), f + ' unsafe'); }) });
t('index.html wires manifest, icons, css, viewport-fit and the shared mobile meta', () => {
  ['<link rel="manifest" href="manifest.json">', '<link rel="stylesheet" href="css/styles.css">', '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">', '<link rel="icon" href="icons/favicon.svg" type="image/svg+xml">', 'viewport-fit=cover', 'apple-mobile-web-app-capable', 'name="format-detection"'].forEach(x => ok(index.includes(x), 'missing ' + x));
  ok(!/<style[ >]/.test(index), 'CSS must be external'); ok(/^<!DOCTYPE html>/.test(index)) });
t('the SHEET version (Apps Script) has the mobile meta and a self-contained inline <style>', () => {
  ['viewport-fit=cover', 'name="theme-color"', 'apple-mobile-web-app-capable', 'format-detection'].forEach(x => ok(sheetHtml.includes(x), 'missing ' + x)); ok(/<style>/.test(sheetHtml));
  ok(!/href="(css|icons)\//.test(sheetHtml) && !sheetHtml.includes('manifest.json'), 'Apps Script cannot serve sibling files') });
t('sw.js: every precached file exists; build stamp is real and current', () => {
  const list = eval(/const SHELL = (\[[\s\S]*?\]);/.exec(sw)[1]); list.forEach(f => ok(f === './' || exists(f), 'precache missing ' + f)); ok(list.includes('index.html') && list.includes('css/styles.css') && list.includes('manifest.json'));
  ok(!sw.includes('__BUILD__')); eq(/const BUILD = '([^']+)'/.exec(sw)[1], build().stamp) });
t('sw.js safety: never touches POST or Apps Script, no ledger data caching, skipWaiting only on the user\'s "Reload"', () => {
  ok(/req\.method !== 'GET'\) return/.test(sw), 'must pass non-GET through'); ok(/NEVER_CACHE_HOSTS = \['script\.google\.com', 'script\.googleusercontent\.com'\]/.test(sw));
  eq((sw.match(/skipWaiting\(\)/g) || []).length, 1); ok(/event\.data === 'SKIP_WAITING'\) self\.skipWaiting\(\)/.test(sw)); ok(!/localStorage|indexedDB/.test(sw)) });
t('hosting files: sw.js / manifest are never cached stale; CSP only allows Google Apps Script for network', () => {
  const h = R('_headers'); ok(/\/sw\.js\s+Cache-Control: no-cache/.test(h)); ok(/connect-src 'self' https:\/\/script\.google\.com https:\/\/script\.googleusercontent\.com/.test(h)); ok(/frame-ancestors 'none'/.test(h)) });
t('NO secrets / deployment ids / tokens anywhere in the shipped files', () => {
  ['index.html', 'css/styles.css', 'sw.js', 'manifest.json', 'src/Code.gs', 'src/Ledger.html', '_headers'].forEach(f => { const s = R(f); ok(!/AKfycb[A-Za-z0-9_-]{10,}/.test(s), f + ' deployment id'); ok(!/\b[a-f0-9]{48,}\b/.test(s), f + ' token-like string'); }) });
t('package.json scripts exist and test runs the whole suite', () => {
  const p = JSON.parse(R('package.json')); ['build', 'test', 'serve', 'icons'].forEach(k => ok(p.scripts[k], k)); ['static', 'backend', 'client_honest_ui', 'e2e', 'pwa.e2e'].forEach(n => ok(p.scripts.test.includes(n), n)) });
t('version is consistent: Code.gs LEDGER_VERSION matches package.json', () => {
  const v = /LEDGER_VERSION = '([^']+)'/.exec(R('src/Code.gs'))[1]; ok(/^\d+\.\d+$/.test(v), v); ok(JSON.parse(R('package.json')).version.startsWith(v + '.'), 'package.json version differs from ' + v) });
t('dist helper ships only deployable files (never src/, test/, prompts/, docs/, reference/)', () => {
  const { FILES } = require('../tools/dist.js'); FILES.forEach(f => ok(exists(f), 'missing ' + f));
  ['src', 'test', 'prompts', 'docs', 'reference', 'tools', 'package.json'].forEach(f => ok(!FILES.includes(f), f + ' must not be deployed')); ok(FILES.includes('sw.js') && FILES.includes('index.html')) });
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
