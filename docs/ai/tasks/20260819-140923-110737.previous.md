# Current Task

Status: COMPLETED
Task ID: 20260819-134645-308275
Started At: 2026-08-19T13:46:45Z
Updated At: 2026-08-19T13:47:29Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Webmail: commit+push+deploy akumulasi hardening keamanan (OWASP audit, image-proxy anti tracking-pixel, server.js rate-limit/session) + sinkron deploy.sh nginx config

## Goal Link
Goal ID: G-001
Sub-goal ID: G-001.S-009

## Files Involved
- .gitignore — un-ignore scripts/test-*.mjs
- configs/site.webmail.custom — CSP object-src 'none', frame-src 'self', worker-src 'self', img-src 'self' data:, Permissions-Policy, route /api/image-proxy
- server.js — /api/image-proxy (SSRF-guarded) + rate-limit Retry-After + session env config + emailValidation
- src/lib/emailValidation.js — tolak semua karakter kontrol (header injection)
- src/lib/ssrfGuard.js — blokir IP privat/reserved (fail-closed)
- src/lib/imageProxy.js — proxyExternalImages (render-only)
- src/components/ErrorBoundary.jsx — hapus info disclosure
- src/components/mailer/MessageReader.jsx — pakai proxyExternalImages utk displayHtml
- src/lib/api.js — fetchPreferences console.warn → debugWarn
- deploy.sh — sinkron nginx heredoc dgn configs/site.webmail.custom (CSP + Permissions-Policy + /api/image-proxy)
- scripts/test-{email-category,signatures,draft-api,snooze,date-groups,email-validation,ssrf-guard,image-proxy}.mjs

## Next Steps
- Deploy via SERVER=deploy-mail ./deploy.sh (restart sogo-smtp-proxy + nginx reload)

## Risks
- deploy.sh setup_nginx() dulu hardcode config LAMA (img-src https:, tanpa object-src/frame-src/Permissions-Policy/image-proxy) → kalau di-deploy akan REVERT hardening. Sudah disinkronkan.

## Validation
- 14/14 test PASS · npm run build OK · node --check server.js OK · bash -n deploy.sh OK · git diff --check OK
