# Verified Application Map

## Audit

- Audited At: 2026-08-19 (current code and delivery status reconciled; security hardening + image-proxy LIVE via `deploy-mail`)
- Active frontend: `src/` — React 19 SPA (Vite build, base `/webmail/`)
- Backend/API: `server.js` — Express 5 proxy (prod port 3005), plus `GET /api/image-proxy` (anti tracking-pixel)
- Migration portal: `/home/anas.fikri/migration-portal` — Express SPA at port 3007, nginx proxy via `site.migration.custom`
- Knowledge graph project: n/a

## Verified Surfaces

### Frontend routes (BrowserRouter, basename `/webmail`)
- `/login` → LoginPage (SOGo `/SOGo/connect` + SMTP session registration)
- `/mail` → MailPage (folders, message list, search, conversation view, sort toggle, bulk actions, auto-archive rules, flag colors, swipe actions)
- `/calendar` → CalendarPage (events via `/SOGo/.../Calendar/eventsblocks`)
- `/contacts` → ContactsPage (personal + GAL via `/Contacts/personal/view`)
- `/settings` → PreferencesPage (change password, identity, signature editor, theme color picker, compose mode, reply placement, confirm delete — prefs from `/api/preferences` DB endpoint)
- `/stats` → StatsPage, `/rules` → RulesPage (client-side, localStorage-backed)
- Route guard: AppLayout redirects to `/login` when unauthenticated; session-expiry watcher in `App.jsx`.

### Migration Portal routes (Express SPA, base `/migrate`)
- `/migrate/admin/` — Admin login + dashboard (auth: bcryptjs vs Mailcow `admin` table)
- `/migrate/user/?token=xxx` — End-user sync page (token-based auth, 7-day expiry)
- `/migrate/api/auth/login|logout|check` — Session management (HMAC cookie)
- `/migrate/api/admin/users|generate-tokens|blast-email` — Admin operations
- `/migrate/api/start|me|progress` — imapsync lifecycle (start, status poll, SSE stream)

### Backend endpoints (all gated by `X-Api-Key`, timing-safe compare)
- `GET  /api/health` — health for deploy preflight
- `POST /api/auth/smtp` / `DELETE /api/auth/smtp` — in-memory SMTP session tokens (8h TTL, 30m idle)
- `GET  /api/preferences?email=...` — reads `sogo_user_profile` from Mailcow MySQL (parameterized)
- `POST /api/send` — nodemailer SMTP send (Zod validated, session-based)
- `GET  /api/image-proxy?url=...` — server-side image fetch (anti tracking-pixel); SSRF-guarded (block private/reserved IP, DNS-pin, redirect re-validate, image-only, 5MB/10s cap, rate-limit). Placed BEFORE `requireApiKey` because `<img>` cannot send headers.

### Security controls (verified)
- DOMPurify on email body, paste, and compose-send; `safeUrl.js` restricts mail resources to `/SOGo/` paths.
- Reply/forward quotes and print window escape all header values (XSS fix 2026-08-04).
- CSP (`img-src 'self' data:` — fail-closed) + object-src 'none' + frame-src 'self' + worker-src 'self' + Permissions-Policy + nosniff + X-Frame-Options + Referrer-Policy in nginx config for `/webmail`.
- Rate limits keyed by real client IP (X-Real-IP from trusted nginx peer), per-route buckets + `Retry-After`.
- Remote image proxy (`src/lib/imageProxy.js` + `/api/image-proxy`) rewrites external `<img>` in rendered email; `src/lib/ssrfGuard.js` blocks internal IPs (fail-closed).
- Email header injection hardened: `src/lib/emailValidation.js` rejects ALL control chars (0x00–0x1F + DEL).
- SMTP session cap per user + configurable TTL/idle via env (`SMTP_SESSION_*`).
- ErrorBoundary hides technical details in production (info-disclosure fix).
- npm audit: 0 vulnerabilities.
- UI preferences (theme, accent color, sort order, conversation view) persisted per account in normalized `localStorage` key `pcp_prefs_<lowercase-email>` (`src/lib/userPrefs.js`), initialized on first successful login, loaded on subsequent login, and isolated across logout/account switches.

## Partial or Missing Surfaces

- `/api/*` requires the SMTP proxy (server.js) + live Mailcow; dev preview without backend shows UI but API calls fail.
- Compose attachment upload button is disabled ("belum didukung").
- `sogo_test.py` (contained a live password) removed from the tree on 2026-08-04; history scrubbed via `git filter-repo` (history-scrub module) and password rotated.
- **Migration Portal** (2026-08-05): auth fixed (bcryptjs), domain mapped to `pcpexpress.com`, auto-create mailbox with quota=0, sync_sogo_passwords trigger. Server restarted with correct env. End-user sync validation (G-002.S-002) still PENDING real-credential browser test.
- Current delivery status: production deploy is **LIVE** via SSH alias `deploy-mail` (`SERVER=deploy-mail ./deploy.sh`). Latest verified batch (2026-08-19): OWASP hardening + image-proxy + server.js rate-limit/session hardening + deploy.sh single-source/backend-deploy — all LIVE, webmail HTTP 200, `/api/image-proxy` SSRF 403 + external image 200.
- Current workspace verification: repository is clean and synced with `origin/main` (HEAD `2feb96c`); full regression tests (15/15), Vite build, production dependency audit (0 vuln), Node/shell syntax, and diff checks pass. Chrome/browser account verification remains unavailable in this environment.

## Agent Rules

- Verify roadmap items against migrations, models, routes, controllers, UI, and tests.
- Update this map when an implementation surface changes.
