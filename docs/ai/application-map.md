# Verified Application Map

## Audit

- Audited At: 2026-08-04 (status rechecked after Round 3 deployment)
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
- UI preferences (theme, accent color, sort order, conversation view) persisted per account in normalized `localStorage` key `pcp_prefs_<lowercase-email>` (`src/lib/userPrefs.js`), initialized on first successful login, loaded on subsequent login, and isolated across logout/account switches.

## Partial or Missing Surfaces

- `/api/*` requires the SMTP proxy (server.js) + live Mailcow; dev preview without backend shows UI but API calls fail.
- Compose attachment upload button is disabled ("belum didukung").
- `sogo_test.py` (contained a live password) removed from the tree on 2026-08-04; still present in history — password rotation + `git filter-repo` scrub recommended.
- Production deploy of the 2026-08-04 hardening/fix batch is **COMPLETE and LIVE per the Round 3 deployment handoff** (application code @ `e9ecad5`; documentation reconciliation @ `67da690`; not re-probed from this workspace): `sogo-smtp-proxy` was active on port 3005, host `server.js` updated, CSP/security headers verified on https://mail.pcpexpress.co.id/webmail/, and `/api/health` returned HTTP 200.
- Current workspace verification before this documentation update: repository was clean and synced with `origin/main`; safe-url test, production dependency audit, Node syntax check, shell syntax check, and diff check pass. Local Vite build requires `npm install` first because `node_modules` is absent; documentation edits are currently uncommitted for review.

## Agent Rules

- Verify roadmap items against migrations, models, routes, controllers, UI, and tests.
- Update this map when an implementation surface changes.
