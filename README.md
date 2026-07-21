# PCP Express Webmail — SOGo React Frontend

Modern webmail interface for PCP Express Mailcow server. Replaces default SOGo UI with a clean, mobile-first SPA built on React + Vite.

**Live:** `https://mail.pcpexpress.co.id/webmail/`

## Features

- **Mail** — Inbox, threads, message reader, compose with rich text & attachments
- **Calendar** — Daily/weekly/monthly views, event creation
- **Contacts** — Personal address book + Global Address Book (GAL)
- **Preferences** — Password change, identity, signature, sieve filters, auto-reply

All modules connect to SOGo API in real-time — no mock data.

## Tech Stack

| Layer | Stack |
|-------|-------|
| Framework | React 19 + Vite 5 |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| Data | TanStack React Query |
| UI | Framer Motion, Lucide React |
| Backend Proxy | Express + Nodemailer (SMTP) — systemd service di host |
| Deploy | Rsync → Mailcow Nginx |

## Quick Start

```bash
npm install
npm run dev          # Vite dev (port 5173)
npm run dev:server   # SMTP proxy (port 3001)
npm run dev:all      # Both simultaneously
```

## Deploy

One command:
```bash
./deploy.sh                          # build + deploy only
./deploy.sh "feat: add login page"   # build + commit + push + deploy
```

Manual:
```bash
npm run build
rsync -av --delete dist/ mailserver:/data/docker-data/mailcow/data/web/webmail/
ssh mailserver "docker exec mailcow-nginx-mailcow-1 nginx -s reload"
```

## SMTP Proxy (Production)

Server.js jalan sebagai systemd user service di host Mailcow:
```bash
ssh mailserver "systemctl --user status sogo-smtp-proxy"
```

Proxy via Nginx `location ~ ^/api/(send|health)$` → `172.25.1.1:3003`.

## Repository

```
origin  https://gitlab.pcpexpress.com/devops-team/mailcow-frontend.git
```

Push via HTTPS (SSH port 22 diblok firewall). Credential disimpan di macOS Keychain.

## Project Structure

```
src/
├── components/
│   ├── layout/     # Sidebar, BottomNav, AppLayout
│   └── mailer/     # ComposeModal, MessageReader
├── pages/          # LoginPage, MailPage, CalendarPage, ContactsPage, PreferencesPage
├── lib/api.js      # All SOGo API calls (single file)
├── store/          # Zustand stores
├── App.jsx
└── main.jsx
docs/iso/           # ISO-SDLC documentation (PRD, ARD, Roadmap, Deployment Guide)
configs/            # Nginx config files
deploy.sh           # Automation script
server.js           # SMTP proxy backend
```

## Documentation

- [Deployment Guide](docs/iso/04_Deployment_Guide.md) — full ops manual
- [PRD](docs/iso/01_PRD_alignment.md) — product requirements
- [ARD](docs/iso/02_ARD_tech_spec.md) — architecture & tech spec
- [Roadmap](docs/iso/03_Roadmap_Tasks.md) — task breakdown
