# Verified Application Map

## Audit

- Audited At: 2026-08-04
- Active frontend: `src/` — React 19 SPA (Vite build, base `/webmail/`)
- Backend/API: `server.js` — Express 5 proxy (prod port 3005)
- Knowledge graph project: n/a

## Verified Surfaces

### Frontend routes (BrowserRouter, basename `/webmail`)
- `/login` → LoginPage (SOGo `/SOGo/connect` + SMTP session registration)
- `/mail` → MailPage (folders, message list, search, conversation view, bulk actions, auto-archive rules, flag colors, swipe actions)
- `/calendar` → CalendarPage (events via `/SOGo/.../Calendar/eventsblocks`)
- `/contacts` → ContactsPage (personal + GAL via `/Contacts/personal/view`)
- `/settings` → PreferencesPage (change password, identity, signature editor, prefs from `/api/preferences` DB endpoint)
- `/stats` → StatsPage, `/rules` → RulesPage (client-side, localStorage-backed)
- Route guard: AppLayout redirects to `/login` when unauthenticated; session-expiry watcher in `App.jsx`.

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

## Partial or Missing Surfaces

- `/api/*` requires the SMTP proxy (server.js) + live Mailcow; dev preview without backend shows UI but API calls fail.
- Compose attachment upload button is disabled ("belum didukung").
- `sogo_test.py` (contained a live password) removed from the tree on 2026-08-04; still present in history — password rotation + `git filter-repo` scrub recommended.
- Production deploy of the 2026-08-04 security batch is PENDING — mailserver SSH unreachable from the dev network.

## Agent Rules

- Verify roadmap items against migrations, models, routes, controllers, UI, and tests.
- Update this map when an implementation surface changes.
