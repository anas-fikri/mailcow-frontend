# Verified Application Map

## Audit

- Audited At: 2026-08-05 (current code and delivery status reconciled; migration portal added)
- Active frontend: `src/` — React 19 SPA (Vite build, base `/webmail/`)
- Backend/API: `server.js` — Express 5 proxy (prod port 3005)
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

### Security controls (verified)
- DOMPurify on email body, paste, and compose-send; `safeUrl.js` restricts mail resources to `/SOGo/` paths.
- Reply/forward quotes and print window escape all header values (XSS fix 2026-08-04).
- CSP + nosniff + X-Frame-Options + Referrer-Policy headers in nginx config for `/webmail`.
- Rate limits keyed by real client IP (X-Real-IP from trusted nginx peer).
- npm audit: 0 vulnerabilities (react-router 8.3.0).
- UI preferences (theme, accent color, sort order, conversation view) persisted per account in normalized `localStorage` key `pcp_prefs_<lowercase-email>` (`src/lib/userPrefs.js`), initialized on first successful login, loaded on subsequent login, and isolated across logout/account switches.

## Partial or Missing Surfaces

- `/api/*` requires the SMTP proxy (server.js) + live Mailcow; dev preview without backend shows UI but API calls fail.
- Compose attachment upload button is disabled ("belum didukung").
- `sogo_test.py` (contained a live password) removed from the tree on 2026-08-04; still present in history — password rotation + `git filter-repo` scrub recommended.
- Production deploy of the 2026-08-04 hardening/fix batch is **historical COMPLETE/LIVE evidence**.
- **Migration Portal** (2026-08-05): auth fixed (bcryptjs), domain mapped to `pcpexpress.com`, auto-create mailbox with quota=0, sync_sogo_passwords trigger. Server restarted with correct env.
- Current delivery status: robust login commits `88dcd9c` and `fe9be0b` are pushed, but deploy is **BLOCKED/NOT LIVE** because `mailserver` does not resolve locally and all tested production SSH/web ports timed out. No production mutation occurred for those commits.
- Current workspace verification: repository is clean and synced with `origin/main`; login/full regression tests, Vite build, production dependency audit, Node syntax, shell syntax, and diff checks pass. Chrome/browser account verification remains unavailable.

## Agent Rules

- Verify roadmap items against migrations, models, routes, controllers, UI, and tests.
- Update this map when an implementation surface changes.
