# Current Task

Status: ACTIVE (audit fixes committed & pushed; production deploy pending)
Task ID: sogo-frontend-audit-2026-08-04
Started At: 2026-08-04
Updated At: 2026-08-04
Project Root: /Users/anasfikri/Documents/Projects/pcpexpress/mailcow/sogo-frontend

## Objective
Find bugs & vulnerabilities in sogo-frontend, fix them, commit, push, deploy, and update ai-toolkit documentation.

## Completed
- **XSS fixes (MessageReader.jsx):** print window escapes from/to/cc/date; reply/forward quote now uses DOMPurify-sanitized body (`cleanHtml`) AND escapes all email header values (stored-XSS via sender display name eliminated).
- **Dependency upgrade:** `react-router-dom@7.18.2` → `react-router@8.3.0` (imports in 5 files). Clears GHSA-qwww-vcr4-c8h2 (RSC-mode CSRF). `npm audit` now reports **0 vulnerabilities** (was 2 high).
- **server.js:** timing-safe API-key comparison (`crypto.timingSafeEqual`); rate limiter keyed by real client IP via `X-Real-IP` — only trusted when the socket peer is loopback or a docker-bridge address (prevents spoofing + fixes shared-bucket bug behind nginx).
- **api.js:** `markRead`/`markFlagged`/`deleteMessages`/`moveMessages` now surface HTTP failures; full-mailbox debug log removed; `.catch` added to fire-and-forget call sites.
- **Production hardening:** CSP + `X-Content-Type-Options: nosniff` + `X-Frame-Options: DENY` + `Referrer-Policy` added to `/webmail` nginx config (both `configs/site.webmail.custom` and `deploy.sh setup_nginx`).
- **Credential leak:** `sogo_test.py` on origin/main contained a live plaintext password for `anas.fikri@pcpexpress.co.id`. Removed from the tree (commit b7f7fa0). **Password rotation + git history scrub recommended.**

## Git / Deployment
- Local main synced to origin/main @ **b7f7fa0** (backup ref: `backup/local-main-pre-audit`).
- Push completed: `f83f67f..b7f7fa0` fast-forward (history had been force-rebuilt on remote; local 3 prior security commits + new fix were cherry-picked onto it).
- **Deploy PENDING:** `./deploy.sh` ran and failed closed at preflight — `mailserver` (202.148.2.141:2002) unreachable ("Connection refused"/timeout) and `sogo-smtp-proxy` must be active on port 3005 first. Nothing on production was changed.

## Validation
- `npm run build` ✅ (0 errors), `npm run test:safe-url` ✅, `node --check server.js` ✅, `bash -n deploy.sh` ✅, `git diff --check` ✅, `npm audit` → 0 ✅, dev smoke test (login render + route guard redirect) ✅.

## Next Step
1. Restore mailserver SSH reachability; verify `systemctl --user is-active sogo-smtp-proxy` (port 3005).
2. Run `./deploy.sh` (no message needed; commits already pushed) to deploy dist + nginx config with security headers.
3. Rotate the leaked webmail password; optionally scrub history with `git filter-repo`.
