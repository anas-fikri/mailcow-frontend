# Handoff Log

## 2026-08-01T07:08:00Z Initial Setup
- Project context scaffold created.
- Next step: update `project-context.md` and start the first task with `ai-start "task name"`.

## 2026-08-01T07:08:00Z
- Status: ACTIVE
- Objective: No active task.
- Summary: Prepared commit: fix: ESM require fix, FOLDER_TYPE_LABELS dedup, StatsPage dynamic calc, ComposeModal signature fix, sendMessage indent
- Branch: main
- Changed Files:
-  M server.js
-  M src/components/mailer/ComposeModal.jsx
-  M src/lib/api.js
-  M src/pages/LoginPage.jsx
-  M src/pages/StatsPage.jsx
- ?? .ai-toolkit/
- ?? AGENTS.md
- ?? docs/ai/


## 2026-08-03 — SOGo Frontend Deployment Audit and Safe Preparation

### Summary
Audited `/Users/anasfikri/Documents/Projects/pcpexpress/mailcow/sogo-frontend` on `macanas`. Found a production routing conflict: `site.webmail.custom` pointed SOGo API requests to Control Tower MCP port `3004`; Control Tower API already owns `3003`; `sogo-smtp-proxy` was inactive. Prepared a safe fix without changing production services.

### Changes
- Standardized SOGo proxy port to `3005` in the Nginx template, deploy-generated config, and systemd template.
- Restricted and anchored Nginx API routes to `send`, `health`, `preferences`, and `auth/smtp`.
- Fixed deploy defaults for the real GitLab project and webmail URL.
- Fixed the deploy push variable typo (`git_url`).
- Added authenticated preflight before build/commit/push/deploy; it fails closed when SOGo is unavailable.
- Build injects `VITE_API_KEY` from the environment or reads remote `API_KEY` transiently; no secret is stored in source.
- Fixed Vite base path to `/webmail/` and production SOGo default URL.
- Added production env example and deployment/service documentation.

### Validation
- `bash -n deploy.sh` ✅
- `node --check server.js` ✅
- `npm run build` ✅ with a dummy validation key
- `git diff --check` ✅
- Real preflight ✅ fails safely: `mailserver:3005` refused connection; no commit/push/rsync/restart occurred during the test.

### Git / Deployment
- Existing local branch was already one commit ahead of `origin/main`; this task adds the audit fix commit. Push is pending because the macOS Keychain credential is unavailable in the non-interactive SSH session.
- Production deploy is **PENDING** by user choice. `sogo-smtp-proxy.service` must be installed/activated on `mailserver` first; then run `./deploy.sh` from the Mac workspace.
- No production service, Nginx config, or remote webmail files were modified in this task.
