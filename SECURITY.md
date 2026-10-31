# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately via GitHub: **Security → Report a vulnerability** on this
repository (private vulnerability reporting). Include affected version/commit,
reproduction steps, and impact. You can expect an acknowledgement within 7 days.

## Supported versions

Only the latest commit on `main` receives security fixes.

## Security model — things deployers should know

- **`VITE_API_KEY` is not a secret.** It is compiled into the browser bundle and
  only raises the bar against drive-by abuse and CSRF of `/api/*`. Real access
  control comes from the user's SOGo session and the SMTP session cookie
  (`HttpOnly`, `Secure`, `SameSite=Strict`). Keep `CORS_ORIGINS` tight.
- **The image proxy** (`/api/image-proxy`) fetches remote URLs on behalf of the
  browser. It blocks private/loopback/link-local ranges, pins the resolved IP to
  prevent DNS rebinding, limits redirects, size, and content type. If you change
  `src/lib/ssrfGuard.js`, run `npm test`.
- **HTML email** is sanitised with DOMPurify and rendered under a strict CSP
  (`configs/site.webmail.custom`). Do not relax `script-src` or `img-src`.
- **mailcow MySQL access**: `server.js` reads/writes user preferences in the
  mailcow database. Give it the least privileges you can and never expose port
  3306 publicly.
- **mailcow API**: this project does not need a mailcow API key. If you use one
  for other tooling, restrict `allow_from` to known IPs.

## Known issues

- `xlsx` (SheetJS) from the npm registry has unfixed high-severity advisories
  (prototype pollution, ReDoS) and is used for in-browser XLSX attachment
  previews. SheetJS now publishes fixed versions only on its own CDN. Until the
  dependency is switched, treat XLSX previews of untrusted mail as a risk:

  ```bash
  npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
  ```
