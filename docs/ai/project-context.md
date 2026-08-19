# Project Context

Project: sogo-frontend
Project Root: /home/anas.fikri/mailcow-frontend
Initialized At: 2026-08-01T07:08:00Z
Updated At: 2026-08-19T14:20:00Z

## Summary

Modern webmail SPA ("PCP Express Webmail") that replaces the default SOGo UI for
the PCP Express Mailcow server. Live at `https://mail.pcpexpress.co.id/webmail/`.
Modules: Mail (inbox, threads, compose, auto-archive rules, flag colors, sort,
conversation view), Calendar, Contacts (personal + GAL), Preferences (password,
identity, signature, sieve, **theme color picker**, mail prefs), Stats, and
client-side Rules.

**Sibling project:** Migration Portal at `https://mail.pcpexpress.co.id/migrate/admin/`
— IMAP sync dashboard running on `192.168.10.200:3007` (proxied via nginx). Auth
via bcryptjs against Mailcow `admin` table. Auto-creates mailboxes on Mailcow with
same password, triggers `sync_sogo_passwords.sh`.

## Stack

- Frontend: React 19 + Vite 8 + Tailwind CSS v4, Zustand (persist via localStorage), TanStack React Query, Framer Motion, Lucide React, **react-router 8.3.0** (migrated from react-router-dom@7.18.2 on 2026-08-04).
- Sanitization: DOMPurify (paste + email body); URL hardening in `src/lib/safeUrl.js`.
- Backend proxy: `server.js` — Express 5 + mysql2 + nodemailer. Runs as systemd user service `sogo-smtp-proxy` on the mailserver host, port **3005** (never 3003/3004 — Control Tower). Termasuk endpoint `GET /api/image-proxy` (anti tracking-pixel, SSRF-guarded) dan modul import lokal `src/lib/{ssrfGuard,emailValidation}.js`.
- Deploy: `deploy.sh` — authenticated `/api/health` preflight → build → optional commit/push → rsync `dist/` → nginx reload → deploy backend `server.js`+`src/lib` (dengan change-detection md5, restart service hanya saat berubah) → verify webmail + `/api/image-proxy`.
- Nginx: `configs/site.webmail.custom` adalah **single source of truth**; `deploy.sh setup_nginx` membacanya langsung + substitusi port (tidak lagi heredoc terpisah).

## Constraints

- Never commit `.env*`, API keys, or credentials. `VITE_API_KEY` is injected at build time only (read from mailserver `.env` by deploy.sh when not set locally).
- SOGo proxy port is 3005; do not reuse 3003/3004 (Control Tower API/MCP).
- App is a client-only BrowserRouter SPA at base path `/webmail/` — no SSR/RSC/loaders/actions.
- The backend (`server.js`) requires a live Mailcow MySQL container + env secrets; it is NOT runnable in a bare dev worktree. The Vite dev server runs standalone.
- Email HTML is untrusted input: render only through DOMPurify; all header values escaped before any `innerHTML`/`document.write` sink.
- Remote images in rendered email are proxied server-side via `/api/image-proxy` (anti tracking-pixel). CSP `img-src 'self' data:` is fail-closed: any external image that escapes rewriting is blocked, not loaded (IP never leaks).

## Conventions

- All SOGo API calls live in `src/lib/api.js` (single file); SOGo endpoints are same-origin (`/SOGo/...`) in production, proxied by Vite in dev.
- Zustand stores in `src/store/`; only non-secret prefs are persisted (never SMTP tokens).
- Theme: dark/light toggle + **8 accent color presets** via CSS `var(--theme-hue)`. Persisted per-account.
- Deployment rules are enforced by `deploy.sh` preflight (fails closed if SOGo proxy unhealthy). Production deploy uses SSH alias `deploy-mail` (`SERVER=deploy-mail ./deploy.sh`); the legacy `mailserver` alias no longer resolves locally.
