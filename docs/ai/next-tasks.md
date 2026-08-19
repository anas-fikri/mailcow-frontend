# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-19T13:47:29Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Deploy via SERVER=deploy-mail ./deploy.sh (restart sogo-smtp-proxy + nginx reload)
- Why: Explicit next step recorded on active task.
- Source: current-task.md

## 2. [HIGH] Resolve risk: deploy.sh setup_nginx() dulu hardcode config LAMA (img-src https:, tanpa object-src/frame-src/Permissions-Policy/image-proxy) → kalau di-deploy akan REVERT hardening. Sudah disinkronkan.
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 3. [HIGH] Run or verify validation: 14/14 test PASS · npm run build OK · node --check server.js OK · bash -n deploy.sh OK · git diff --check OK
- Why: Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 4. [MEDIUM] Follow up on discovered knowledge: deploy.sh setup_nginx() menulis konfig nginx HARDCODED (heredoc), bukan membaca configs/site.webmail.custom — kalau dua sumber ini beda, deploy akan menimpa hardening di server. Harus selalu disinkronkan keduanya.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 5. [MEDIUM] Advance goal: Sub-goal G-001.S-002 — Documentation currency
- Why: Goal remains ACTIVE — historical deployment records are complete, but current login delivery status must remain synchronized..
- Source: goals.md

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
