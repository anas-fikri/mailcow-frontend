# Current Task

Status: ACTIVE (security audit complete; deployment pending)
Task ID: sogo-frontend-audit-2026-08-03
Started At: 2026-08-03
Updated At: 2026-08-03
Project Root: /Users/anasfikri/Documents/Projects/pcpexpress/mailcow/sogo-frontend

## Objective
Audit sogo-frontend for bugs and vulnerabilities, apply verified fixes, validate locally, and prepare a safe production deployment.

## Files Involved
- `deploy.sh`
- `vite.config.js`
- `configs/site.webmail.custom`
- `configs/sogo-smtp-proxy.service`
- `.env.production.example`
- `README.md`
- `docs/iso/04_Deployment_Guide.md`
- `docs/ai/decisions.md`
- `docs/ai/handoff.md`

## Completed
- Dedicated SOGo SMTP proxy port standardized on `3005`; Control Tower ports `3003` and `3004` are not reused.
- Nginx API route narrowed and anchored to the supported SOGo endpoints.
- Deploy preflight validates the remote SOGo health endpoint before build/commit/push/deploy.
- Production API key is read only during build from the remote service environment when no local `VITE_API_KEY` is supplied.
- Vite production base path uses `/webmail/`.

## Validation
- `bash -n deploy.sh` passed.
- `node --check server.js` passed.
- `npm run build` passed with a non-secret validation key.
- `git diff --check` passed.
- Real preflight correctly stopped because `sogo-smtp-proxy` is inactive and port `3005` is not listening.

## Deployment Status
Commit completed locally; push is pending GitLab credential access. Production deployment is intentionally pending because the user chose not to change or restart production services. Before deployment, install/activate `configs/sogo-smtp-proxy.service` on `mailserver`, then rerun `./deploy.sh`.

## Risks
- Do not point SOGo Nginx routes to Control Tower ports `3003` or `3004`.
- Do not commit `.env.production` or expose the production API key.


## Security Audit 2026-08-03

- Fixed unsafe editor/mail URL sinks with `src/lib/safeUrl.js`; tests cover executable schemes, protocol-relative URLs, external blocking for SOGo resources, and encoded attribute characters.
- Removed SOGo cookie/session and proxy-header value logging from `vite.config.js`.
- Upgraded `react-router-dom` to `7.18.2`. `npm audit` still reports the RSC-mode CSRF advisory (`GHSA-qwww-vcr4-c8h2`); this SPA uses `BrowserRouter` only and has no SSR/RSC/data actions.
- Validation: `npm run test:safe-url`, `node --check server.js`, `bash -n deploy.sh`, `npm run build`, and `git diff --check` passed.
