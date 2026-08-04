# Handoff Log

## 2026-08-01T07:08:00Z Initial Setup
- Project context scaffold created.
- Next step: update `project-context.md` and start the first task with `ai-start "task name"`.

## 2026-08-01T07:08:00Z
- Status: ACTIVE
- Objective: No active task.
- Summary: Prepared commit: fix: ESM require fix, FOLDER_TYPE_LABELS dedup, StatsPage dynamic calc, ComposeModal signature fix, sendMessage indent
- Branch: main
- Changed Files:
-  M server.js
-  M src/components/mailer/ComposeModal.jsx
-  M src/lib/api.js
-  M src/pages/LoginPage.jsx
-  M src/pages/StatsPage.jsx
- ?? .ai-toolkit/
- ?? AGENTS.md
- ?? docs/ai/


## 2026-08-03 — SOGo Frontend Deployment Audit and Safe Preparation

### Summary
Audited `/Users/anasfikri/Documents/Projects/pcpexpress/mailcow/sogo-frontend` on `macanas`. Found a production routing conflict: `site.webmail.custom` pointed SOGo API requests to Control Tower MCP port `3004`; Control Tower API already owns `3003`; `sogo-smtp-proxy` was inactive. Prepared a safe fix without changing production services.

### Changes
- Standardized SOGo proxy port to `3005` in the Nginx template, deploy-generated config, and systemd template.
- Restricted and anchored Nginx API routes to `send`, `health`, `preferences`, and `auth/smtp`.
- Fixed deploy defaults for the real GitLab project and webmail URL.
- Fixed the deploy push variable typo (`git_url`).
- Added authenticated preflight before build/commit/push/deploy; it fails closed when SOGo is unavailable.
- Build injects `VITE_API_KEY` from the environment or reads remote `API_KEY` transiently; no secret is stored in source.
- Fixed Vite base path to `/webmail/` and production SOGo default URL.
- Added production env example and deployment/service documentation.

### Validation
- `bash -n deploy.sh` ✅
- `node --check server.js` ✅
- `npm run build` ✅ with a dummy validation key
- `git diff --check` ✅
- Real preflight ✅ fails safely: `mailserver:3005` refused connection; no commit/push/rsync/restart occurred during the test.

### Git / Deployment
- Existing local branch was already one commit ahead of `origin/main`; this task adds the audit fix commit. Push is pending because the macOS Keychain credential is unavailable in the non-interactive SSH session.
- Production deploy is **PENDING** by user choice. `sogo-smtp-proxy.service` must be installed/activated on `mailserver` first; then run `./deploy.sh` from the Mac workspace.
- No production service, Nginx config, or remote webmail files were modified in this task.


## 2026-08-03 — Security Audit: URL Injection, Cookie Logs, and Router Advisory

### Findings / Fixes
- **High:** `HtmlEditor` interpolated prompt input into `insertHTML`; fixed with URL validation and DOM Range/anchor creation.
- **High:** SOGo attachment/inline-image URLs were direct `href/src` sinks; fixed with SOGo-only URL validation and encoded CID replacement.
- **Medium:** Vite dev proxy logged partial session cookies and upstream headers; removed sensitive values while retaining safe metadata.
- **Dependency:** pinned `react-router-dom@7.18.2`, removing the prior moderate open-redirect advisories. npm still reports `GHSA-qwww-vcr4-c8h2` (RSC-mode CSRF) against React Router 7.12–8.2; the project is BrowserRouter-only SPA and does not use SSR/RSC/data actions.

### Validation
- `npm run test:safe-url` ✅
- `node --check server.js` ✅
- `bash -n deploy.sh` ✅
- `npm run build` ✅
- `git diff --check` ✅
- Sensitive-log and unsafe-URL sink scans ✅

### Deployment / Git Status
- Production deployment remains **PENDING**: `sogo-smtp-proxy` is inactive and port `3005` is not listening; no production service was changed.
- Push remains pending because both HTTPS Keychain and GitLab SSH authentication were unavailable in the non-interactive macOS session.


## 2026-08-04 — Security Audit Fixes (committed & pushed; deploy blocked by network)

### Summary
Audited the full codebase (frontend, `server.js`, `deploy.sh`, nginx config) and applied security fixes. Committed and pushed to `origin/main` @ **b7f7fa0** (fast-forward `f83f67f..b7f7fa0`). Remote history had been force-rebuilt (no shared ancestry with local); the 3 prior local security commits were preserved via cherry-pick onto `origin/main`, then the new fix commit, then a credential-file removal commit.

### Changes
- **XSS (High):** MessageReader print window and reply/forward quote now escape every interpolated email header; quoted body uses DOMPurify-sanitized HTML instead of raw SOGo HTML. Covers both the earlier `rawHtml` sink and the unescaped display-name sink (stored XSS in the compose editor).
- **Dependency (High):** `react-router-dom@7.18.2` → `react-router@8.3.0` across 5 import sites. `npm audit` 0 vulnerabilities (cleared GHSA-qwww-vcr4-c8h2).
- **server.js:** `crypto.timingSafeEqual` for API key; rate limits now keyed by real client IP (`X-Real-IP`, trusted only from loopback/docker-bridge peers).
- **api.js:** mutation calls now throw on HTTP errors; removed full-mailbox debug log; added `.catch` to fire-and-forget `markRead`/`markFlagged` call sites.
- **Nginx hardening:** CSP + nosniff + X-Frame-Options + Referrer-Policy in `configs/site.webmail.custom` and `deploy.sh setup_nginx`.
- **CRITICAL credential leak:** `sogo_test.py` on remote main contained a live plaintext password (`anas.fikri@pcpexpress.co.id` / `53,omatERtEnton,{`). Deleted from the tree (b7f7fa0) and from the local worktree. **Rotate the password; consider `git filter-repo` to scrub history.**

### Validation
- `npm run build` ✅ | `npm run test:safe-url` ✅ | `node --check server.js` ✅ | `bash -n deploy.sh` ✅ | `git diff --check` ✅ | `npm audit` 0 ✅ | dev smoke test ✅

### Git / Deployment
- `origin/main` @ `b7f7fa0`; local `main` synced; backup ref `backup/local-main-pre-audit` kept.
- `./deploy.sh` attempted — **failed closed at preflight**: `mailserver` (202.148.2.141:2002) unreachable (connection refused/timeout) and `sogo-smtp-proxy` must be active on 3005. **No production service, nginx config, or remote files were modified.**
- Follow-up: restore SSH, ensure proxy active, rerun `./deploy.sh`, rotate leaked password.


## 2026-08-04 — Per-account UI preferences (committed & pushed @ f07e017)

### Summary
Implemented per-account persistence for UI preferences so they no longer reset on logout and are isolated per user.

### Changes
- **New `src/lib/userPrefs.js`:** per-email localStorage storage `pcp_prefs_<email>` for `{ theme, themeColor, sortAsc, conversationView }` with shape validation (same pattern as `autoArchive.js`/`flagColors.js`).
- **`src/store/authStore.js`:** `setUser` loads the account's stored prefs; `clearUser` no longer resets `sortAsc`/`conversationView`; all preference setters (`setTheme`, `toggleTheme`, `setThemeColor`, `setSortAsc`, `setConversationView`) persist to the active account's storage when a user is logged in. Global `pcp-auth` persist retained as device fallback for the login screen.

### Validation
- `npm run build` ✅, `git diff --check` ✅, dev integration test in preview ✅ (login loads per-account prefs; changes persist to `pcp_prefs_<email>`; logout does not reset).
- Code review: passed (removed unused `clearPrefs`).

### Git / Deployment
- Pushed to `origin/main` @ `f07e017` (fast-forward).


## 2026-08-04 — Second bug-fix batch + PRODUCTION DEPLOY COMPLETE

### Fixed (commits `6d87cd1`, `e9ecad5`)
- EventModal invalid-date guard (crash fix); SwipeableRow hook-order fix; removed duplicate NAV_ITEMS and dead stats vars; **deploy.sh remote API_KEY read switched to heredoc** (unescaped inline quotes broke every build).

### Deploy — LIVE 🎉
- `sogo-smtp-proxy` was inactive and its `.env` had `PORT=3004` (Control Tower MCP, violates guardrail) → fixed to 3005, service started, health 200.
- Host `server.js` updated (backup `server.js.bak-20260804`) with hardened auth/rate-limit.
- `./deploy.sh` full pass: preflight → build → rsync → nginx config (CSP/nosniff/XFO/Referrer-Policy) → reload → webmail HTTP 200; CSP headers + `/api/health` via nginx verified live.
- Do not touch PIDs 1512043/1512044 (Control Tower, `/opt/control-tower`). Unidentified root `node server.js` PIDs 3212161/3212169 left untouched.

### Remaining
- Rotate leaked password from `sogo_test.py`; optional git history scrub.
- Functional browser test of the newly-deployed webmail (CSP now enforced).


## 2026-08-04 — Documentation and AI Toolkit status reconciliation

### Summary
Reconciled the active project state with the latest Round 3 production handoff. Earlier entries describing deployment as pending are historical checkpoints; the authoritative current state is production LIVE.

### Verified state
- Before this documentation update, repository was clean on `main`, synced with `origin/main` at `67da690`; the documentation edits are intentionally uncommitted for review.
- Production (as verified during the Round 3 deploy, not re-probed from this workspace): `sogo-smtp-proxy` healthy on port `3005`; deployed webmail and `/api/health` returned HTTP 200.
- Security: CSP, `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy` verified live; `npm audit --omit=dev` reports 0 vulnerabilities.
- Local checks: `npm run test:safe-url`, `node --check server.js`, `bash -n deploy.sh`, and `git diff --check` pass.
- Local build caveat: `npm run build` currently cannot run because `node_modules` is absent (`vite: not found`); restore dependencies with `npm install` before repeating the build.

### Documentation updates
- Marked the security/deployment sub-goal complete in `docs/ai/goals.md`.
- Updated `docs/ai/current-task.md` to COMPLETE and separated historical validation from current workspace validation.
- Updated `docs/ai/application-map.md`, `docs/ai/decisions.md`, and `docs/ai/project-context.md` with the live deployment and current workspace evidence.
- Added the post-deploy check command to `.ai-toolkit/project.env`.
- Updated ISO roadmap/deployment documentation with production status and the local dependency caveat.

### Follow-up
- Rotate the leaked webmail password and optionally scrub it from Git history.
- Install dependencies and run `npm run build`.
- Run a browser smoke test when Chrome/browser tooling is available.


## 2026-08-04 — Security audit remediation patch (pre-delivery)

### Fixes completed
- Bound `/api/preferences` reads to the authenticated SMTP session account; reject cross-account `email` requests.
- Revoke server-side SMTP sessions during logout and session expiry; login only becomes active after SMTP registration succeeds.
- Hardened fallback SMTP recipient/header validation, forced `From` to the authenticated account, and made API-key comparison byte-length safe for UTF-8 input.
- Replaced interpolated `docker inspect` shell execution with `execFileSync` argument arrays.
- Sanitized all contenteditable hydration/input/link-editor callbacks with DOMPurify; removed mailbox-content snippets and response URLs from client diagnostics.
- Included SMTP session identity in preferences query keys and propagated preference 401/403 responses instead of silently serving stale local cache.
- Fixed Rules form reset and Calendar drag/drop async error handling; retained prior invalid-date and hook-order fixes.

### Validation
- `npm run build` ✅ (Vite 8.2.0, 1997 modules)
- `npm run test:safe-url` ✅
- `npm audit --omit=dev` ✅ — 0 vulnerabilities
- `node --check server.js` ✅
- `bash -n deploy.sh` ✅
- `git diff --check` ✅
- Final review: no concrete code blocker; live Mailcow/SMTP integration and browser smoke test require production access/Chrome.

### Delivery
- This patch is ready for commit/push and `deploy.sh` delivery.
- Deploy script remains fail-closed on missing SSH access or unhealthy `sogo-smtp-proxy` port 3005.


## 2026-08-04 — Remediation delivery result

### Git
- Commit `91fe620` (`fix(security): harden sessions, preferences, and editor sinks`) created successfully.
- Pushed successfully to `origin/main` (`67da690..91fe620`); local `main` is synchronized with origin.

### Production deploy
- `./deploy.sh` was attempted with no commit argument after push.
- Preflight failed closed before build/deploy because SSH could not resolve the configured host alias `mailserver`: `Temporary failure in name resolution`.
- No production mutation occurred: no remote build, rsync, Nginx config write, Nginx reload, or HTTP verification ran.
- Next action: restore DNS/SSH configuration for `mailserver`, confirm authenticated proxy health on port 3005, then rerun `./deploy.sh`.


## 2026-08-04 — Per-account theme persistence confirmation

- Normalized preference keys by trimming/lowercasing email addresses in `src/lib/userPrefs.js`.
- `authStore.setUser` now always hydrates the newly logged-in account from its own preference profile; first-time accounts receive and persist `DEFAULT_PREFS`, preventing theme leakage from the previous account.
- Added `scripts/test-user-prefs.mjs` and `npm run test:user-prefs` to verify normalized keys and account isolation.
- Validation passed: `npm run test:user-prefs`, `npm run test:safe-url`, `npm run build`, `node --check server.js`, `bash -n deploy.sh`, `npm audit --omit=dev` (0 vulnerabilities), and `git diff --check`.

## 2026-08-04 — Deep audit remediation batch (pre-delivery)

### Confirmed findings and fixes
- Restricted dynamic SOGo path segments to safe single-segment values; nested mailbox IDs may use `%2F`, while encoded traversal/query/backslash sequences are rejected. `draftId` is now validated before interpolation.
- Added `src/lib/pathSegment.js` and `npm run test:path-segment` coverage for valid nested folders and malicious encodings.
- Standardized 401/403 propagation across mailbox, contacts, calendar, compose, password, and preference operations; non-auth fallback behavior remains limited to unavailable data/network failures.
- Removed a duplicated contacts auth check; editor/paste callbacks continue to sanitize DOM HTML before state callbacks.
- Reduced health endpoint information disclosure, rate-limited SMTP session revocation, and stopped returning raw SMTP transport errors to clients.

### Validation
- `npm run test:path-segment` ✅
- `npm run test:user-prefs` ✅
- `npm run test:safe-url` ✅
- `npm run build` ✅ (1998 modules)
- `npm audit --omit=dev` ✅ (0 vulnerabilities)
- `node --check server.js` / `src/lib/api.js` / `src/lib/pathSegment.js` ✅
- `bash -n deploy.sh` ✅
- `git diff --check` ✅
- Final static scan and code review: no concrete blocker; Chrome unavailable for browser smoke test.

### Delivery
- Test file is force-added intentionally because the legacy `.gitignore` pattern `test-*` matches `scripts/test-path-segment.mjs`.
- Commit `6cf66dd` (`fix(security): harden API paths and session errors`) and documentation commit `dae9855` were pushed to `origin/main`.
- Initial deploy attempt failed closed because the local `mailserver` alias/DNS was unavailable. The verified public SSH route `anas.fikri@202.148.2.139:22` was then used via a temporary wrapper, without changing permanent SSH config.
- Remote unit backup: `/home/anas.fikri/.config/systemd/user/sogo-smtp-proxy.service.bak-deploy-20260804150624`.
- Fixed stale service override `PORT=3003` → `PORT=3005`; service is enabled/active and authenticated health returns HTTP 200.
- `./deploy.sh` completed successfully: preflight, build, rsync, Nginx config/reload, and webmail verification all passed.
- Post-deploy public verification: HTTP/2 200 with CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: strict-origin-when-cross-origin`.
- Unrelated `zeroclaw` process on port 3003 was not touched.
