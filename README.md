# Mailcow Webmail

A modern, mobile-first webmail frontend for [mailcow](https://mailcow.email/) /
[SOGo](https://www.sogo.nu/). It replaces the stock SOGo UI with a fast React SPA
while keeping SOGo as the backend for mail, calendar, and contacts.

> The UI is currently in **Indonesian (Bahasa Indonesia)**. Translations are welcome — see
> [CONTRIBUTING.md](CONTRIBUTING.md).

## Features

- **Mail** — conversation view, Outlook-style reading pane, rich-text compose,
  attachments with in-browser preview (PDF, images, DOCX, XLSX, ZIP), undo-send and
  scheduled send, flags/colours, server-side Sieve rules, junk handling
- **Calendar** — day/week/month views, event create/edit, drag-and-drop
- **Contacts** — personal address book and the mailcow Global Address List (GAL)
- **Preferences** — password change, identities, per-account signatures synced
  to SOGo, auto-reply, layout preferences per account
- **Privacy & security** — external images go through an SSRF-guarded image
  proxy (blocks tracking pixels), strict CSP, phishing heuristics, sanitised HTML
  rendering (DOMPurify)

## Architecture

```
Browser ──▶ nginx (mailcow) ──┬──▶ /SOGo/*          SOGo (mail, calendar, contacts)
                              ├──▶ /webmail/*       static SPA (this repo, built with Vite)
                              └──▶ /api/*           server.js — Node/Express proxy on the host
                                                     (SMTP send queue, Sent copy via IMAP,
                                                      preferences in mailcow MySQL, image proxy)
```

The SPA talks to SOGo's JSON API directly on the same origin. `server.js` adds
what SOGo does not offer to a custom frontend: reliable sending (undo/scheduled
send queue), a server-side copy to *Sent*, and the image proxy.

## Requirements

- A working mailcow-dockerized installation
- Node.js ≥ 20 (on your machine for building and on the mailcow host for `server.js`)

## Quick start (development)

```bash
git clone https://github.com/anas-fikri/mailcow-frontend.git
cd mailcow-frontend
cp .env.example .env.local     # set VITE_SOGO_BASE_URL to your mailcow host
npm ci
npm run dev                    # Vite on http://localhost:5173/webmail/
```

The Vite dev server proxies `/SOGo` to `VITE_SOGO_BASE_URL`, so you can log in with
a real mailcow account. To run the backend locally as well:

```bash
cp .env.server.example .env.server   # fill SMTP_HOST, API_KEY, DB settings
node --env-file=.env.server server.js  # API on :3001 (PORT); Vite proxies /api here
```

`server.js` does not read `.env` files itself; in production systemd injects the
variables via `EnvironmentFile=`.

## Configuration

| File | Purpose |
|------|---------|
| [`.env.example`](.env.example) | Build-time frontend settings: branding (`VITE_APP_NAME`, `VITE_ORG_NAME`, `VITE_SUPPORT_EMAIL`, …), SOGo base URL, API key |
| [`.env.server.example`](.env.server.example) | Runtime settings for `server.js`: SMTP/IMAP, session limits, mailcow MySQL, CORS |
| [`configs/site.webmail.custom`](configs/site.webmail.custom) | nginx snippet for mailcow (`data/conf/nginx/`) with CSP and `/api` routes |
| [`configs/sogo-smtp-proxy.service`](configs/sogo-smtp-proxy.service) | systemd *user* unit for `server.js` |

## Deployment

1. **Backend** — copy `server.js`, `package.json`, `package-lock.json` and the
   backend helpers from `src/lib/` (list: `BACKEND_LIB_FILES` in `deploy.sh`) to the mailcow host (e.g. `~/sogo-proxy`), create `.env` from
   `.env.server.example`, run `npm ci --omit=dev`, then install and start the
   systemd unit:

   ```bash
   systemctl --user enable --now sogo-smtp-proxy
   ```

2. **nginx** — copy `configs/site.webmail.custom` to
   `mailcow-dockerized/data/conf/nginx/`, adjust the upstream address/port, and
   reload nginx (`docker compose exec nginx-mailcow nginx -s reload`).

3. **Frontend** — build with your production `.env.production` and copy `dist/`
   to `mailcow-dockerized/data/web/webmail/`:

   ```bash
   npm run build
   rsync -av --delete dist/ mailhost:/opt/mailcow-dockerized/data/web/webmail/
   ```

[`deploy.sh`](deploy.sh) automates these steps over SSH (build on the server from
your Git remote, health checks, nginx sync). Configure it with environment
variables — see the header of the script.

## Monitoring (UX metrics)

The SPA sends anonymous timings (no addresses, subjects or UIDs) to
`POST /api/metrics`; `server.js` aggregates them as Prometheus histograms on
`GET /metrics`, reachable **only from localhost** on the mailcow host:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: webmail-ux
    static_configs:
      - targets: ['127.0.0.1:3005']
```

| Metric (`webmail_ux_*_ms`) | Meaning |
|---|---|
| `boot_to_inbox`, `login_to_inbox` | App start / login submit → first inbox list |
| `folder_switch`, `search` | Folder click / search → results shown |
| `message_open` | Message click → content shown |
| `send` | Send click → accepted by server |
| `web_vital_lcp`, `web_vital_inp`, `web_vital_cls` | Core Web Vitals (CLS ×1000) |
| `api_error` | API failures (`_count`) |

Example Grafana query (p95 message open, 5 min window):
`histogram_quantile(0.95, sum by (le, device) (rate(webmail_ux_message_open_ms_bucket[5m])))`

Histograms are in memory and reset when `server.js` restarts.

## Testing

```bash
npm test          # 120+ unit/contract tests (Node, no browser needed)
npm run build     # production build
```

Browser end-to-end scripts (`scripts/e2e-*.mjs`) need Puppeteer and a real
mailcow test account; they are not part of `npm test`.

## Project structure

```
src/
├── components/   # layout, mailer (compose, reader), rules
├── pages/        # Login, Mail, Calendar, Contacts, Preferences, Rules, Stats
├── lib/          # SOGo API client, parsing, security helpers (pure, unit-tested)
├── store/        # Zustand stores
└── main.jsx
server.js         # backend proxy (Express)
scripts/          # test suite, e2e scripts, fixtures
configs/          # nginx + systemd examples
public/           # static assets, service worker, help page
```

## Contributing & security

- Contributions: [CONTRIBUTING.md](CONTRIBUTING.md) ·
  [Code of Conduct](CODE_OF_CONDUCT.md)
- Vulnerabilities: please report privately — see [SECURITY.md](SECURITY.md)

## License

[MIT](LICENSE). mailcow and SOGo are separate projects with their own licenses;
this project is not affiliated with or endorsed by them.
