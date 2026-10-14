---
status: accepted
date: 2026-08-04
---

# Security Audit Fixes (committed; deployment later completed)

- **React Router v8 migration:** `react-router-dom@7.18.2` → `react-router@8.3.0` (imports in App/LoginPage/AppLayout/Sidebar/BottomNav switched to `react-router`). Clears `GHSA-qwww-vcr4-c8h2`; `npm audit` = 0. v8 dropped the `react-router-dom` shim for the v7 line; the declarative APIs used (BrowserRouter, Routes, Route, Navigate, NavLink, Outlet, useNavigate) are unchanged.
- **XSS hardening (MessageReader):** print window and reply/forward quote are DOM sinks; all email header values (from/to/cc/date/subject — attacker-controlled display names) are escaped, and quoted bodies use the DOMPurify-sanitized `cleanHtml` instead of raw SOGo HTML.
- **Rate limiting:** key by real client IP — `X-Real-IP` is trusted only when the socket peer is loopback or a docker-bridge address (nginx overwrites it; direct external clients cannot spoof). Fixes the shared-bucket bug where all users behind nginx shared one limit.
- **API key comparison:** `crypto.timingSafeEqual` with a length guard.
- **CSP for /webmail:** `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' ...; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` + nosniff/XFO/Referrer-Policy, mirrored in `configs/site.webmail.custom` and `deploy.sh setup_nginx`. Built index.html has no inline scripts, so `script-src 'self'` is safe.
- **CRITICAL — credential leak:** `sogo_test.py` committed on origin/main contained a live plaintext password (account credential). Deleted from the tree (b7f7fa0). Decision: rotate the exposed password and run `git filter-repo` history scrub; do not restore the file (it is gitignored locally and was removed from the worktree).

