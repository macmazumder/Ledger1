#!/usr/bin/env node
/* Copies ONLY what a static host needs into dist/ (no src/, test/, docs/, prompts/, reference/, tools/).
 * Usage: npm run build && npm run dist   then upload the dist/ folder (GitHub Pages / Netlify Drop / Cloudflare Pages). */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const FILES = ['index.html', 'sw.js', 'manifest.json', 'css', 'icons', '_headers', '.nojekyll'];
if (require.main === module) {
  const out = path.join(root, 'dist');
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out);
  FILES.forEach(f => fs.cpSync(path.join(root, f), path.join(out, f), { recursive: true }));
  console.log('dist/ ready:', fs.readdirSync(out).join(', '));
}
module.exports = { FILES };
