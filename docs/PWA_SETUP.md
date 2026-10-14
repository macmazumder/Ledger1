# PWA setup — desktop app first, mobile second

How it fits together
```
 Desktop / phone  --HTTPS-->  static host (index.html, css, icons, sw.js)      <- anyone can load this, it holds NO data
        |
        '--POST (token in body)-->  Apps Script "Ledger API" deployment  -->  your Google Sheet
```
The page itself is public and contains no secret. All data lives in your Sheet and is only released to a device that holds the token.

## 1. Sheet side (once)
1. Paste `src/Code.gs`, `src/Ledger.html`, `src/appsscript.json` into the Apps Script project. Reload the Sheet. Menu **Ledger > Setup / Repair Data Sheets**.
2. Menu **Ledger > PWA API: create / rotate token**. Copy the token shown (it is shown ONCE; only its hash is stored).
3. Apps Script editor > **Deploy > New deployment > Web app**
   - Description: `Ledger API`
   - Execute as: **Me**
   - Who has access: **Anyone**   (needed so a browser on another site can POST; the token is the lock)
   - Deploy, authorise, copy the **Web app URL** (ends in `/exec`).
4. Keep your old owner-only deployment if you still use the Sheet menu / web app version. After EVERY code change: **Deploy > Manage deployments > pencil > New version** for BOTH deployments.

## 2. Host the front-end (pick one)
```
npm install          # once (only needed for tests)
npm run build        # regenerates index.html, css/styles.css and stamps sw.js
npm run dist         # copies ONLY the deployable files into dist/
```
- **Netlify Drop** (easiest, can be private): app.netlify.com/drop, drag the `dist` folder. Netlify also reads `_headers` (security headers + CSP).
- **GitHub Pages**: put the contents of `dist/` at the repo root (or `/docs`), Settings > Pages. Free Pages needs a public repo: that is fine, the page holds no secrets.
- **Cloudflare Pages**: upload `dist/`.
Do NOT upload `src/`, `test/`, `prompts/`, `docs/`, `reference/`.
Local try-out: `npm run serve` then open http://localhost:8080 (service workers work on localhost).

## 3. First launch (desktop, primary)
1. Open the site in Chrome or Edge. The **Pair this device** screen appears.
2. Paste the Web app URL and the token, choose a PIN (4+ characters). The token is encrypted with the PIN (AES-GCM, PBKDF2) before it is stored.
3. Click the install icon in the address bar (or the **Install app** button) > it opens in its own window. Shortcuts: right-click the app icon for Daily / Expenses / Wallets / People. Inside the app: **Alt+1 ... Alt+7** switch tabs, **Lock** button locks now, it also auto-locks after 15 idle minutes.
4. Mobile: Android Chrome > menu > *Install app*. iPhone Safari > Share > *Add to Home Screen* (uses `apple-touch-icon.png`). iOS may clear a home-screen app's storage after weeks of non-use: you would just pair again.

## 4. What works offline
- The app opens with no internet (shell cached by `sw.js`).
- If the Sheet cannot be reached at launch, you see the **last synced data, read-only**, in an amber "Offline" banner. The copy is stored encrypted with your PIN-derived key. Saving is blocked until you reconnect (nothing is ever lost silently).
- Short drops while you are working are handled by the unsaved-entries queue (amber rows + "Retry now"). **Not yet done:** that queue is in memory only, so closing the window while offline loses unsaved entries (a warning is shown). Making it survive a restart is `prompts/phase5b_offline_outbox.md`.

## 5. Security model (read once)
| Question | Answer |
|---|---|
| Someone finds the site URL | They see only a pair screen. No data. |
| Someone finds the API URL | `Unauthorized` without the token; 10 wrong tokens locks the API for 10 min; max 120 requests/min. |
| Phone / laptop is lost | Token is encrypted by your PIN, 5 wrong PINs trigger a delay. Rotate the token (menu) = every old copy is dead. |
| Something looks wrong | Menu **PWA API: DISABLE (kill switch)**, check the **Audit Log** tab (writes + failures only, never ledger data). |
| What can the API NOT do | Bulk import/replace, setData, repair, backups, seeding: those only work from the Sheet menu as the owner. |
| Where may the token go | The app refuses to send it to any URL that is not `https://script.google.com/.../exec`. |
Backups: the nightly Drive backup (v1.0 feature) keeps running.

## 6. Updating
Edit `src/Ledger.html` > `npm run build` > `npm run dist` > upload again. Open apps show **"Naya version available — Reload"** (never forced while you have unsaved entries).

## 7. Troubleshooting
| Message | Meaning / fix |
|---|---|
| `Pair nahi ho paya: Network error` | Wrong URL, or the deployment is not "Anyone". |
| `Server ka jawab samajh nahi aaya` | Google returned a login/HTML page: set **Who has access: Anyone**, redeploy a new version. |
| `API disabled` | Menu > *PWA API: enable* (or create a token). |
| `Too many failed attempts` | Menu > *PWA API: clear lockout*. |
| `Unauthorized` after it worked | Token was rotated: pair again with the new token. |
| App looks old after a deploy | Close all windows of the app once, or press the Reload banner. |
