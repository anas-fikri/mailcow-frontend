# Current Task

Status: BLOCKED (audit remediation committed/pushed; deploy preflight blocked by SSH DNS)
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

## Next Step
1. Restore DNS/SSH resolution for the `mailserver` alias, then rerun `./deploy.sh`; the current attempt failed closed before any production mutation.
2. Verify production HTTP health and security headers after a successful deploy; browser smoke test remains pending because Chrome is unavailable here.
3. Rotate the leaked webmail password and optionally scrub the historical credential with `git filter-repo`.

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
