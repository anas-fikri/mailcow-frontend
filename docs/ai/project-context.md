# Project Context

Project: sogo-frontend
Project Root: /Users/anasfikri/Documents/Projects/pcpexpress/mailcow/sogo-frontend
Initialized At: 2026-08-01T07:08:00Z
Updated At: 2026-08-05T00:00:00+07:00

## Summary

Modern webmail SPA ("PCP Express Webmail") that replaces the default SOGo UI for
the PCP Express Mailcow server. Live at `https://mail.pcpexpress.co.id/webmail/`.
Modules: Mail (inbox, threads, compose, auto-archive rules, flag colors), Calendar,
Contacts (personal + GAL), Preferences (password, identity, signature, sieve),
Stats, and client-side Rules.

## Stack

- Frontend: React 19 + Vite 8 + Tailwind CSS v4, Zustand (persist via localStorage), TanStack React Query, Framer Motion, Lucide React, **react-router 8.3.0** (migrated from react-router-dom@7.18.2 on 2026-08-04).
- Sanitization: DOMPurify (paste + email body); URL hardening in `src/lib/safeUrl.js`.
- Backend proxy: `server.js` — Express 5 + mysql2 + nodemailer. Runs as systemd user service `sogo-smtp-proxy` on the mailserver host, port **3005** (never 3003/3004 — Control Tower).
- Deploy: `deploy.sh` — authenticated `/api/health` preflight → build → optional commit/push → rsync to mailcow nginx (`/data/docker-data/mailcow/data/web/webmail`) → nginx reload.
- Nginx: `configs/site.webmail.custom` (mirrored by `deploy.sh setup_nginx`).

## Constraints

- Never commit `.env*`, API keys, or credentials. `VITE_API_KEY` is injected at build time only (read from mailserver `.env` by deploy.sh when not set locally).
- SOGo proxy port is 3005; do not reuse 3003/3004 (Control Tower API/MCP).
- App is a client-only BrowserRouter SPA at base path `/webmail/` — no SSR/RSC/loaders/actions.
- The backend (`server.js`) requires a live Mailcow MySQL container + env secrets; it is NOT runnable in a bare dev worktree. The Vite dev server runs standalone.
- Email HTML is untrusted input: render only through DOMPurify; all header values escaped before any `innerHTML`/`document.write` sink.

## Conventions

- All SOGo API calls live in `src/lib/api.js` (single file); SOGo endpoints are same-origin (`/SOGo/...`) in production, proxied by Vite in dev.
- Zustand stores in `src/store/`; only non-secret prefs are persisted (never SMTP tokens).
- Indonesian UI strings and comments are the norm.
- Deployment rules are enforced by `deploy.sh` preflight (fails closed if SOGo proxy unhealthy). Current login hardening is pushed but not live until the preflight can reach the Mailcow host; do not bypass the guardrail.
