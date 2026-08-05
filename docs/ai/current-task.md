# Current Task

Status: COMPLETE (mailbox/statistics count mismatch remediation deployed and verified LIVE)
Task ID: sogo-frontend-audit-2026-08-04
Started At: 2026-08-04
Updated At: 2026-08-04T14:20:00+07:00
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
- Before this documentation update, local `main` was clean and synced with `origin/main` @ **67da690** (deployed application code is @ `e9ecad5`). The documentation edits in this worktree are intentionally uncommitted until reviewed.
- Security fixes and the Round 3 runtime/deploy batch were pushed and deployed successfully.
- **Production deploy: COMPLETE and LIVE (per the Round 3 deployment handoff; not re-probed from this workspace):** `sogo-smtp-proxy` was healthy on port `3005`; `dist/`, Nginx config, and security headers were deployed; production webmail and `/api/health` returned HTTP 200.

## Validation
- Historical release validation: `npm run build` ✅, `npm run test:safe-url` ✅, `node --check server.js` ✅, `bash -n deploy.sh` ✅, `git diff --check` ✅, `npm audit` → 0 ✅, dev smoke/integration tests ✅.
- Current workspace recheck: `npm run test:safe-url` ✅, `npm audit --omit=dev` ✅ (0 vulnerabilities), `node --check server.js` ✅, `bash -n deploy.sh` ✅, `git diff --check` ✅.
- Current workspace recheck after the remediation patch: `npm run build` ✅, `npm run test:safe-url` ✅, `npm audit --omit=dev` ✅ (0 vulnerabilities), `node --check server.js` ✅, `bash -n deploy.sh` ✅, and `git diff --check` ✅.

## Latest deep-audit remediation — pre-delivery
- Fixed unsafe percent-encoded SOGo path segments: only `%2F` is accepted for nested folder IDs; encoded traversal/query/backslash sequences are rejected.
- Extracted the validator into `src/lib/pathSegment.js` and added `npm run test:path-segment` regression coverage.
- Added auth-status propagation for unseen, contacts, calendar, compose, contact/calendar mutations, password changes, and preference saves so 401/403 reaches the session watcher instead of silently returning fallback data.
- Removed duplicate contacts auth guard and validated SOGo `draftId` before URL interpolation.
- Reduced `/api/health` disclosure to `{ ok: true }`, rate-limited SMTP session revocation, and replaced raw SMTP error details returned to clients with a generic message.
- Final local validation passes: `npm run test:path-segment`, `npm run test:user-prefs`, `npm run test:safe-url`, Vite build, `npm audit --omit=dev` (0 vulnerabilities), Node/shell syntax, static scans, and `git diff --check`.
- Regression test `scripts/test-path-segment.mjs` is intentionally force-added because the repository's legacy `test-*` ignore rule matches it.

## Delivery result — deep-audit remediation — COMPLETE
- Commit `6cf66dd` (`fix(security): harden API paths and session errors`) and documentation commit `dae9855` were pushed to `origin/main`.
- Production SSH was reached through the verified route `anas.fikri@202.148.2.139:22` using the existing deployment key; the temporary SSH wrapper did not modify permanent local SSH configuration.
- The user service unit was backed up at `/home/anas.fikri/.config/systemd/user/sogo-smtp-proxy.service.bak-deploy-20260804150624`; its stale `PORT=3003` override was corrected to `PORT=3005`, then the service was enabled/restarted.
- `./deploy.sh` completed: preflight ✅, Vite build ✅, rsync ✅, Nginx config/reload ✅, webmail verification ✅.
- Post-deploy verification: `sogo-smtp-proxy` active, port 3005 listening, authenticated localhost health HTTP 200, public webmail HTTP/2 200, CSP/nosniff/X-Frame-Options/Referrer-Policy present.
- `zeroclaw` on port 3003 was identified as unrelated and left untouched.

## Latest mailbox/statistics consistency remediation
- Confirmed mismatch: Stats counted `messages.length` from an unbounded/paginated response, while MailPage loaded a capped batch (`limit: 250`); API `total` also represented only loaded rows.
- Added `src/lib/messageTotals.js` to normalize SOGo folder totals from `uids`, `total`, `totalCount`, or `count` metadata with safe fallback.
- `fetchMessages` now returns the authoritative folder total; Stats requests `limit: 1` and uses `result.total`; MailPage shows the total folder count and distinguishes loaded rows from older messages.
- Added `npm run test:message-totals`, including paginated UID metadata and null metadata fallback cases.
- Validation passes: all project tests, Node syntax checks, Vite build, `npm audit --omit=dev` (0 vulnerabilities), and `git diff --check`.

## Delivery result — mailbox/statistics consistency — COMPLETE
- Commit `9fa267f` (`fix(stats): align folder totals with mailbox`) was pushed to `origin/main`.
- Deploy completed through the verified production route: preflight ✅, build ✅, rsync ✅, Nginx reload ✅, webmail HTTP 200 ✅.
- The proxy was restarted immediately before deploy because an external process had stopped it between separate checks; port 3003/zeroclaw remained untouched.
- Post-deploy verification confirmed service active, authenticated health HTTP 200, webmail HTTP 200, and security headers present.
- Backend reliability follow-up: service was externally terminated after deploy despite `Restart=on-failure`; unit was backed up at `/home/anas.fikri/.config/systemd/user/sogo-smtp-proxy.service.bak-restart-always-20260804152732`, changed narrowly to `Restart=always`, and monitored 6/6 samples over 30 seconds at `active/200`.
- Production asset now serves `index-CX2Vqhp-.js`; unrelated port 3003/zeroclaw remains untouched.

## Next Step
1. Verify visually that Stats, Inbox, and Sent show matching totals for the same account.
2. Rotate the leaked webmail password and optionally scrub the historical credential with `git filter-repo`.
3. Browser smoke test remains pending because Chrome is unavailable in this workspace.

## Follow-up 2026-08-04 — Per-account theme initialization
- Confirmed theme and accent settings are stored under normalized per-account keys (`pcp_prefs_<lowercase-email>`).
- Updated login hydration so a returning account loads its own profile and a first-time account receives/persists isolated defaults instead of inheriting the previous account's theme.
- Added `npm run test:user-prefs` regression coverage for normalized email keys and account isolation.
- Validation: user-prefs test, safe-url test, build, Node/shell syntax, production audit (0 vulnerabilities), and diff check all pass.

## Follow-up 2026-08-04 — Per-account UI preferences
- Implemented and pushed @ `f07e017`: UI prefs (theme, themeColor, sortAsc, conversationView) now stored per account (`pcp_prefs_<email>`, new `src/lib/userPrefs.js`) and loaded on login; `clearUser` no longer resets them.
- Validation: build ✅, dev integration test (login loads prefs, changes persist, logout keeps prefs) ✅.

## Round 3 2026-08-04 — Second bug-fix batch + PRODUCTION DEPLOY COMPLETE

### Fixed (pushed @ `6d87cd1`, `e9ecad5`)
- **EventModal crash:** `toDateStr`/`toTimeStr`/`fmtInputDate` guard invalid dates (NaN) so `toISOString()` can't throw RangeError (e.g. event without a start timestamp).
- **SwipeableRow:** early return moved after all hooks (Rules of Hooks).
- **lib/constants:** removed duplicate `NAV_ITEMS`; **lib/stats:** removed dead `dailyTotal`/`totalEmail`.
- **deploy.sh quoting bug (blocked every build):** `get_production_api_key` had unescaped `"` inside an inline double-quoted ssh string, so awk received `index($0, =)` and failed; switched to the same heredoc pattern as `preflight_sogo_proxy`.

### Deploy (LIVE)
- SSH to mailserver restored. `sogo-smtp-proxy` (systemd user service) was **inactive**; its `.env` had `PORT=3004` (Control Tower MCP port, violating the project guardrail) → changed to **3005**, service started and healthy.
- Updated `server.js` on the host (backup: `server.js.bak-20260804`) with timing-safe API key + per-client rate limiting.
- `./deploy.sh` completed: preflight OK → build OK → rsync dist → nginx config (CSP headers) → reload → verify **HTTP 200**.
- Verified from server: `content-security-policy` (self + Google Fonts + data: images), `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy` all live; `/api/health` via nginx = 200.
- **Note:** stale `node server.js` processes exist on the host — PID 1512043/1512044 = Control Tower (cwd `/opt/control-tower`, ports 3003/3004, DO NOT touch); PIDs 3212161/3212169 (root, since Jul 27) unidentified, left untouched.

### Remaining
- Rotate the leaked webmail password (`sogo_test.py`); optional `git filter-repo` history scrub.
- Follow-up: verify new-build webmail functionality in a browser (CSP is now enforced).

## Follow-up 2026-08-05 — Validate mailbox rows across folders (pre-delivery)

- Finding: folder totals could be nonzero from SOGo `uids` metadata while `headers` rows were absent because the request did not explicitly select message columns.
- Fix: added `src/lib/messageRows.js` with dynamic column mapping, positional compatibility fallback, safe boolean/address parsing, and protection against missing optional columns borrowing adjacent values.
- Fix: `fetchMessages` and `searchMessages` now share explicit SOGo message headers through `src/lib/messageRequests.js` for Inbox, Sent, Junk, Trash, and other folders.
- Tests: added `test:message-rows`, `test:message-requests`, and mocked `test:message-api`; the latter verifies folder URLs, serialized headers, parsed rows, and authoritative `uids` totals when only one row is loaded.
- Local validation: all focused tests, syntax checks, Vite build, `npm audit --omit=dev` (0 vulnerabilities), and `git diff --check` pass.
- Delivery status: COMPLETE and LIVE. Commit `d86ed2c` was pushed and deployed successfully. Public webmail returns HTTP 200 with security headers; the new asset is `index-CVQcTv-t.js`; proxy is active with authenticated health HTTP 200 and remained `active/200` for 6 samples over 30 seconds. Chrome browser smoke test is unavailable, so account-level visual confirmation still requires a user/browser session.

## Follow-up 2026-08-05 — Login routing failure and remediation

- Finding: production Nginx had overlapping regex locations for `/api/*`: webmail's proxy on port 3005 and Control Tower's broader route on port 3003. Public `/api/health` returned 200 without an API key and `/api/auth/smtp` returned the wrong 401 behavior, while the actual SOGo proxy required `X-Api-Key` and returned 403 without it. Login therefore failed after SOGo authentication when registering the SMTP session.
- Fix: replaced the webmail API regex with exact-match locations for `/api/health`, `/api/auth/smtp`, `/api/preferences`, and `/api/send`, forcing those paths to the SOGo proxy on port 3005 before Control Tower regex evaluation.
- Coverage: added `npm run test:nginx-routes`, which binds every exact location to its intended proxy target in both the checked-in config and deploy template.
- Delivery: commit `e1fb7a6` deployed successfully. Post-deploy route matrix: valid API key → health 200 and SMTP dummy request 200; missing/bad key → 403. Webmail 200; proxy active/200 across 3 stability samples. Port 3003/zeroclaw untouched.
- Remaining: user must retry login with a hard refresh; real credential authentication was not automated or logged.
