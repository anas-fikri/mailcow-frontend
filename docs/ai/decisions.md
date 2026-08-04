# Decision Log

## 2026-08-01T07:08:00Z Initial AI Protocol Setup
Status: Accepted
Context: Standardized AI-readable project context was initialized.
Decision: Store shared project context under `docs/ai/` and automation config under `.ai-toolkit/project.env`.
Consequences: Any AI tool can resume work by reading repository-local context first.


## 2026-08-03 — Isolate SOGo SMTP Proxy from Control Tower

- **Decision:** Use host port `3005` for `sogo-smtp-proxy`; reserve `3003` for Control Tower API and `3004` for Control Tower MCP.
- **Reason:** Production Nginx had been routing SOGo `/api/*` to Control Tower MCP on `3004`, while the SOGo service was inactive.
- **Guardrail:** `deploy.sh` performs an authenticated `/api/health` preflight on the dedicated port before build, commit, push, or rsync.
- **Credential handling:** The browser build receives `VITE_API_KEY` from the deployment environment; when absent locally, `deploy.sh` reads `API_KEY` from the remote SOGo service `.env` only during the build and never writes it to Git.
- **Operational constraint:** This task does not install, restart, or modify production services.


## 2026-08-03 — Webmail URL and Session-Log Hardening

- **Decision:** Treat editor URLs and SOGo attachment/inline-image URLs as untrusted input. Editor links are created through DOM APIs; mail resources are restricted to `/SOGo/` paths and unsafe schemes are rejected.
- **Decision:** Never log SOGo cookie values or upstream proxy headers. The dev proxy may log only request/response metadata and a boolean session-presence flag.
- **Dependency:** `react-router-dom` is pinned to `7.18.2`, the latest available release. npm's remaining high advisory is RSC/SSR-specific; this app is a client-only `BrowserRouter` SPA with no loaders/actions/SSR/RSC. Revisit before adopting those features.

## 2026-08-04 — Security Audit Fixes (committed, deploy pending)

- **React Router v8 migration:** `react-router-dom@7.18.2` → `react-router@8.3.0` (imports in App/LoginPage/AppLayout/Sidebar/BottomNav switched to `react-router`). Clears `GHSA-qwww-vcr4-c8h2`; `npm audit` = 0. v8 dropped the `react-router-dom` shim for the v7 line; the declarative APIs used (BrowserRouter, Routes, Route, Navigate, NavLink, Outlet, useNavigate) are unchanged.
- **XSS hardening (MessageReader):** print window and reply/forward quote are DOM sinks; all email header values (from/to/cc/date/subject — attacker-controlled display names) are escaped, and quoted bodies use the DOMPurify-sanitized `cleanHtml` instead of raw SOGo HTML.
- **Rate limiting:** key by real client IP — `X-Real-IP` is trusted only when the socket peer is loopback or a docker-bridge address (nginx overwrites it; direct external clients cannot spoof). Fixes the shared-bucket bug where all users behind nginx shared one limit.
- **API key comparison:** `crypto.timingSafeEqual` with a length guard.
- **CSP for /webmail:** `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' ...; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` + nosniff/XFO/Referrer-Policy, mirrored in `configs/site.webmail.custom` and `deploy.sh setup_nginx`. Built index.html has no inline scripts, so `script-src 'self'` is safe.
- **CRITICAL — credential leak:** `sogo_test.py` committed on origin/main contained a live plaintext password (`anas.fikri@pcpexpress.co.id`). Deleted from the tree (b7f7fa0). Decision: rotate the password and run `git filter-repo` history scrub; do not restore the file (it is gitignored locally and was removed from the worktree).

## 2026-08-04 — Per-account UI preferences

- **Decision:** UI preferences (theme light/dark, `themeColor`, `sortAsc`, `conversationView`) are stored per account in `localStorage` key `pcp_prefs_<email>` (via new `src/lib/userPrefs.js`, same pattern as `autoArchive`/`flagColors`). `setUser` loads the account's stored prefs on login; `clearUser` no longer resets them; every preference setter persists to the active account.
- **Why:** prefs previously lived in one global zustand key and were reset on logout/login/session-expiry, and accounts on a shared browser overwrote each other's settings.
- **Behavior notes:** a brand-new account (no stored prefs) inherits the current device theme until the user changes something; the global `pcp-auth` persist still holds a device-level fallback for the anonymous login screen.

## 2026-08-04 — Production deploy of hardening + runtime bug fixes

- **Decision:** Deployed the accumulated hardening/fix batch to production (origin/main @ `e9ecad5`). Steps taken: activated `sogo-smtp-proxy` (was inactive since 2026-07-27), corrected its `.env` `PORT=3004 → 3005` (3004 is Control Tower MCP — violates the guardrail and caused the service to crash-loop on EADDRINUSE), updated the host `server.js` (backup kept), ran `./deploy.sh` (preflight → build → rsync → nginx config with CSP headers → reload → verify 200).
- **deploy.sh bug:** `get_production_api_key` had unescaped quotes in an inline ssh string — awk always failed at build time (masked previously because preflight failed first). Fixed with the heredoc pattern used by `preflight_sogo_proxy`.
- **Deploy mechanics note:** `deploy.sh` deploys `dist/` + nginx config only; the host `server.js` is updated manually via scp (keep backup `server.js.bak-YYYYMMDD`).
