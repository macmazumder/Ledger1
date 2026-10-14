/* Mazumder Ledger — service worker.
 * Caches ONLY the app shell (HTML/CSS/icons) and public CDN assets (SheetJS, fonts) so the app opens with no internet.
 * It NEVER caches or intercepts API traffic (POST, script.google.com) and never stores ledger data:
 * offline data lives in the page as an encrypted snapshot, not here.
 * BUILD is stamped by tools/build.js so any change to the shell produces a new worker and the "Reload" banner. */
const BUILD = 'b70a2d360318';
const SHELL_CACHE = 'ledger-shell-' + BUILD;
const RUNTIME_CACHE = 'ledger-runtime-v1';
const SHELL = [
  './', 'index.html', 'css/styles.css', 'manifest.json',
  'icons/icon.svg', 'icons/icon-maskable.svg', 'icons/favicon.svg',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'
];
const RUNTIME_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const NEVER_CACHE_HOSTS = ['script.google.com', 'script.googleusercontent.com'];

self.addEventListener('install', event => {
  // No skipWaiting here: the page shows "Naya version available — Reload" so an update never swaps in under an unsaved form.
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('ledger-shell-') && key !== SHELL_CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => { if (event.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;                       // API calls are POST: straight to the network
  const url = new URL(req.url);
  if (NEVER_CACHE_HOSTS.includes(url.hostname)) return;   // Apps Script: never touched
  if (req.mode === 'navigate') { event.respondWith(networkFirst(req)); return; }
  if (url.origin === self.location.origin) { event.respondWith(staleWhileRevalidate(req, SHELL_CACHE)); return; }
  if (RUNTIME_HOSTS.includes(url.hostname)) { event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE)); return; }
});

/** Page loads: try the network (3 s, flaky connections are common), else the cached shell. */
async function networkFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
    ]);
    if (res && res.ok) cache.put('index.html', res.clone());
    return res;
  } catch (e) {
    return (await cache.match('index.html')) || (await caches.match('index.html')) || Response.error();
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req, { ignoreSearch: true });
  const refresh = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await refresh) || Response.error();
}
